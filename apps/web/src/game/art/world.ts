// Terrain, props, zones, loot and effect textures.
import { REGIONS, type ArenaMap } from "@cryptoarena/game-core";
import type Phaser from "phaser";
import { canvasTexture, glowDot, hex, linear, orb, poly, prng, radial, shade, stroke, type Ctx } from "./canvas";

export const GROUND_RES = 2048;

/** Region palette: base, accent (neon details) and prop tint. */
export const REGION_STYLE: Record<string, { base: number; deep: number; accent: number; prop: number }> = {
  plains: { base: 0x0f2a3f, deep: 0x07151f, accent: 0x22d3ee, prop: 0x0e7490 },
  forest: { base: 0x0f2e1d, deep: 0x06140d, accent: 0x4ade80, prop: 0x166534 },
  wastes: { base: 0x331b12, deep: 0x160a06, accent: 0xf97316, prop: 0x57534e },
  core: { base: 0x2c1446, deep: 0x12071d, accent: 0xe879f9, prop: 0x7e22ce },
};

/** Paints the whole world floor into one texture (scaled up in-game) with regional detail. */
export function generateGround(scene: Phaser.Scene, map: ArenaMap): string {
  const key = `ground_${map.seed}_${map.size}`;
  canvasTexture(scene, key, GROUND_RES, GROUND_RES, (ctx) => {
    const s = GROUND_RES / map.size;
    const c = GROUND_RES / 2;
    const rand = prng(map.seed);
    // concentric regions, outermost first, with soft edges
    for (const r of [...REGIONS].reverse()) {
      const st = REGION_STYLE[r.key]!;
      const outer = Math.min(r.maxR, map.size * 0.75) * s;
      const g = ctx.createRadialGradient(c, c, Math.max(0, r.minR * s - 40), c, c, outer);
      g.addColorStop(0, hex(st.base));
      g.addColorStop(0.85, hex(st.base));
      g.addColorStop(1, hex(st.deep));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, outer, 0, Math.PI * 2);
      ctx.fill();
    }
    // mottled noise
    for (let i = 0; i < 9000; i++) {
      const x = rand() * GROUND_RES;
      const y = rand() * GROUND_RES;
      const d = Math.hypot(x - c, y - c) / s;
      const region = REGIONS.find((r) => d >= r.minR && d < r.maxR) ?? REGIONS[REGIONS.length - 1]!;
      const st = REGION_STYLE[region.key]!;
      ctx.fillStyle = hex(rand() < 0.5 ? shade(st.base, 0.12) : shade(st.base, -0.25), 0.35);
      const r = 1 + rand() * 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // plains: circuit traces
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 260; i++) {
      const a = rand() * Math.PI * 2;
      const d = (3900 + rand() * (map.size * 0.5 - 3900)) * s;
      let x = c + Math.cos(a) * d;
      let y = c + Math.sin(a) * d;
      ctx.strokeStyle = hex(0x22d3ee, 0.18 + rand() * 0.15);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (rand() < 0.5) x += (rand() - 0.5) * 60;
        else y += (rand() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      glowDot(ctx, x, y, 3, 0x22d3ee, 0.5);
    }
    // forest: moss and fireflies
    for (let i = 0; i < 700; i++) {
      const a = rand() * Math.PI * 2;
      const d = (2600 + rand() * 1200) * s;
      const x = c + Math.cos(a) * d;
      const y = c + Math.sin(a) * d;
      if (rand() < 0.8) {
        ctx.fillStyle = hex(0x14532d, 0.35);
        ctx.beginPath();
        ctx.ellipse(x, y, 4 + rand() * 10, 3 + rand() * 6, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      } else glowDot(ctx, x, y, 3, 0xa3e635, 0.7);
    }
    // wastes: glowing lava cracks
    ctx.save();
    ctx.shadowColor = "#f97316";
    ctx.shadowBlur = 3;
    for (let i = 0; i < 420; i++) {
      const a = rand() * Math.PI * 2;
      const d = (1450 + rand() * 1100) * s;
      let x = c + Math.cos(a) * d;
      let y = c + Math.sin(a) * d;
      ctx.strokeStyle = hex(0xfb923c, 0.3 + rand() * 0.35);
      ctx.lineWidth = 0.5 + rand() * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rand() - 0.5) * 9;
        y += (rand() - 0.5) * 9;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    // core: crystal veins radiating from the centre
    ctx.save();
    ctx.shadowColor = "#e879f9";
    ctx.shadowBlur = 8;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + rand() * 0.1;
      ctx.strokeStyle = hex(0xe879f9, 0.25 + rand() * 0.25);
      ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 30, c + Math.sin(a) * 30);
      ctx.lineTo(c + Math.cos(a + (rand() - 0.5) * 0.2) * 1400 * s, c + Math.sin(a + (rand() - 0.5) * 0.2) * 1400 * s);
      ctx.stroke();
    }
    ctx.restore();
    // region borders
    for (const r of REGIONS) {
      if (r.minR <= 0) continue;
      ctx.strokeStyle = hex(REGION_STYLE[r.key]!.accent, 0.35);
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(c, c, r.minR * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  });
  return key;
}

function tree(ctx: Ctx, seed: number, leaf: number, rim: number): void {
  const c = 128;
  const r = prng(seed);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.4;
    const d = 40 + r() * 30;
    const rr = 38 + r() * 20;
    orb(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, rr, shade(leaf, -0.15 + r() * 0.2), 0.75);
  }
  orb(ctx, c, c, 62, shade(leaf, 0.08), 0.7);
  // neon rim light
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  ctx.arc(c - 18, c - 20, 70, Math.PI * 0.9, Math.PI * 1.7);
  stroke(ctx, hex(rim, 0.35), 6);
  ctx.restore();
  for (let i = 0; i < 12; i++) glowDot(ctx, c - 60 + r() * 120, c - 60 + r() * 120, 3, rim, 0.6);
}

