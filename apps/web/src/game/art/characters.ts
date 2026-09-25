// Top-down hero sprites (facing +x, rotated to the aim angle in-game). 160×160 canvas, centre (80, 80).
import type Phaser from "phaser";
import { canvasTexture, glowDot, hex, linear, orb, poly, radial, shade, stroke, type Ctx } from "./canvas";

export const HERO_SIZE = 160;
const C = 80;

function shadowless(ctx: Ctx, fn: () => void): void {
  ctx.save();
  fn();
  ctx.restore();
}

function cape(ctx: Ctx, color: number, spread = 34, length = 46): void {
  poly(ctx, [
    [C - 10, C - spread * 0.7],
    [C - 10 - length, C - spread],
    [C - 10 - length - 8, C],
    [C - 10 - length, C + spread],
    [C - 10, C + spread * 0.7],
  ]);
  ctx.fillStyle = linear(ctx, C - 10, 0, C - 10 - length, 0, [
    [0, hex(shade(color, -0.1))],
    [1, hex(shade(color, -0.55))],
  ]);
  ctx.fill();
  stroke(ctx, hex(shade(color, -0.7), 0.8), 2);
}

function torso(ctx: Ctx, color: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(C, C, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, C, C, Math.max(rx, ry), [
    [0, hex(shade(color, 0.45))],
    [0.55, hex(color)],
    [1, hex(shade(color, -0.55))],
  ]);
  ctx.fill();
  stroke(ctx, hex(shade(color, -0.75)), 2.5);
}

function pauldron(ctx: Ctx, x: number, y: number, r: number, color: number, trim: number): void {
  orb(ctx, x, y, r, color, 0.6);
  ctx.beginPath();
  ctx.arc(x, y, r - 2, 0, Math.PI * 2);
  stroke(ctx, hex(trim, 0.9), 2.5);
}

function head(ctx: Ctx, color: number, r = 15): void {
  orb(ctx, C + 4, C, r, color, 0.6);
}

function neonLine(ctx: Ctx, pts: [number, number][], color: number, width = 3): void {
  ctx.save();
  ctx.shadowColor = hex(color);
  ctx.shadowBlur = 10;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  stroke(ctx, hex(color), width);
  ctx.restore();
}

function blade(ctx: Ctx, x0: number, y0: number, len: number, width: number, steel: number, glow: number): void {
  ctx.save();
  ctx.shadowColor = hex(glow);
  ctx.shadowBlur = 12;
  poly(ctx, [
    [x0, y0 - width / 2],
    [x0 + len - width, y0 - width / 2],
    [x0 + len, y0],
    [x0 + len - width, y0 + width / 2],
    [x0, y0 + width / 2],
  ]);
  ctx.fillStyle = linear(ctx, 0, y0 - width / 2, 0, y0 + width / 2, [
    [0, hex(shade(steel, 0.6))],
    [0.5, hex(steel)],
    [1, hex(shade(steel, -0.4))],
  ]);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(x0 + 4, y0);
  ctx.lineTo(x0 + len - width - 2, y0);
  stroke(ctx, hex(glow, 0.9), 1.5);
}

function warrior(ctx: Ctx): void {
  const armor = 0x9ca3af;
  const accent = 0xf97316;
  cape(ctx, 0xb91c1c, 30, 40);
  // sword arm + sword
  orb(ctx, C + 18, C + 26, 8, shade(armor, -0.1));
  blade(ctx, C + 22, C + 26, 56, 9, 0xe5e7eb, accent);
  poly(ctx, [
    [C + 20, C + 17],
    [C + 25, C + 17],
    [C + 25, C + 35],
    [C + 20, C + 35],
  ]);
  ctx.fillStyle = hex(0xfbbf24);
  ctx.fill();
  torso(ctx, armor, 26, 30);
  neonLine(ctx, [
    [C - 14, C - 20],
    [C + 10, C],
    [C - 14, C + 20],
  ], accent, 3);
  pauldron(ctx, C - 2, C - 27, 13, shade(armor, 0.1), accent);
  pauldron(ctx, C - 2, C + 27, 13, shade(armor, 0.1), accent);
  // shield arm
  orb(ctx, C + 16, C - 24, 7, shade(armor, -0.1));
  head(ctx, 0x6b7280, 15);
  // visor
  ctx.beginPath();
  ctx.moveTo(C + 12, C - 7);
  ctx.lineTo(C + 17, C);
  ctx.lineTo(C + 12, C + 7);
  stroke(ctx, hex(accent), 3);
  glowDot(ctx, C + 15, C, 6, accent, 0.9);
  // crest
  ctx.beginPath();
  ctx.moveTo(C - 10, C);
  ctx.lineTo(C + 10, C);
  stroke(ctx, hex(0xdc2626), 5);
}

