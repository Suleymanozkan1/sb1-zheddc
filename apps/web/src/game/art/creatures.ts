// Creature sprites (facing +x). Drawn on 160×160 canvases (the titan on 256×256).
import type Phaser from "phaser";
import { canvasTexture, glowDot, hex, linear, orb, poly, radial, shade, stroke, prng, type Ctx } from "./canvas";

/** Radius of the creature body inside its canvas (used to scale the sprite to the gameplay radius). */
export const CREATURE_BODY_RADIUS: Record<string, number> = { slime: 42, wolf: 40, stalker: 40, golem: 46, wraith: 42, titan: 80, chest: 40 };

function slime(ctx: Ctx): void {
  const c = 80;
  ctx.beginPath();
  // wobbly blob
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 42 + Math.sin(a * 5) * 3 + Math.cos(a * 3) * 2;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = radial(ctx, c, c, 44, [
    [0, "rgba(220,255,230,0.95)"],
    [0.35, "rgba(74,222,128,0.9)"],
    [1, "rgba(21,128,61,0.95)"],
  ]);
  ctx.fill();
  stroke(ctx, "rgba(5,46,22,0.9)", 3);
  // inner bubbles
  const r = prng(7);
  for (let i = 0; i < 6; i++) glowDot(ctx, c - 20 + r() * 40, c - 20 + r() * 40, 4 + r() * 4, 0xbbf7d0, 0.6);
  // highlight
  ctx.beginPath();
  ctx.ellipse(c - 14, c - 16, 12, 7, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();
  // eyes
  for (const s of [-1, 1]) {
    orb(ctx, c + 20, c + s * 12, 7, 0xffffff, 0.2);
    orb(ctx, c + 23, c + s * 12, 3.5, 0x052e16, 0.1);
  }
}

function wolf(ctx: Ctx): void {
  const c = 80;
  const fur = 0x64748b;
  // tail
  ctx.beginPath();
  ctx.moveTo(c - 30, c);
  ctx.quadraticCurveTo(c - 60, c - 10, c - 72, c + 6);
  stroke(ctx, hex(shade(fur, -0.3)), 10);
  // body
  ctx.beginPath();
  ctx.ellipse(c - 6, c, 38, 24, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, c - 6, c, 38, [
    [0, hex(shade(fur, 0.4))],
    [0.6, hex(fur)],
    [1, hex(shade(fur, -0.6))],
  ]);
  ctx.fill();
  // glitch stripes
  const r = prng(3);
  for (let i = 0; i < 5; i++) {
    const x = c - 34 + i * 12;
    ctx.fillStyle = `rgba(34,211,238,${0.25 + r() * 0.3})`;
    ctx.fillRect(x, c - 20 + r() * 8, 6, 30 - r() * 10);
  }
  // legs
  for (const [dx, dy] of [
    [16, -20],
    [16, 20],
    [-24, -20],
    [-24, 20],
  ] as const) orb(ctx, c + dx, c + dy, 7, shade(fur, -0.35));
  // head
  poly(ctx, [
    [c + 18, c - 16],
    [c + 44, c - 8],
    [c + 58, c],
    [c + 44, c + 8],
    [c + 18, c + 16],
  ]);
  ctx.fillStyle = linear(ctx, c + 18, 0, c + 58, 0, [
    [0, hex(shade(fur, 0.2))],
    [1, hex(shade(fur, -0.4))],
  ]);
  ctx.fill();
  stroke(ctx, hex(0x0f172a), 2);
  // ears
  for (const s of [-1, 1]) {
    poly(ctx, [
      [c + 22, c + s * 12],
      [c + 16, c + s * 26],
      [c + 32, c + s * 14],
    ]);
    ctx.fillStyle = hex(shade(fur, -0.2));
    ctx.fill();
  }
  glowDot(ctx, c + 40, c - 6, 6, 0x22d3ee);
  glowDot(ctx, c + 40, c + 6, 6, 0x22d3ee);
}

function stalker(ctx: Ctx): void {
  const c = 80;
  // leafy cloak
  const r = prng(11);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(c - 6 + Math.cos(a) * 26, c + Math.sin(a) * 26, 16, 9, a, 0, Math.PI * 2);
    ctx.fillStyle = hex(shade(0x166534, -0.2 + r() * 0.4));
    ctx.fill();
  }
  orb(ctx, c - 4, c, 30, 0x14532d, 0.7);
  // claws
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(c + 18, c + s * (16 + k * 5));
      ctx.lineTo(c + 44, c + s * (12 + k * 7));
      stroke(ctx, hex(0xd9f99d), 2.5);
    }
  }
  // mask
  orb(ctx, c + 10, c, 14, 0xe7e5e4, 0.4);
  glowDot(ctx, c + 16, c - 5, 5, 0xa3e635);
  glowDot(ctx, c + 16, c + 5, 5, 0xa3e635);
}