function rock(ctx: Ctx, seed: number, color: number, vein: number): void {
  const c = 128;
  const r = prng(seed);
  const pts: [number, number][] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = 96 + r() * 26;
    pts.push([c + Math.cos(a) * d, c + Math.sin(a) * d]);
  }
  poly(ctx, pts);
  ctx.fillStyle = radial(ctx, c, c, 120, [
    [0, hex(shade(color, 0.35))],
    [0.6, hex(color)],
    [1, hex(shade(color, -0.6))],
  ]);
  ctx.fill();
  stroke(ctx, hex(shade(color, -0.75)), 4);
  // facets
  for (const p of pts) {
    ctx.beginPath();
    ctx.moveTo(c + (r() - 0.5) * 30, c + (r() - 0.5) * 30);
    ctx.lineTo(p[0], p[1]);
    stroke(ctx, hex(shade(color, -0.4), 0.6), 2);
  }
  ctx.save();
  ctx.shadowColor = hex(vein);
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(c - 50, c + 20);
  ctx.lineTo(c - 10, c - 5);
  ctx.lineTo(c + 40, c + 10);
  stroke(ctx, hex(vein, 0.8), 3);
  ctx.restore();
}

function crystalCluster(ctx: Ctx, seed: number, color: number): void {
  const c = 128;
  const r = prng(seed);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r();
    const len = 70 + r() * 50;
    ctx.save();
    ctx.shadowColor = hex(color);
    ctx.shadowBlur = 14;
    poly(ctx, [
      [c + Math.cos(a - 0.35) * 30, c + Math.sin(a - 0.35) * 30],
      [c + Math.cos(a) * len, c + Math.sin(a) * len],
      [c + Math.cos(a + 0.35) * 30, c + Math.sin(a + 0.35) * 30],
    ]);
    ctx.fillStyle = linear(ctx, c, c, c + Math.cos(a) * len, c + Math.sin(a) * len, [
      [0, hex(shade(color, -0.5))],
      [1, hex(shade(color, 0.6))],
    ]);
    ctx.fill();
    ctx.restore();
  }
  orb(ctx, c, c, 44, shade(color, -0.3), 0.6);
  glowDot(ctx, c, c, 30, color, 0.8);
}

