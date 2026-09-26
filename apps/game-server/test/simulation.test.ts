import { describe, expect, it } from "vitest";
import { Buttons } from "@cryptoarena/shared";
import { getCharacterDef, getNpcDef, maxTravel, type CharacterDef } from "@cryptoarena/game-core";
import { ArenaSimulation } from "../src/sim/simulation";
import type { SimEvents, SimPlayer } from "../src/sim/types";

function recorder() {
  const log: { type: string; args: unknown[] }[] = [];
  const events = new Proxy({} as SimEvents, {
    get: (_t, prop: string) => (...args: unknown[]) => log.push({ type: prop, args }),
  });
  return { log, events };
}

function makeSim() {
  const { log, events } = recorder();
  const sim = new ArenaSimulation(
    { seed: 42, worldSize: 10_000, tickRate: 60, npcDensity: 0, pvp: true, lootCatalog: [{ key: "blade_common", rarity: "COMMON", type: "WEAPON", dropWeight: 1, name: "Rusty Blade" }] },
    events,
  );
  return { sim, log };
}

function addPlayer(sim: ArenaSimulation, id: string, key = "warrior"): SimPlayer {
  const def: CharacterDef = getCharacterDef(key);
  const p = sim.addPlayer({ id, userId: `u-${id}`, userCharacterId: null, isBot: false, name: id, characterKey: key, def, base: def.base, upgrades: {}, equipped: [], level: 1, xp: 0, xpBoostUntil: 0, tint: 0 });
  p.spawnProtectedUntil = 0;
  return p;
}

function place(p: SimPlayer, x: number, y: number) {
  p.x = x;
  p.y = y;
  p.mover.x = x;
  p.mover.y = y;
}

// A spot on the map without obstacles or safe zones.
function clearSpot(sim: ArenaSimulation): { x: number; y: number } {
  for (let x = 1000; x < 9000; x += 97) {
    for (let y = 1000; y < 9000; y += 89) {
      if (!sim.map.grid.overlaps(x, y, 400) && !sim.map.zones.some((z) => (x - z.x) ** 2 + (y - z.y) ** 2 < (z.r + 400) ** 2)) return { x, y };
    }
  }
  throw new Error("no clear spot");
}