function assassin(ctx: Ctx): void {
  const cloth = 0x3b0764;
  const accent = 0xc084fc;
  // scarf trails
  ctx.beginPath();
  ctx.moveTo(C - 8, C - 4);
  ctx.bezierCurveTo(C - 40, C - 10, C - 44, C + 12, C - 70, C + 6);
  stroke(ctx, hex(0xa855f7, 0.9), 7);
  ctx.beginPath();
  ctx.moveTo(C - 8, C + 4);
  ctx.bezierCurveTo(C - 34, C + 20, C - 50, C + 26, C - 64, C + 22);
  stroke(ctx, hex(0x7e22ce, 0.9), 5);
  // daggers
  for (const side of [-1, 1]) {
    orb(ctx, C + 16, C + side * 22, 7, shade(cloth, 0.2));
    blade(ctx, C + 20, C + side * 22, 34, 7, 0xd8b4fe, accent);
  }
  torso(ctx, cloth, 20, 24);
  neonLine(ctx, [
    [C - 16, C],
    [C + 12, C],
  ], accent, 2);
  // hood
  ctx.beginPath();
  ctx.ellipse(C + 2, C, 17, 16, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, C + 2, C, 17, [
    [0, hex(0x6b21a8)],
    [1, hex(0x1e0535)],
  ]);
  ctx.fill();
  stroke(ctx, hex(0x0b0214), 2);
  // eyes glowing from the hood
  glowDot(ctx, C + 14, C - 5, 5, accent);
  glowDot(ctx, C + 14, C + 5, 5, accent);
}

function tank(ctx: Ctx): void {
  const armor = 0x166534;
  const metal = 0x94a3b8;
  const accent = 0x4ade80;
  // hammer
  orb(ctx, C + 18, C + 30, 9, shade(metal, -0.2));
  ctx.beginPath();
  ctx.moveTo(C + 20, C + 30);
  ctx.lineTo(C + 62, C + 30);
  stroke(ctx, hex(0x78350f), 6);
  poly(ctx, [
    [C + 56, C + 16],
    [C + 72, C + 16],
    [C + 72, C + 44],
    [C + 56, C + 44],
  ]);
  ctx.fillStyle = linear(ctx, C + 56, 0, C + 72, 0, [
    [0, hex(shade(metal, 0.4))],
    [1, hex(shade(metal, -0.4))],
  ]);
  ctx.fill();
  stroke(ctx, hex(0x1f2937), 2);
  torso(ctx, armor, 32, 36);
  // plates
  for (const y of [-14, 0, 14]) {
    ctx.beginPath();
    ctx.moveTo(C - 20, C + y);
    ctx.lineTo(C + 16, C + y);
    stroke(ctx, hex(shade(armor, -0.5), 0.8), 2);
  }
  pauldron(ctx, C - 4, C - 32, 16, shade(armor, 0.15), accent);
  pauldron(ctx, C - 4, C + 32, 16, shade(armor, 0.15), accent);
  head(ctx, 0x14532d, 16);
  glowDot(ctx, C + 16, C, 7, accent);
  // tower shield in front
  shadowless(ctx, () => {
    ctx.shadowColor = hex(accent);
    ctx.shadowBlur = 14;
    poly(ctx, [
      [C + 28, C - 46],
      [C + 44, C - 40],
      [C + 48, C - 4],
      [C + 44, C + 6],
      [C + 28, C + 2],
    ]);
    ctx.fillStyle = linear(ctx, C + 28, 0, C + 48, 0, [
      [0, hex(shade(metal, -0.2))],
      [0.5, hex(shade(metal, 0.35))],
      [1, hex(shade(metal, -0.35))],
    ]);
    ctx.fill();
  });
  stroke(ctx, hex(accent, 0.9), 2.5);
}