export function generateWorldTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, "tree_plains", 256, 256, (ctx) => tree(ctx, 1, 0x0e7490, 0x67e8f9));
  canvasTexture(scene, "tree_plains2", 256, 256, (ctx) => tree(ctx, 2, 0x0f766e, 0x5eead4));
  canvasTexture(scene, "tree_forest", 256, 256, (ctx) => tree(ctx, 3, 0x15803d, 0x86efac));
  canvasTexture(scene, "tree_forest2", 256, 256, (ctx) => tree(ctx, 4, 0x3f6212, 0xbef264));
  canvasTexture(scene, "rock_wastes", 256, 256, (ctx) => rock(ctx, 5, 0x57534e, 0xf97316));
  canvasTexture(scene, "rock_wastes2", 256, 256, (ctx) => rock(ctx, 6, 0x44403c, 0xfb923c));
  canvasTexture(scene, "rock_plains", 256, 256, (ctx) => rock(ctx, 7, 0x334155, 0x22d3ee));
  canvasTexture(scene, "crystal_core", 256, 256, (ctx) => crystalCluster(ctx, 8, 0xe879f9));
  canvasTexture(scene, "crystal_core2", 256, 256, (ctx) => crystalCluster(ctx, 9, 0xa78bfa));

  // Ruin wall brick tile (tiled across wall rectangles)
  canvasTexture(scene, "wall_tile", 128, 64, (ctx, w, h) => {
    ctx.fillStyle = "#1b1830";
    ctx.fillRect(0, 0, w, h);
    const r = prng(12);
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 5; col++) {
        const x = col * 32 + (row % 2) * 16;
        const y = row * 16;
        ctx.fillStyle = hex(shade(0x2e2a4f, -0.2 + r() * 0.35));
        ctx.fillRect(x + 1, y + 1, 30, 14);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(x + 1, y + 1, 30, 2);
      }
    }
    ctx.strokeStyle = "rgba(168,85,247,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, 50);
    ctx.lineTo(40, 30);
    ctx.lineTo(70, 42);
    ctx.lineTo(110, 12);
    ctx.stroke();
  });

  // Soft drop shadow
  canvasTexture(scene, "shadow", 128, 64, (ctx) => {
    const g = ctx.createRadialGradient(64, 32, 0, 64, 32, 64);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Zones
  canvasTexture(scene, "zone_safe", 512, 512, (ctx) => {
    const c = 256;
    const g = ctx.createRadialGradient(c, c, 60, c, c, 250);
    g.addColorStop(0, "rgba(56,189,248,0.02)");
    g.addColorStop(0.85, "rgba(56,189,248,0.10)");
    g.addColorStop(1, "rgba(56,189,248,0.35)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, 250, 0, Math.PI * 2);
    ctx.fill();
    // hex grid
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, 248, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(125,211,252,0.18)";
    ctx.lineWidth = 1.5;
    const hs = 22;
    for (let y = 0; y < 512 + hs; y += hs * 1.5) {
      for (let x = 0; x < 512 + hs; x += hs * Math.sqrt(3)) {
        const ox = (Math.round(y / (hs * 1.5)) % 2) * ((hs * Math.sqrt(3)) / 2);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = x + ox + Math.cos(a) * hs;
          const py = y + Math.sin(a) * hs;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(c, c, 250, 0, Math.PI * 2);
    stroke(ctx, "rgba(125,211,252,0.8)", 4);
  });
  canvasTexture(scene, "zone_heal", 256, 256, (ctx) => {
    const c = 128;
    const g = ctx.createRadialGradient(c, c, 10, c, c, 124);
    g.addColorStop(0, "rgba(187,247,208,0.55)");
    g.addColorStop(0.6, "rgba(34,197,94,0.25)");
    g.addColorStop(1, "rgba(21,128,61,0.05)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, 124, 0, Math.PI * 2);
    ctx.fill();
    for (const rr of [40, 70, 100]) {
      ctx.beginPath();
      ctx.arc(c, c, rr, 0, Math.PI * 2);
      stroke(ctx, "rgba(134,239,172,0.35)", 2);
    }
    // plus sign
    ctx.save();
    ctx.shadowColor = "#4ade80";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(220,252,231,0.8)";
    ctx.fillRect(c - 7, c - 24, 14, 48);
    ctx.fillRect(c - 24, c - 7, 48, 14);
    ctx.restore();
  });
  canvasTexture(scene, "zone_xp", 512, 512, (ctx) => {
    const c = 256;
    const g = ctx.createRadialGradient(c, c, 20, c, c, 250);
    g.addColorStop(0, "rgba(250,204,21,0.18)");
    g.addColorStop(1, "rgba(250,204,21,0.02)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = "#facc15";
    ctx.shadowBlur = 10;
    for (const rr of [240, 200]) {
      ctx.beginPath();
      ctx.arc(c, c, rr, 0, Math.PI * 2);
      stroke(ctx, "rgba(253,224,71,0.55)", 3);
    }
    // runes
    ctx.fillStyle = "rgba(254,240,138,0.8)";
    ctx.font = "bold 26px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒ";
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      ctx.save();
      ctx.translate(c + Math.cos(a) * 220, c + Math.sin(a) * 220);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(runes[i]!, 0, 0);
      ctx.restore();
    }
    // hexagram
    for (const off of [0, Math.PI / 3]) {
      poly(
        ctx,
        [0, 1, 2].map((k) => {
          const a = off + (k / 3) * Math.PI * 2 - Math.PI / 2;
          return [c + Math.cos(a) * 170, c + Math.sin(a) * 170] as [number, number];
        }),
      );
      stroke(ctx, "rgba(253,224,71,0.45)", 2.5);
    }
    ctx.restore();
  });

  // Loot gem (faceted, white so it can be tinted by rarity)
  canvasTexture(scene, "loot_gem", 64, 64, (ctx) => {
    const c = 32;
    poly(ctx, [
      [c, 4],
      [c + 20, c - 6],
      [c + 14, c + 22],
      [c - 14, c + 22],
      [c - 20, c - 6],
    ]);
    ctx.fillStyle = linear(ctx, 0, 4, 0, 60, [
      [0, "#ffffff"],
      [1, "#9ca3af"],
    ]);
    ctx.fill();
    stroke(ctx, "rgba(0,0,0,0.5)", 2);
    ctx.beginPath();
    ctx.moveTo(c - 20, c - 6);
    ctx.lineTo(c + 20, c - 6);
    ctx.moveTo(c, 4);
    ctx.lineTo(c - 8, c - 6);
    ctx.lineTo(c, c + 22);
    ctx.lineTo(c + 8, c - 6);
    ctx.lineTo(c, 4);
    stroke(ctx, "rgba(255,255,255,0.6)", 1.2);
  });
  canvasTexture(scene, "loot_beam", 32, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(10, 0, 12, 128);
  });

  // Resources
  canvasTexture(scene, "res_scrap", 96, 96, (ctx) => {
    const c = 48;
    const r = prng(31);
    for (let i = 0; i < 5; i++) {
      const x = c - 18 + r() * 36;
      const y = c - 18 + r() * 36;
      poly(ctx, [
        [x - 12, y - 6],
        [x + 8, y - 12],
        [x + 14, y + 6],
        [x - 6, y + 12],
      ]);
      ctx.fillStyle = linear(ctx, x - 12, y - 12, x + 14, y + 12, [
        [0, "#e5e7eb"],
        [1, "#4b5563"],
      ]);
      ctx.fill();
      stroke(ctx, "#111827", 1.5);
    }
    // gear
    ctx.save();
    ctx.translate(c + 10, c + 8);
    ctx.fillStyle = "#9ca3af";
    for (let k = 0; k < 8; k++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -16, 6, 8);
    }
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1f2937";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  const crystalRes = (key: string, color: number): void =>
    canvasTexture(scene, key, 96, 96, (ctx) => {
      const c = 48;
      glowDot(ctx, c, c + 6, 34, color, 0.4);
      for (const [dx, h, w] of [
        [-14, 34, 10],
        [0, 46, 13],
        [14, 30, 10],
      ] as const) {
        poly(ctx, [
          [c + dx - w, c + 22],
          [c + dx - w * 0.6, c + 22 - h * 0.7],
          [c + dx, c + 22 - h],
          [c + dx + w * 0.6, c + 22 - h * 0.7],
          [c + dx + w, c + 22],
        ]);
        ctx.fillStyle = linear(ctx, c + dx - w, 0, c + dx + w, 0, [
          [0, hex(shade(color, 0.6))],
          [0.5, hex(color)],
          [1, hex(shade(color, -0.5))],
        ]);
        ctx.fill();
        stroke(ctx, hex(shade(color, -0.7)), 1.5);
      }
    });
  crystalRes("res_crystal", 0x22d3ee);
  crystalRes("res_core_shard", 0xe879f9);
  canvasTexture(scene, "res_relic", 96, 96, (ctx) => {
    const c = 48;
    glowDot(ctx, c, c, 42, 0xfbbf24, 0.6);
    ctx.save();
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 12;
    poly(ctx, [
      [c, c - 30],
      [c + 22, c],
      [c, c + 30],
      [c - 22, c],
    ]);
    ctx.fillStyle = linear(ctx, 0, c - 30, 0, c + 30, [
      [0, "#fef3c7"],
      [1, "#b45309"],
    ]);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(c, c, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fffbeb";
    ctx.fill();
  });

  // Effects
  canvasTexture(scene, "fx_spark", 32, 32, (ctx) => glowDot(ctx, 16, 16, 16, 0xffffff));
  canvasTexture(scene, "fx_soft", 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.4, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  canvasTexture(scene, "fx_ring", 256, 256, (ctx) => {
    ctx.save();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    stroke(ctx, "rgba(255,255,255,0.95)", 10);
    ctx.restore();
  });
  canvasTexture(scene, "fx_slash", 256, 256, (ctx) => {
    const c = 128;
    ctx.save();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 14;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(c, c, 100 - i * 10, -0.95, 0.95);
      stroke(ctx, `rgba(255,255,255,${0.9 - i * 0.3})`, 10 - i * 3);
    }
    ctx.restore();
  });
  canvasTexture(scene, "fx_pillar", 64, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(32, 128, 24, 128, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, "proj_arrow", 64, 16, (ctx) => {
    ctx.save();
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(4, 8);
    ctx.lineTo(50, 8);
    stroke(ctx, "#e0f2fe", 2.5);
    poly(ctx, [
      [48, 3],
      [62, 8],
      [48, 13],
    ]);
    ctx.fillStyle = "#7dd3fc";
    ctx.fill();
    ctx.restore();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(4, 8);
      ctx.lineTo(12, 8 + s * 5);
      stroke(ctx, "#38bdf8", 2);
    }
  });
  canvasTexture(scene, "proj_bolt", 64, 64, (ctx) => {
    glowDot(ctx, 32, 32, 30, 0xe879f9);
    orb(ctx, 32, 32, 9, 0xfdf4ff, 0.2);
  });
  canvasTexture(scene, "merchant", 160, 160, (ctx) => {
    const c = 80;
    // stall canopy
    ctx.save();
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 18;
    poly(ctx, [
      [c - 60, c - 40],
      [c + 60, c - 40],
      [c + 70, c + 30],
      [c - 70, c + 30],
    ]);
    ctx.fillStyle = linear(ctx, 0, c - 40, 0, c + 30, [
      [0, "#0c4a6e"],
      [1, "#082f49"],
    ]);
    ctx.fill();
    ctx.restore();
    for (let i = -3; i <= 3; i++) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(56,189,248,0.45)" : "rgba(14,116,144,0.45)";
      ctx.fillRect(c + i * 18 - 9, c - 40, 18, 70);
    }
    stroke(ctx, "#7dd3fc", 3);
    orb(ctx, c, c + 8, 16, 0x0ea5e9, 0.5);
    glowDot(ctx, c, c + 8, 10, 0xe0f2fe, 0.9);
  });
}

export function treeTextureFor(regionKey: string, radius: number, seed: number): string {
  const v = seed % 2 === 0 ? "" : "2";
  switch (regionKey) {
    case "core":
      return `crystal_core${v}`;
    case "wastes":
      return `rock_wastes${v}`;
    case "forest":
      return radius < 40 ? "rock_plains" : `tree_forest${v}`;
    default:
      return radius < 36 ? "rock_plains" : `tree_plains${v}`;
  }
}

export const RESOURCE_TEXTURE: Record<string, string> = {
  scrap: "res_scrap",
  crystal: "res_crystal",
  core_shard: "res_core_shard",
  relic: "res_relic",
};
