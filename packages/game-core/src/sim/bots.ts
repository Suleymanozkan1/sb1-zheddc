// Development bots: server-side players driven by a tiny behaviour tree
// (wander → collect → attack → flee). They go through exactly the same input
// validation as real clients, so they double as a load/regression test.

import { Buttons } from "@cryptoarena/shared";
import { CHARACTERS, getCharacterDef, type CharacterDef } from "../characters";
import { angleTo, dist2 } from "../math";
import type { ArenaSimulation } from "./simulation";
import type { SimPlayer } from "./types";

type BotMode = "wander" | "collect" | "attack" | "flee";

interface BotState {
  mode: BotMode;
  seq: number;
  targetX: number;
  targetY: number;
  targetId: string | null;
  modeUntil: number;
  pickupCooldown: number;
}

const NAMES = ["Botrick", "Circuit", "Nullbyte", "Pixelpunk", "Rusty", "Sprocket", "Glitchy", "Kernel", "Voltra", "Qubit"];

export class BotController {
  private readonly bots = new Map<string, BotState>();
  private readonly sim: ArenaSimulation;

  constructor(sim: ArenaSimulation) {
    this.sim = sim;
  }

  spawn(count: number): void {
    for (let i = 0; i < count; i++) {
      const def: CharacterDef = CHARACTERS[i % CHARACTERS.length]!;
      const id = this.sim.nextId("bot");
      const level = 1 + Math.floor(this.sim.rng.next() * 12);
      this.sim.addPlayer({
        id,
        userId: `bot:${id}`,
        userCharacterId: null,
        isBot: true,
        name: `[BOT] ${NAMES[i % NAMES.length]}`,
        characterKey: def.key,
        def: getCharacterDef(def.key),
        base: def.base,
        upgrades: {},
        equipped: [],
        level,
        xp: 0,
        xpBoostUntil: 0,
        tint: def.color,
      });
      this.bots.set(id, { mode: "wander", seq: 0, targetX: 0, targetY: 0, targetId: null, modeUntil: 0, pickupCooldown: 0 });
    }
  }

  get count(): number {
    return this.bots.size;
  }

  /** Called once per fixed step before the simulation step. */
  update(): void {
    for (const [id, state] of this.bots) {
      const p = this.sim.players.get(id);
      if (!p) {
        this.bots.delete(id);
        continue;
      }
      if (!p.alive) continue;
      this.think(p, state);
      const dx = state.targetX - p.x;
      const dy = state.targetY - p.y;
      const d = Math.hypot(dx, dy);
      let mx = d > 40 ? dx / d : 0;
      let my = d > 40 ? dy / d : 0;
      let buttons = 0;
      let aim = Math.atan2(dy, dx);
      if (state.mode === "attack" && state.targetId) {
        const t = this.sim.players.get(state.targetId) ?? this.sim.npcs.get(state.targetId);
        if (t) {
          aim = angleTo(p.x, p.y, t.x, t.y);
          const range = p.stats.range + 30;
          if (dist2(p.x, p.y, t.x, t.y) < range * range) {
            buttons |= Buttons.ATTACK;
            if (p.def.attack === "projectile") {
              mx *= 0.2;
              my *= 0.2;
            }
            if (this.sim.rng.chance(0.01)) buttons |= Buttons.SKILL;
            if (this.sim.rng.chance(0.002)) buttons |= Buttons.ULTIMATE;
          }
        }
      }
      if (state.mode === "flee" && this.sim.rng.chance(0.03)) buttons |= Buttons.DASH;
      // Human-ish aim jitter so the bot-behaviour detector is exercised realistically.
      aim += (this.sim.rng.next() - 0.5) * 0.05;
      state.seq++;
      this.sim.queueInput(id, { seq: state.seq, mx, my, aim, buttons });

      if (state.mode === "collect" && --state.pickupCooldown <= 0) {
        state.pickupCooldown = 20;
        this.sim.collectResource(p);
      }
    }
  }

  private think(p: SimPlayer, s: BotState): void {
    const now = this.sim.now;
    if (p.hp < p.stats.maxHp * 0.25 && s.mode !== "flee") {
      s.mode = "flee";
      s.modeUntil = now + 4000;
      const c = this.sim.map.size / 2;
      const a = angleTo(c, c, p.x, p.y);
      s.targetX = p.x + Math.cos(a) * 900;
      s.targetY = p.y + Math.sin(a) * 900;
      return;
    }
    if (now < s.modeUntil && s.mode !== "attack") return;

    // Attack the nearest NPC or player in sight.
    let best: { id: string; x: number; y: number; d: number } | null = null;
    for (const n of this.sim.npcs.values()) {
      const d = dist2(p.x, p.y, n.x, n.y);
      if (d < 700 * 700 && (!best || d < best.d)) best = { id: n.id, x: n.x, y: n.y, d };
    }
    for (const o of this.sim.players.values()) {
      if (o.id === p.id || !o.alive) continue;
      const d = dist2(p.x, p.y, o.x, o.y);
      if (d < 500 * 500 && (!best || d < best.d)) best = { id: o.id, x: o.x, y: o.y, d };
    }
    if (best) {
      s.mode = "attack";
      s.targetId = best.id;
      const keep = p.def.attack === "projectile" ? p.stats.range * 0.7 : 0;
      const a = angleTo(best.x, best.y, p.x, p.y);
      s.targetX = best.x + Math.cos(a) * keep;
      s.targetY = best.y + Math.sin(a) * keep;
      s.modeUntil = now + 500;
      return;
    }

    let res: { x: number; y: number; d: number } | null = null;
    for (const r of this.sim.resources.values()) {
      const d = dist2(p.x, p.y, r.x, r.y);
      if (d < 1200 * 1200 && (!res || d < res.d)) res = { x: r.x, y: r.y, d };
    }
    if (res) {
      s.mode = "collect";
      s.targetX = res.x;
      s.targetY = res.y;
      s.modeUntil = now + 3000;
      return;
    }

    s.mode = "wander";
    s.targetId = null;
    const a = this.sim.rng.range(-Math.PI, Math.PI);
    s.targetX = Math.max(100, Math.min(this.sim.map.size - 100, p.x + Math.cos(a) * 800));
    s.targetY = Math.max(100, Math.min(this.sim.map.size - 100, p.y + Math.sin(a) * 800));
    s.modeUntil = now + 4000;
  }
}
