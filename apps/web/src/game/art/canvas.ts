// Helpers for procedurally painting high-resolution textures with the Canvas 2D API.
// The game ships no binary art: every sprite is drawn at boot, so licensing stays trivial.
import type Phaser from "phaser";

export type Ctx = CanvasRenderingContext2D;

export function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  tex.refresh();
}

export function hex(color: number, alpha = 1): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Lightens (amount > 0) or darkens (amount < 0) a color, amount in [-1, 1]. */
export function shade(color: number, amount: number): number {
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  return (f((color >> 16) & 255) << 16) | (f((color >> 8) & 255) << 8) | f(color & 255);
}

export function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Filled circle with a lit sphere-like gradient and dark rim. */
export function orb(ctx: Ctx, x: number, y: number, r: number, color: number, rim = 0.55): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, x, y, r, [
    [0, hex(shade(color, 0.55))],
    [0.45, hex(color)],
    [1, hex(shade(color, -rim))],
  ]);
  ctx.fill();
}

export function glowDot(ctx: Ctx, x: number, y: number, r: number, color: number, alpha = 1): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hex(0xffffff, alpha));
  g.addColorStop(0.25, hex(color, alpha));
  g.addColorStop(1, hex(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function poly(ctx: Ctx, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

export function stroke(ctx: Ctx, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

/** Deterministic pseudo-random generator for stable procedural details. */
export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
