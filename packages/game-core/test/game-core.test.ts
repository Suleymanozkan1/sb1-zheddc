import { describe, expect, it } from "vitest";
import {
  DASH_DISTANCE,
  MAX_LEVEL,
  PLAYER_RADIUS,
  RateWindow,
  Rng,
  StaticGrid,
  buildItemCatalog,
  computeCombatStats,
  generateArena,
  getCharacterDef,
  isValidSeq,
  itemUpgradeCost,
  levelFromXp,
  maxTravel,
  mitigate,
  resolveCircle,
  rollDamage,
  rollLoot,
  sanitizeAngle,
  sanitizeMove,
  stepMovement,
  totalXpForLevel,
  BotBehaviorDetector,
} from "../src";

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
});

describe("map", () => {
  it("generates the same arena for the same seed", () => {
    const m1 = generateArena(7, 6000);
    const m2 = generateArena(7, 6000);
    expect(m1.obstacles.length).toBe(m2.obstacles.length);
    expect(m1.playerSpawns[0]).toEqual(m2.playerSpawns[0]);
  });

  it("never spawns players inside obstacles", () => {
    const m = generateArena(99, 10_000);
    for (const s of m.playerSpawns) expect(m.grid.overlaps(s.x, s.y, PLAYER_RADIUS)).toBe(false);
  });
});

describe("movement (anti-cheat: impossible movement)", () => {
  const map = generateArena(1337, 10_000);
  it("clamps client movement vectors to unit length and rejects NaN", () => {
    expect(sanitizeMove(50, 0)).toEqual({ mx: 1, my: 0 });
    expect(sanitizeMove(Number.NaN, Infinity)).toEqual({ mx: 0, my: 0 });
    const d = sanitizeMove(1, 1);
    expect(Math.hypot(d.mx, d.my)).toBeCloseTo(1);
    expect(sanitizeAngle(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("never moves further than speed × dt", () => {
    const spawn = map.playerSpawns[0]!;
    const state = { x: spawn.x, y: spawn.y, dashRemainingMs: 0, dashDirX: 0, dashDirY: 0 };
    const { mx, my } = sanitizeMove(1000, 1000);
    for (let i = 0; i < 60; i++) {
      const bx = state.x;
      const by = state.y;
      stepMovement(state, mx, my, 300, 1000 / 60, map);
      expect(Math.hypot(state.x - bx, state.y - by)).toBeLessThanOrEqual(maxTravel(300, 1000 / 60) + 0.001);
    }
  });

  it("keeps entities inside the world and out of walls", () => {
    const grid = new StaticGrid([{ kind: "rect", x: 100, y: 100, w: 100, h: 100 }]);
    const r = resolveCircle(grid, 150, 150, 20, 1000);
    expect(grid.overlaps(r.x, r.y, 19.9)).toBe(false);
    const edge = resolveCircle(grid, -50, 5000, 20, 1000);
    expect(edge).toMatchObject({ x: 20, y: 980 });
  });

  it("dash covers the configured distance", () => {
    const state = { x: 5000, y: 5000, dashRemainingMs: 140, dashDirX: 1, dashDirY: 0 };
    const empty = { ...map, grid: new StaticGrid([]) };
    for (let i = 0; i < 20; i++) stepMovement(state, 0, 0, 300, 1000 / 60, empty);
    expect(state.x - 5000).toBeGreaterThan(DASH_DISTANCE * 0.95);
    expect(state.x - 5000).toBeLessThan(DASH_DISTANCE * 1.05);
  });
});

describe("progression & stats", () => {
  it("levels are monotonic and capped at 50", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(totalXpForLevel(10))).toBe(10);
    expect(levelFromXp(totalXpForLevel(10) - 1)).toBe(9);
    expect(levelFromXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
  });

  it("caps stats so gear cannot produce absurd values", () => {
    const base = getCharacterDef("assassin").base;
    const huge = computeCombatStats(base, 50, {}, [{ stats: { critChance: 5, speed: 10_000, attackSpeed: 50, lifesteal: 3 }, upgradeLevel: 20 }]);
    expect(huge.critChance).toBeLessThanOrEqual(0.75);
    expect(huge.speed).toBeLessThanOrEqual(520);
    expect(huge.attackSpeed).toBeLessThanOrEqual(4);
    expect(huge.lifesteal).toBeLessThanOrEqual(0.3);
  });

  it("armor mitigates damage and crits apply", () => {
    expect(mitigate(100, 100)).toBe(50);
    const normal = rollDamage({ damage: 100, critChance: 0, critDamage: 2 }, 0, 1, 0.5);
    const crit = rollDamage({ damage: 100, critChance: 1, critDamage: 2 }, 0, 1, 0.5);
    expect(normal).toEqual({ amount: 100, crit: false });
    expect(crit).toEqual({ amount: 200, crit: true });
  });

  it("item upgrade costs grow and stop at +20", () => {
    expect(itemUpgradeCost("RARE", 1)! > itemUpgradeCost("RARE", 0)!).toBe(true);
    expect(itemUpgradeCost("MYTHIC", 20)).toBeNull();
  });
});

describe("loot", () => {
  it("only rolls droppable, non-skin items", () => {
    const catalog = buildItemCatalog();
    const rng = new Rng(5);
    for (let i = 0; i < 500; i++) {
      const drop = rollLoot(rng, 3, catalog);
      if (drop) {
        expect(drop.type).not.toBe("SKIN");
        expect(drop.dropWeight).toBeGreaterThan(0);
      }
    }
  });
});

describe("anti-cheat heuristics", () => {
  it("rate window rejects packet spam", () => {
    const w = new RateWindow(5, 1000);
    const results = Array.from({ length: 8 }, (_, i) => w.hit(1000 + i));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(w.hit(3000)).toBe(true);
  });

  it("sequence numbers must strictly increase (replay protection)", () => {
    expect(isValidSeq(10, 11)).toBe(true);
    expect(isValidSeq(10, 10)).toBe(false);
    expect(isValidSeq(10, 3)).toBe(false);
    expect(isValidSeq(10, 10.5)).toBe(false);
    expect(isValidSeq(10, 1_000_000)).toBe(false);
  });

  it("flags machine-perfect input timing", () => {
    const d = new BotBehaviorDetector(100);
    for (let i = 0; i < 120; i++) d.record(i * 16, 0, true);
    expect(d.score()).toBeGreaterThanOrEqual(0.8);
    const human = new BotBehaviorDetector(100);
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 14 + (i % 7);
      human.record(t, Math.sin(i), true);
    }
    expect(human.score()).toBeLessThan(0.8);
  });
});
