// Deterministic arena generation. The server and every client generate the same static map
// from the seed carried in the room state, so obstacles are never sent over the network.

import { StaticGrid, circleOverlapsBody, type StaticBody } from "./collision";
import { WORLD_SIZE } from "./constants";
import { Rng } from "./rng";

export interface Region {
  key: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  /** Distance range from world center. */
  minR: number;
  maxR: number;
  color: number;
}

export const REGIONS: readonly Region[] = [
  { key: "core", name: "Crystal Core", tier: 4, minR: 0, maxR: 1_400, color: 0x2a1745 },
  { key: "wastes", name: "Ashen Wastes", tier: 3, minR: 1_400, maxR: 2_600, color: 0x2b1a14 },
  { key: "forest", name: "Shadow Forest", tier: 2, minR: 2_600, maxR: 3_800, color: 0x0f2418 },
  { key: "plains", name: "Neon Plains", tier: 1, minR: 3_800, maxR: 99_999, color: 0x0d1b2a },
];

export type ZoneKind = "xp_bonus" | "healing" | "safe";

export interface Zone {
  id: string;
  kind: ZoneKind;
  x: number;
  y: number;
  r: number;
}

export interface ArenaMap {
  seed: number;
  size: number;
  obstacles: StaticBody[];
  grid: StaticGrid;
  zones: Zone[];
  playerSpawns: { x: number; y: number }[];
  merchants: { id: string; x: number; y: number }[];
}

export function regionAt(x: number, y: number, size = WORLD_SIZE): Region {
  const c = size / 2;
  const d = Math.hypot(x - c, y - c);
  for (const r of REGIONS) {
    if (d >= r.minR && d < r.maxR) return r;
  }
  return REGIONS[REGIONS.length - 1]!;
}

export function zonesAt(map: ArenaMap, x: number, y: number): Zone[] {
  return map.zones.filter((z) => (x - z.x) ** 2 + (y - z.y) ** 2 <= z.r * z.r);
}

/** Small LRU of generated maps keyed by (seed, size); ranked rooms use random seeds. */
const cache = new Map<string, ArenaMap>();
const MAX_CACHED_MAPS = 8;

export function generateArena(seed: number, size = WORLD_SIZE): ArenaMap {
  const cacheKey = `${seed}:${size}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cached;
  }

  const rng = new Rng(seed);
  const c = size / 2;
  const zones: Zone[] = [];
  const merchants: { id: string; x: number; y: number }[] = [];

  // Safe merchant camps at the four compass points of the outer plains.
  const campR = size * 0.42;
  [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach((a, i) => {
    const x = c + Math.cos(a) * campR;
    const y = c + Math.sin(a) * campR;
    zones.push({ id: `safe_${i}`, kind: "safe", x, y, r: 320 });
    merchants.push({ id: `merchant_${i}`, x, y });
  });

  // XP bonus zones deeper in, healing springs spread around.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const d = rng.range(1_700, 3_200);
    zones.push({ id: `xp_${i}`, kind: "xp_bonus", x: c + Math.cos(a) * d, y: c + Math.sin(a) * d, r: 360 });
  }
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(1_000, size * 0.45);
    zones.push({ id: `heal_${i}`, kind: "healing", x: c + Math.cos(a) * d, y: c + Math.sin(a) * d, r: 170 });
  }

  const keepClear = (x: number, y: number, r: number): boolean =>
    zones.some((z) => (x - z.x) ** 2 + (y - z.y) ** 2 < (z.r + r + 40) ** 2);

  const obstacles: StaticBody[] = [];
  const blocked = (b: StaticBody): boolean =>
    obstacles.some((o) =>
      b.kind === "circle"
        ? circleOverlapsBody(b.x, b.y, b.r + 70, o)
        : circleOverlapsBody(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2 + 70, o),
    );

  // Tree / rock clusters.
  let attempts = 0;
  while (obstacles.length < 520 && attempts < 8_000) {
    attempts++;
    const cx = rng.range(200, size - 200);
    const cy = rng.range(200, size - 200);
    const count = rng.int(2, 6);
    for (let i = 0; i < count; i++) {
      const r = rng.range(28, 80);
      const body: StaticBody = { kind: "circle", x: cx + rng.range(-220, 220), y: cy + rng.range(-220, 220), r };
      if (body.x < r || body.y < r || body.x > size - r || body.y > size - r) continue;
      if (keepClear(body.x, body.y, r) || blocked(body)) continue;
      obstacles.push(body);
    }
  }

  // Ruined walls (rectangles), denser towards the core.
  attempts = 0;
  let walls = 0;
  while (walls < 140 && attempts < 6_000) {
    attempts++;
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * size * 0.47;
    const horizontal = rng.chance(0.5);
    const len = rng.range(160, 460);
    const thick = rng.range(34, 56);
    const w = horizontal ? len : thick;
    const h = horizontal ? thick : len;
    const body: StaticBody = { kind: "rect", x: c + Math.cos(a) * d - w / 2, y: c + Math.sin(a) * d - h / 2, w, h };
    if (body.x < 50 || body.y < 50 || body.x + w > size - 50 || body.y + h > size - 50) continue;
    if (keepClear(body.x + w / 2, body.y + h / 2, Math.max(w, h) / 2) || blocked(body)) continue;
    obstacles.push(body);
    walls++;
  }

  const grid = new StaticGrid(obstacles);

  const playerSpawns: { x: number; y: number }[] = [];
  attempts = 0;
  while (playerSpawns.length < 48 && attempts < 5_000) {
    attempts++;
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(size * 0.4, size * 0.47);
    const x = c + Math.cos(a) * d;
    const y = c + Math.sin(a) * d;
    if (!grid.overlaps(x, y, 60)) playerSpawns.push({ x, y });
  }

  const map: ArenaMap = { seed, size, obstacles, grid, zones, playerSpawns, merchants };
  cache.set(cacheKey, map);
  while (cache.size > MAX_CACHED_MAPS) cache.delete(cache.keys().next().value!);
  return map;
}

/** Finds a random free position in the given region tier (used for NPC/resource spawning). */
export function randomFreePoint(map: ArenaMap, rng: Rng, tier: number | null, radius: number): { x: number; y: number } {
  const c = map.size / 2;
  for (let i = 0; i < 200; i++) {
    let x: number;
    let y: number;
    if (tier === null) {
      x = rng.range(radius, map.size - radius);
      y = rng.range(radius, map.size - radius);
    } else {
      const region = REGIONS.find((r) => r.tier === tier)!;
      const a = rng.range(0, Math.PI * 2);
      const maxR = Math.min(region.maxR, map.size * 0.49);
      const d = rng.range(region.minR + radius, Math.max(region.minR + radius + 1, maxR - radius));
      x = c + Math.cos(a) * d;
      y = c + Math.sin(a) * d;
    }
    if (x < radius || y < radius || x > map.size - radius || y > map.size - radius) continue;
    if (map.grid.overlaps(x, y, radius + 4)) continue;
    if (map.zones.some((z) => z.kind === "safe" && (x - z.x) ** 2 + (y - z.y) ** 2 < (z.r + radius) ** 2)) continue;
    return { x, y };
  }
  return { x: c, y: c + 1_500 };
}
