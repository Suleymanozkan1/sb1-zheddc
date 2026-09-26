// Static collision world: axis-aligned rectangles and circles indexed in a uniform grid.
// Pattern adapted from tosios' R-tree collider (MIT, halftheopposite/tosios): query nearby
// static bodies, then push the moving circle out of each overlapping body.

import { clamp } from "./math";

export interface RectBody {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleBody {
  kind: "circle";
  x: number;
  y: number;
  r: number;
}

export type StaticBody = RectBody | CircleBody;

function bodyBounds(b: StaticBody): { minX: number; minY: number; maxX: number; maxY: number } {
  return b.kind === "rect"
    ? { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }
    : { minX: b.x - b.r, minY: b.y - b.r, maxX: b.x + b.r, maxY: b.y + b.r };
}

/** Uniform grid spatial index for static bodies. */
export class StaticGrid {
  private readonly cells = new Map<number, StaticBody[]>();
  readonly cellSize: number;
  readonly bodies: readonly StaticBody[];

  constructor(bodies: readonly StaticBody[], cellSize = 256) {
    this.cellSize = cellSize;
    this.bodies = bodies;
    for (const body of bodies) {
      const b = bodyBounds(body);
      for (let cx = Math.floor(b.minX / cellSize); cx <= Math.floor(b.maxX / cellSize); cx++) {
        for (let cy = Math.floor(b.minY / cellSize); cy <= Math.floor(b.maxY / cellSize); cy++) {
          const key = cellKey(cx, cy);
          let list = this.cells.get(key);
          if (!list) {
            list = [];
            this.cells.set(key, list);
          }
          list.push(body);
        }
      }
    }
  }

  query(x: number, y: number, radius: number, out: StaticBody[] = []): StaticBody[] {
    out.length = 0;
    const s = this.cellSize;
    const seen = new Set<StaticBody>();
    for (let cx = Math.floor((x - radius) / s); cx <= Math.floor((x + radius) / s); cx++) {
      for (let cy = Math.floor((y - radius) / s); cy <= Math.floor((y + radius) / s); cy++) {
        const list = this.cells.get(cellKey(cx, cy));
        if (!list) continue;
        for (const body of list) {
          if (!seen.has(body)) {
            seen.add(body);
            out.push(body);
          }
        }
      }
    }
    return out;
  }

  /** True when a circle overlaps any static body. */
  overlaps(x: number, y: number, r: number): boolean {
    for (const body of this.query(x, y, r)) {
      if (circleOverlapsBody(x, y, r, body)) return true;
    }
    return false;
  }

  /** True when the segment (x1,y1)→(x2,y2) is not blocked (sampled every `step` units). */
  lineOfSight(x1: number, y1: number, x2: number, y2: number, step = 24): boolean {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.ceil(d / step));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.overlaps(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 2)) return false;
    }
    return true;
  }
}

function cellKey(cx: number, cy: number): number {
  return (cx + 1024) * 4096 + (cy + 1024);
}

export function circleOverlapsBody(x: number, y: number, r: number, body: StaticBody): boolean {
  if (body.kind === "circle") {
    const dx = x - body.x;
    const dy = y - body.y;
    const rr = r + body.r;
    return dx * dx + dy * dy < rr * rr;
  }
  const cx = clamp(x, body.x, body.x + body.w);
  const cy = clamp(y, body.y, body.y + body.h);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

/**
 * Resolves a circle against static bodies and world bounds.
 * Returns the corrected position (never inside an obstacle for convex, non-overlapping layouts).
 */
export function resolveCircle(
  grid: StaticGrid,
  x: number,
  y: number,
  r: number,
  worldSize: number,
  scratch: StaticBody[] = [],
): { x: number; y: number; collided: boolean } {
  let px = clamp(x, r, worldSize - r);
  let py = clamp(y, r, worldSize - r);
  let collided = px !== x || py !== y;

  // Two passes handle corners where two bodies touch.
  for (let pass = 0; pass < 2; pass++) {
    for (const body of grid.query(px, py, r, scratch)) {
      if (body.kind === "circle") {
        const dx = px - body.x;
        const dy = py - body.y;
        const rr = r + body.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.0001;
          px = body.x + (dx / d) * rr;
          py = body.y + (dy / d) * rr;
          collided = true;
        }
      } else {
        const cx = clamp(px, body.x, body.x + body.w);
        const cy = clamp(py, body.y, body.y + body.h);
        let dx = px - cx;
        let dy = py - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 === 0) {
            // Center is inside the rectangle: push out along the shallowest axis.
            const left = px - body.x;
            const right = body.x + body.w - px;
            const top = py - body.y;
            const bottom = body.y + body.h - py;
            const m = Math.min(left, right, top, bottom);
            if (m === left) px = body.x - r;
            else if (m === right) px = body.x + body.w + r;
            else if (m === top) py = body.y - r;
            else py = body.y + body.h + r;
          } else {
            const d = Math.sqrt(d2);
            dx /= d;
            dy /= d;
            px = cx + dx * r;
            py = cy + dy * r;
          }
          collided = true;
        }
      }
    }
  }
  px = clamp(px, r, worldSize - r);
  py = clamp(py, r, worldSize - r);
  return { x: px, y: py, collided };
}

/** Dynamic uniform grid for moving entities (rebuilt every tick; cheap for a few thousand entities). */
export class DynamicGrid<T extends { x: number; y: number }> {
  private readonly cells = new Map<number, T[]>();
  readonly cellSize: number;

  constructor(cellSize = 300) {
    this.cellSize = cellSize;
  }

  clear(): void {
    for (const list of this.cells.values()) list.length = 0;
  }

  insert(item: T): void {
    const key = cellKey(Math.floor(item.x / this.cellSize), Math.floor(item.y / this.cellSize));
    let list = this.cells.get(key);
    if (!list) {
      list = [];
      this.cells.set(key, list);
    }
    list.push(item);
  }

  queryRect(minX: number, minY: number, maxX: number, maxY: number, visit: (item: T) => void): void {
    const s = this.cellSize;
    for (let cx = Math.floor(minX / s); cx <= Math.floor(maxX / s); cx++) {
      for (let cy = Math.floor(minY / s); cy <= Math.floor(maxY / s); cy++) {
        const list = this.cells.get(cellKey(cx, cy));
        if (!list) continue;
        for (const item of list) {
          if (item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY) visit(item);
        }
      }
    }
  }

  queryRadius(x: number, y: number, r: number, visit: (item: T) => void): void {
    const r2 = r * r;
    this.queryRect(x - r, y - r, x + r, y + r, (item) => {
      const dx = item.x - x;
      const dy = item.y - y;
      if (dx * dx + dy * dy <= r2) visit(item);
    });
  }
}