function ranger(ctx: Ctx): void {
  const cloth = 0x0c4a6e;
  const accent = 0x38bdf8;
  cape(ctx, 0x075985, 26, 34);
  // quiver
  poly(ctx, [
    [C - 28, C - 8],
    [C - 10, C - 22],
    [C - 6, C - 16],
    [C - 24, C - 2],
  ]);
  ctx.fillStyle = hex(0x78350f);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(C - 12 + i * 2, C - 20 + i * 2);
    ctx.lineTo(C - 2 + i * 2, C - 30 + i * 2);
    stroke(ctx, hex(0xe0f2fe), 1.5);
  }
  torso(ctx, cloth, 22, 26);
  neonLine(ctx, [
    [C - 16, C + 12],
    [C + 10, C - 12],
  ], accent, 2);
  // arms reaching forward to the bow
  orb(ctx, C + 20, C - 12, 6, shade(cloth, 0.3));
  orb(ctx, C + 22, C + 12, 6, shade(cloth, 0.3));
  // bow
  ctx.save();
  ctx.shadowColor = hex(accent);
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(C + 18, C, 40, -1.05, 1.05);
  stroke(ctx, hex(0xbae6fd), 5);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(C + 18 + Math.cos(-1.05) * 40, C + Math.sin(-1.05) * 40);
  ctx.lineTo(C + 26, C);
  ctx.lineTo(C + 18 + Math.cos(1.05) * 40, C + Math.sin(1.05) * 40);
  stroke(ctx, hex(0xffffff, 0.8), 1.2);
  // nocked arrow
  ctx.beginPath();
  ctx.moveTo(C + 26, C);
  ctx.lineTo(C + 66, C);
  stroke(ctx, hex(0xe0f2fe), 2);
  poly(ctx, [
    [C + 66, C - 4],
    [C + 74, C],
    [C + 66, C + 4],
  ]);
  ctx.fillStyle = hex(accent);
  ctx.fill();
  // hood
  ctx.beginPath();
  ctx.ellipse(C + 3, C, 15, 14, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, C + 3, C, 15, [
    [0, hex(0x0e7490)],
    [1, hex(0x082f49)],
  ]);
  ctx.fill();
  stroke(ctx, hex(0x020617), 2);
  glowDot(ctx, C + 13, C, 5, accent, 0.8);
}

function mage(ctx: Ctx): void {
  const robe = 0x581c87;
  const accent = 0xe879f9;
  // robe flare
  ctx.beginPath();
  ctx.ellipse(C - 8, C, 34, 32, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, C - 8, C, 34, [
    [0, hex(0x7e22ce)],
    [1, hex(0x2e1065)],
  ]);
  ctx.fill();
  stroke(ctx, hex(accent, 0.6), 2);
  // runes on the robe
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    glowDot(ctx, C - 8 + Math.cos(a) * 26, C + Math.sin(a) * 24, 3.5, accent, 0.9);
  }
  // staff
  orb(ctx, C + 18, C + 22, 6, shade(robe, 0.3));
  ctx.beginPath();
  ctx.moveTo(C - 6, C + 26);
  ctx.lineTo(C + 60, C + 20);
  stroke(ctx, hex(0x78350f), 5);
  glowDot(ctx, C + 64, C + 20, 16, accent);
  orb(ctx, C + 64, C + 20, 7, 0xfdf4ff, 0.2);
  torso(ctx, robe, 20, 24);
  // wide hat brim (seen from above)
  ctx.beginPath();
  ctx.ellipse(C + 4, C, 24, 24, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, C + 4, C, 24, [
    [0, hex(0x6b21a8)],
    [0.7, hex(0x3b0764)],
    [1, hex(0x1e0535)],
  ]);
  ctx.fill();
  stroke(ctx, hex(accent, 0.8), 2);
  // pointed tip
  ctx.beginPath();
  ctx.moveTo(C - 4, C - 8);
  ctx.lineTo(C + 16, C);
  ctx.lineTo(C - 4, C + 8);
  ctx.closePath();
  ctx.fillStyle = hex(0x86198f);
  ctx.fill();
  glowDot(ctx, C + 4, C, 5, 0xfde68a);
}

const DRAW: Record<string, (ctx: Ctx) => void> = { warrior, assassin, tank, ranger, mage };

export function heroTextureKey(cls: string): string {
  return `hero_${DRAW[cls] ? cls : "warrior"}`;
}

export function generateHeroTextures(scene: Phaser.Scene): void {
  for (const [key, draw] of Object.entries(DRAW)) {
    canvasTexture(scene, `hero_${key}`, HERO_SIZE, HERO_SIZE, (ctx) => draw(ctx));
  }
}