describe("server-authoritative simulation", () => {
  it("ignores input floods: a player can never out-run real time (speed hack)", () => {
    const { sim } = makeSim();
    const p = addPlayer(sim, "a");
    const s = clearSpot(sim);
    place(p, s.x, s.y);
    const startX = p.x;
    let seq = 0;
    const ticks = 60; // one second
    for (let t = 0; t < ticks; t++) {
      // Cheater sends 10 inputs per tick instead of 1.
      for (let i = 0; i < 10; i++) sim.queueInput("a", { seq: ++seq, mx: 1, my: 0, aim: 0, buttons: 0 });
      sim.step();
    }
    const travelled = p.x - startX;
    expect(travelled).toBeLessThanOrEqual(maxTravel(p.stats.speed, 1000) + 30);
  });

  it("rejects replayed / out-of-order sequence numbers", () => {
    const { sim } = makeSim();
    addPlayer(sim, "a");
    expect(sim.queueInput("a", { seq: 5, mx: 0, my: 0, aim: 0, buttons: 0 })).toBeNull();
    expect(sim.queueInput("a", { seq: 5, mx: 0, my: 0, aim: 0, buttons: 0 })).toBe("bad_seq");
    expect(sim.queueInput("a", { seq: 4, mx: 0, my: 0, aim: 0, buttons: 0 })).toBe("bad_seq");
  });

  it("enforces attack cooldown regardless of how often ATTACK is sent (impossible attack speed)", () => {
    const { sim, log } = makeSim();
    const p = addPlayer(sim, "a");
    const s = clearSpot(sim);
    place(p, s.x, s.y);
    let seq = 0;
    for (let t = 0; t < 120; t++) {
      sim.queueInput("a", { seq: ++seq, mx: 0, my: 0, aim: 0, buttons: Buttons.ATTACK });
      sim.step();
    }
    const attacks = log.filter((e) => e.type === "attack").length;
    // 2 seconds × 1.25 attacks/s (+1 for the first swing)
    expect(attacks).toBeLessThanOrEqual(Math.ceil(2 * p.stats.attackSpeed) + 1);
  });

  it("computes damage on the server and credits kills", () => {
    const { sim, log } = makeSim();
    const a = addPlayer(sim, "a");
    const b = addPlayer(sim, "b");
    const s = clearSpot(sim);
    place(a, s.x, s.y);
    place(b, s.x + 60, s.y);
    b.hp = 10;
    sim.queueInput("a", { seq: 1, mx: 0, my: 0, aim: 0, buttons: Buttons.ATTACK });
    sim.step();
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(log.some((e) => e.type === "playerKilled")).toBe(true);
  });

  it("protects players inside safe zones", () => {
    const { sim } = makeSim();
    const a = addPlayer(sim, "a");
    const b = addPlayer(sim, "b");
    const safe = sim.map.zones.find((z) => z.kind === "safe")!;
    place(a, safe.x, safe.y);
    place(b, safe.x + 50, safe.y);
    const hp = b.hp;
    sim.queueInput("a", { seq: 1, mx: 0, my: 0, aim: 0, buttons: Buttons.ATTACK });
    sim.step();
    expect(b.hp).toBe(hp);
  });

  it("prevents duplicate loot pickups and out-of-range pickups", () => {
    const { sim } = makeSim();
    const a = addPlayer(sim, "a");
    const b = addPlayer(sim, "b");
    const s = clearSpot(sim);
    place(a, s.x, s.y);
    place(b, s.x + 10, s.y);
    const loot = sim.dropLoot("blade_common", s.x, s.y, null)!;
    const first = sim.claimLoot(a);
    expect(first).not.toBeNull();
    expect(sim.claimLoot(b)).toBeNull(); // already claimed
    sim.finishPickup(loot.id);
    expect(sim.loot.has(loot.id)).toBe(false);

    const far = sim.dropLoot("blade_common", s.x + 1500, s.y, null)!;
    expect(sim.claimLoot(a, far.id)).toBe("too_far");
  });

  it("respects loot ownership for the killer", () => {
    const { sim } = makeSim();
    const a = addPlayer(sim, "a");
    const b = addPlayer(sim, "b");
    const s = clearSpot(sim);
    place(a, s.x, s.y);
    place(b, s.x, s.y);
    sim.dropLoot("blade_common", s.x, s.y, a.userId);
    expect(sim.claimLoot(b)).toBeNull();
    expect(sim.claimLoot(a)).not.toBeNull();
  });

  it("grants XP and gold for creature kills and levels up", () => {
    const { sim, log } = makeSim();
    const a = addPlayer(sim, "a");
    const s = clearSpot(sim);
    place(a, s.x, s.y);
    const npc = sim.spawnNpc(getNpcDef("slime"), { x: s.x + 60, y: s.y });
    npc.hp = 1;
    sim.queueInput("a", { seq: 1, mx: 0, my: 0, aim: 0, buttons: Buttons.ATTACK });
    sim.step();
    expect(sim.npcs.has(npc.id)).toBe(false);
    expect(a.npcKills).toBe(1);
    expect(a.xp).toBeGreaterThan(0);
    expect(log.some((e) => e.type === "goldGained")).toBe(true);
    a.xp = 100_000;
    sim.addXp(a, 1);
    expect(a.level).toBeGreaterThan(1);
  });

  it("dead players cannot act and respawn after the delay", () => {
    const { sim } = makeSim();
    const a = addPlayer(sim, "a");
    a.alive = false;
    a.respawnAt = sim.now + 1000;
    sim.queueInput("a", { seq: 1, mx: 1, my: 0, aim: 0, buttons: Buttons.ATTACK });
    sim.step();
    expect(a.inputQueue).toHaveLength(0);
    for (let i = 0; i < 70; i++) sim.step();
    expect(a.alive).toBe(true);
    expect(a.hp).toBe(a.stats.maxHp);
  });
});
