// Deterministic movement step shared by the server simulation and client-side prediction.
// Given the same inputs, both sides compute the same position; the server stays authoritative.

import { resolveCircle, type StaticBody } from "./collision";
import { DASH_DISTANCE, DASH_DURATION_MS, PLAYER_RADIUS } from "./constants";
import type { ArenaMap } from "./map";
import { clamp } from "./math";

export interface MoverState {
  x: number;
  y: number;
  /** Remaining dash time in ms. */
  dashRemainingMs: number;
  dashDirX: number;
  dashDirY: number;
}

/** Normalises a raw client movement vector: NaN/Infinity → 0, magnitude clamped to 1. */
export function sanitizeMove(mx: number, my: number): { mx: number; my: number } {
  const x = Number.isFinite(mx) ? clamp(mx, -1, 1) : 0;
  const y = Number.isFinite(my) ? clamp(my, -1, 1) : 0;
  const len = Math.hypot(x, y);
  if (len > 1) return { mx: x / len, my: y / len };
  return { mx: x, my: y };
}

export function sanitizeAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function startDash(state: MoverState, mx: number, my: number, aim: number): void {
  const len = Math.hypot(mx, my);
  state.dashDirX = len > 0.01 ? mx / len : Math.cos(aim);
  state.dashDirY = len > 0.01 ? my / len : Math.sin(aim);
  state.dashRemainingMs = DASH_DURATION_MS;
}

const scratch: StaticBody[] = [];

/** Advances a mover by `dtMs` given a sanitized movement vector and effective speed (units/sec). */
export function stepMovement(
  state: MoverState,
  mx: number,
  my: number,
  speed: number,
  dtMs: number,
  map: ArenaMap,
  radius = PLAYER_RADIUS,
): void {
  const dt = dtMs / 1000;
  let vx = mx * speed;
  let vy = my * speed;

  if (state.dashRemainingMs > 0) {
    const dashSpeed = DASH_DISTANCE / (DASH_DURATION_MS / 1000);
    const used = Math.min(dtMs, state.dashRemainingMs);
    state.dashRemainingMs -= used;
    const f = used / dtMs;
    vx = vx * (1 - f) + state.dashDirX * dashSpeed * f;
    vy = vy * (1 - f) + state.dashDirY * dashSpeed * f;
  }

  const r = resolveCircle(map.grid, state.x + vx * dt, state.y + vy * dt, radius, map.size, scratch);
  state.x = r.x;
  state.y = r.y;
}

/** Maximum distance a player can legitimately travel in `dtMs` (used by anti-cheat sanity checks). */
export function maxTravel(speed: number, dtMs: number): number {
  const dashSpeed = DASH_DISTANCE / (DASH_DURATION_MS / 1000);
  return (Math.max(speed, dashSpeed) * dtMs) / 1000 + 1;
}