function golem(ctx: Ctx): void {
  const c = 80;
  const r = prng(21);
  // rock plates
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.3;
    const x = c + Math.cos(a) * 28;
    const y = c + Math.sin(a) * 28;
    poly(ctx, [
      [x - 16, y - 10],
      [x + 4, y - 18],
      [x + 18, y - 2],
      [x + 8, y + 16],
      [x - 14, y + 10],
    ]);
    ctx.fillStyle = hex(shade(0x57534e, -0.2 + r() * 0.4));
    ctx.fill();
    stroke(ctx, hex(0x1c1917), 2);
  }
  orb(ctx, c, c, 30, 0x78716c, 0.6);
  // lava cracks
  ctx.save();
  ctx.shadowColor = "#f97316";
  ctx.shadowBlur = 12;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(c, c);
    const a = r() * Math.PI * 2;
    ctx.lineTo(c + Math.cos(a) * 18, c + Math.sin(a) * 18);
    ctx.lineTo(c + Math.cos(a + 0.4) * 30, c + Math.sin(a + 0.4) * 30);
    stroke(ctx, "#fb923c", 3);
  }
  ctx.restore();
  // fists
  for (const s of [-1, 1]) orb(ctx, c + 30, c + s * 36, 14, 0x57534e, 0.7);
  glowDot(ctx, c + 16, c, 10, 0xf97316);
}

function wraith(ctx: Ctx): void {
  const c = 80;
  // trailing wisps
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(c - 10, c - 20 + i * 10);
    ctx.bezierCurveTo(c - 40, c - 30 + i * 14, c - 50, c - 10 + i * 8, c - 76, c - 24 + i * 12);
    stroke(ctx, `rgba(167,139,250,${0.25 + i * 0.1})`, 7 - i);
  }
  ctx.beginPath();
  ctx.ellipse(c, c, 36, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, c, c, 36, [
    [0, "rgba(237,233,254,0.95)"],
    [0.4, "rgba(139,92,246,0.85)"],
    [1, "rgba(46,16,101,0.1)"],
  ]);
  ctx.fill();
  // hollow face
  ctx.beginPath();
  ctx.ellipse(c + 14, c, 13, 16, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,5,30,0.9)";
  ctx.fill();
  glowDot(ctx, c + 18, c - 6, 6, 0xf0abfc);
  glowDot(ctx, c + 18, c + 6, 6, 0xf0abfc);
}

function titan(ctx: Ctx): void {
  const c = 128;
  const r = prng(99);
  // crystal spikes
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = 90 + r() * 30;
    ctx.save();
    ctx.shadowColor = "#f43f5e";
    ctx.shadowBlur = 16;
    poly(ctx, [
      [c + Math.cos(a - 0.18) * 50, c + Math.sin(a - 0.18) * 50],
      [c + Math.cos(a) * len, c + Math.sin(a) * len],
      [c + Math.cos(a + 0.18) * 50, c + Math.sin(a + 0.18) * 50],
    ]);
    ctx.fillStyle = linear(ctx, c, c, c + Math.cos(a) * len, c + Math.sin(a) * len, [
      [0, "#881337"],
      [1, "#fda4af"],
    ]);
    ctx.fill();
    ctx.restore();
  }
  orb(ctx, c, c, 70, 0x9f1239, 0.7);
  ctx.beginPath();
  ctx.arc(c, c, 52, 0, Math.PI * 2);
  stroke(ctx, "rgba(253,164,175,0.7)", 4);
  glowDot(ctx, c + 30, c, 30, 0xfb7185);
  orb(ctx, c + 30, c, 12, 0xffe4e6, 0.2);
}

function chest(ctx: Ctx): void {
  const c = 80;
  ctx.save();
  ctx.translate(c, c);
  // body
  ctx.fillStyle = linear(ctx, 0, -30, 0, 30, [
    [0, "#b45309"],
    [1, "#451a03"],
  ]);
  ctx.beginPath();
  ctx.roundRect(-44, -30, 88, 60, 8);
  ctx.fill();
  stroke(ctx, "#1c0a00", 3);
  // metal bands
  ctx.fillStyle = linear(ctx, 0, -30, 0, 30, [
    [0, "#fde68a"],
    [1, "#a16207"],
  ]);
  for (const x of [-34, 26]) ctx.fillRect(x, -30, 8, 60);
  ctx.fillRect(-44, -6, 88, 8);
  // neon lock
  ctx.shadowColor = "#facc15";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#fef08a";
  ctx.beginPath();
  ctx.roundRect(-8, -12, 16, 20, 4);
  ctx.fill();
  ctx.restore();
}

const DRAW: Record<string, [(ctx: Ctx) => void, number]> = {
  slime: [slime, 160],
  wolf: [wolf, 160],
  stalker: [stalker, 160],
  golem: [golem, 160],
  wraith: [wraith, 160],
  titan: [titan, 256],
  chest: [chest, 160],
};

export function creatureTextureKey(kind: string): string {
  return DRAW[kind] ? `npc_${kind}` : "npc_slime";
}

export function generateCreatureTextures(scene: Phaser.Scene): void {
  for (const [key, [draw, size]] of Object.entries(DRAW)) canvasTexture(scene, `npc_${key}`, size, size, (ctx) => draw(ctx));
}
