// Server-authoritative arena simulation. Framework-free so it can be unit tested:
// the Colyseus room feeds it validated inputs and mirrors its entities into the synced state.
//
// Design notes (patterns adapted from colyseus/tutorial-phaser Part 4 and halftheopposite/tosios):
//  - fixed timestep; clients send one input per fixed step, the server consumes them against a
//    per-player time budget so extra inputs can never speed a player up;
//  - NPCs use a small finite-state machine (idle / wander / chase / flee / return);
//  - projectiles are simulated server-side and hit-tested against a dynamic spatial grid.

import {
  Buttons,
  type CombatStats,
  type PlayerMoveInput,
} from "@cryptoarena/shared";
import {
  DASH_COOLDOWN_MS,
  DynamicGrid,
  MAX_INPUT_QUEUE,
  NPC_POPULATION,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  PROJECTILE_RADIUS,
  RESOURCES,
  RESOURCE_POPULATION,
  RESPAWN_DELAY_MS,
  Rng,
  SPAWN_PROTECTION_MS,
  angleDiff,
  angleTo,
  computeCombatStats,
  dist2,
  generateArena,
  getNpcDef,
  isValidSeq,
  killXp,
  levelFromXp,
  maxTravel,
  randomFreePoint,
  resolveCircle,
  rollDamage,
  rollLoot,
  sanitizeAngle,
  sanitizeMove,
  startDash,
  stepMovement,
  zonesAt,
  type AbilityEffect,
  type ArenaMap,
  type LootCandidate,
  type NpcDef,
} from "@cryptoarena/game-core";
import type { Buff, Killer, PendingMeteor, SimEvents, SimLoot, SimNpc, SimPlayer, SimProjectile, SimResource } from "./types";

export interface SimulationOptions {
  seed: number;
  worldSize: number;
  tickRate: number;
  npcDensity: number;
  pvp: boolean;
  lootCatalog: readonly (LootCandidate & { name: string })[];
}

const MELEE_ARC = Math.PI / 2.4;
const NPC_WAKE_RADIUS = 1_700;
const LOOT_OWNER_MS = 10_000;
const LOOT_LIFETIME_MS = 60_000;
const RESOURCE_RESPAWN_MS = 25_000;
const NPC_RESPAWN_MS = 20_000;
const LEASH_DISTANCE = 950;
const MAX_STEP_BUDGET_MS = 250;

export type AddPlayerInput = Omit<
  SimPlayer,
  | "x" | "y" | "mover" | "aim" | "hp" | "alive" | "respawnAt" | "spawnProtectedUntil" | "lastSeq" | "ackSeq" | "inputQueue" | "stepBudgetMs"
  | "moveX" | "moveY" | "buttons" | "nextAttackAt" | "nextDashAt" | "nextSkillAt" | "nextUltAt" | "buffs" | "lastHitBy" | "lastHitAt"
  | "kills" | "deaths" | "npcKills" | "damageDealt" | "score" | "stats" | "idleSteps"
> & { hpFraction?: number; cooldowns?: { attack: number; dash: number; skill: number; ultimate: number } };

export type InputRejection = "dead" | "bad_seq" | "queue_full" | "invalid";

export class ArenaSimulation {
  readonly map: ArenaMap;
  readonly rng: Rng;
  readonly opts: SimulationOptions;
  readonly dt: number;
  now = 0;

  readonly players = new Map<string, SimPlayer>();
  readonly npcs = new Map<string, SimNpc>();
  readonly projectiles = new Map<string, SimProjectile>();
  readonly loot = new Map<string, SimLoot>();
  readonly resources = new Map<string, SimResource>();

  private readonly events: SimEvents;
  private readonly playerGrid = new DynamicGrid<SimPlayer>(300);
  private readonly npcGrid = new DynamicGrid<SimNpc>(300);
  private readonly meteors: PendingMeteor[] = [];
  private readonly respawnQueue: { at: number; kind: "npc" | "resource"; key: string }[] = [];
  private idCounter = 0;
  private wakeTimer = 0;

  constructor(opts: SimulationOptions, events: SimEvents) {
    this.opts = opts;
    this.events = events;
    this.rng = new Rng(opts.seed ^ 0x9e3779b9);
    this.map = generateArena(opts.seed, opts.worldSize);
    this.dt = 1000 / opts.tickRate;
  }

  nextId(prefix: string): string {
    this.idCounter++;
    return `${prefix}${this.idCounter.toString(36)}`;
  }

  // ───────────────────────── Population ─────────────────────────

  populate(): void {
    const scale = this.opts.npcDensity * (this.opts.worldSize / 10_000) ** 2;
    for (const p of NPC_POPULATION) {
      const n = p.key === "titan" ? Math.min(1, Math.round(p.count * scale)) : Math.round(p.count * scale);
      for (let i = 0; i < n; i++) this.spawnNpc(getNpcDef(p.key));
    }
    for (const p of RESOURCE_POPULATION) {
      const def = RESOURCES.find((r) => r.key === p.key)!;
      const n = Math.round(p.count * scale);
      for (let i = 0; i < n; i++) this.spawnResource(def.key);
    }
  }

  spawnNpc(def: NpcDef, at?: { x: number; y: number }): SimNpc {
    const pos = at ?? (def.key === "titan" ? { x: this.map.size / 2, y: this.map.size / 2 } : randomFreePoint(this.map, this.rng, def.tier, def.radius));
    const npc: SimNpc = {
      id: this.nextId("n"),
      def,
      x: pos.x,
      y: pos.y,
      homeX: pos.x,
      homeY: pos.y,
      aim: this.rng.range(-Math.PI, Math.PI),
      hp: def.hp,
      maxHp: def.hp,
      state: "idle",
      stateUntil: this.now + this.rng.range(500, 3000),
      targetId: null,
      wanderX: pos.x,
      wanderY: pos.y,
      nextAttackAt: 0,
      awake: false,
      damageBy: new Map(),
    };
    this.npcs.set(npc.id, npc);
    this.events.entityAdded("npc", npc.id);
    return npc;
  }

  spawnResource(key: string): SimResource {
    const def = RESOURCES.find((r) => r.key === key)!;
    const pos = randomFreePoint(this.map, this.rng, def.tier, 20);
    const r: SimResource = { id: this.nextId("r"), def, x: pos.x, y: pos.y };
    this.resources.set(r.id, r);
    this.events.entityAdded("resource", r.id);
    return r;
  }

  // ───────────────────────── Players ─────────────────────────

  addPlayer(input: AddPlayerInput): SimPlayer {
    const spawn = this.pickSpawn();
    const stats = computeCombatStats(input.base, input.level, input.upgrades, input.equipped);
    const p: SimPlayer = {
      ...input,
      stats,
      x: spawn.x,
      y: spawn.y,
      mover: { x: spawn.x, y: spawn.y, dashRemainingMs: 0, dashDirX: 0, dashDirY: 0 },
      aim: 0,
      hp: Math.max(1, Math.round(stats.maxHp * (input.hpFraction ?? 1))),
      alive: true,
      respawnAt: 0,
      spawnProtectedUntil: this.now + SPAWN_PROTECTION_MS,
      lastSeq: 0,
      ackSeq: 0,
      inputQueue: [],
      stepBudgetMs: 0,
      moveX: 0,
      moveY: 0,
      buttons: 0,
      nextAttackAt: this.now + (input.cooldowns?.attack ?? 0),
      nextDashAt: this.now + (input.cooldowns?.dash ?? 0),
      nextSkillAt: this.now + (input.cooldowns?.skill ?? 0),
      nextUltAt: this.now + (input.cooldowns?.ultimate ?? 0),
      buffs: [],
      lastHitBy: null,
      lastHitAt: 0,
      kills: 0,
      deaths: 0,
      npcKills: 0,
      damageDealt: 0,
      score: 0,
      idleSteps: 0,
    };
    this.players.set(p.id, p);
    this.events.entityAdded("player", p.id);
    return p;
  }

  removePlayer(id: string): SimPlayer | undefined {
    const p = this.players.get(id);
    if (!p) return undefined;
    this.players.delete(id);
    this.events.entityRemoved("player", id);
    return p;
  }

  private pickSpawn(): { x: number; y: number } {
    const spawns = this.map.playerSpawns;
    for (let i = 0; i < 12; i++) {
      const s = this.rng.pick(spawns);
      let crowded = false;
      for (const p of this.players.values()) {
        if (p.alive && dist2(p.x, p.y, s.x, s.y) < 400 * 400) {
          crowded = true;
          break;
        }
      }
      if (!crowded) return { ...s };
    }
    return { ...this.rng.pick(spawns) };
  }

  /** Validates and enqueues an input. Never trusts position, damage or any outcome from the client. */
  queueInput(id: string, raw: PlayerMoveInput): InputRejection | null {
    const p = this.players.get(id);
    if (!p) return "invalid";
    if (!isValidSeq(p.lastSeq, raw.seq)) return "bad_seq";
    if (p.inputQueue.length >= MAX_INPUT_QUEUE) return "queue_full";
    const move = sanitizeMove(raw.mx, raw.my);
    p.inputQueue.push({ seq: raw.seq, mx: move.mx, my: move.my, aim: sanitizeAngle(raw.aim), buttons: raw.buttons & 0b1111 });
    p.lastSeq = raw.seq;
    return null;
  }

  effectiveStats(p: SimPlayer): CombatStats & { invisible: boolean } {
    let damage = 1;
    let armor = 1;
    let speed = 1;
    let atk = 1;
    let lifesteal = 0;
    let invisible = false;
    for (const b of p.buffs) {
      damage *= b.damageMult;
      armor *= b.armorMult;
      speed *= b.speedMult;
      atk *= b.attackSpeedMult;
      lifesteal += b.lifesteal;
      invisible ||= b.invisible;
    }
    return {
      ...p.stats,
      damage: p.stats.damage * damage,
      armor: p.stats.armor * armor,
      speed: Math.min(640, p.stats.speed * speed),
      attackSpeed: Math.min(5, p.stats.attackSpeed * atk),
      lifesteal: Math.min(0.4, p.stats.lifesteal + lifesteal),
      invisible,
    };
  }

  recomputeStats(p: SimPlayer): void {
    const ratio = p.stats.maxHp > 0 ? p.hp / p.stats.maxHp : 1;
    p.stats = computeCombatStats(p.base, p.level, p.upgrades, p.equipped);
    p.hp = Math.max(1, Math.min(p.stats.maxHp, Math.round(p.stats.maxHp * ratio)));
    this.events.statsChanged(p);
  }

  addXp(p: SimPlayer, amount: number): void {
    if (amount <= 0) return;
    const zoneBonus = zonesAt(this.map, p.x, p.y).some((z) => z.kind === "xp_bonus") ? 1.5 : 1;
    const boost = p.xpBoostUntil > Date.now() ? 1.5 : 1;
    const gained = Math.round(amount * zoneBonus * boost);
    p.xp += gained;
    if (!p.isBot) this.events.xpGained(p, gained);
    this.checkLevel(p);
  }

  private checkLevel(p: SimPlayer): void {
    const lvl = levelFromXp(p.xp);
    if (lvl > p.level) {
      p.level = lvl;
      this.recomputeStats(p);
      p.hp = p.stats.maxHp;
      this.events.levelUp(p);
    }
  }

  // ───────────────────────── Tick ─────────────────────────

  step(): void {
    this.now += this.dt;

    // Spatial indexes for this tick (positions at the start of the tick).
    this.playerGrid.clear();
    for (const p of this.players.values()) if (p.alive) this.playerGrid.insert(p);
    this.npcGrid.clear();
    for (const n of this.npcs.values()) this.npcGrid.insert(n);

    for (const p of this.players.values()) this.stepPlayer(p);

    this.wakeTimer -= this.dt;
    if (this.wakeTimer <= 0) {
      this.wakeTimer = 250;
      this.updateNpcWakeState();
    }
    for (const n of this.npcs.values()) if (n.awake) this.stepNpc(n);

    this.stepProjectiles();
    this.stepMeteors();
    this.stepWorld();
  }

  private stepPlayer(p: SimPlayer): void {
    p.buffs = p.buffs.filter((b) => b.until > this.now);

    if (!p.alive) {
      p.inputQueue.length = 0;
      if (this.now >= p.respawnAt) this.respawn(p);
      return;
    }

    // Time budget: each processed input consumes one fixed step.
    p.stepBudgetMs = Math.min(MAX_STEP_BUDGET_MS, p.stepBudgetMs + this.dt);
    const eff = this.effectiveStats(p);
    let processed = 0;
    while (p.inputQueue.length > 0 && p.stepBudgetMs >= this.dt && processed < 4) {
      const input = p.inputQueue.shift()!;
      p.stepBudgetMs -= this.dt;
      processed++;
      this.applyInput(p, input, eff);
    }
    if (processed === 0) {
      // No fresh input: keep the last movement intent for a few frames (network jitter), then stop.
      p.idleSteps++;
      if (p.idleSteps > 6) {
        p.moveX = 0;
        p.moveY = 0;
        p.buttons = 0;
      }
    } else {
      p.idleSteps = 0;
    }
    if (processed === 0 && (p.moveX !== 0 || p.moveY !== 0 || p.mover.dashRemainingMs > 0)) {
      this.move(p, p.moveX, p.moveY, eff.speed);
    }

    // Zones
    const zones = zonesAt(this.map, p.x, p.y);
    if (zones.some((z) => z.kind === "healing") && p.hp < p.stats.maxHp) {
      p.hp = Math.min(p.stats.maxHp, p.hp + (p.stats.maxHp * 0.03 * this.dt) / 1000);
    }
  }

  private move(p: SimPlayer, mx: number, my: number, speed: number): void {
    const bx = p.x;
    const by = p.y;
    p.mover.x = p.x;
    p.mover.y = p.y;
    stepMovement(p.mover, mx, my, speed, this.dt, this.map, PLAYER_RADIUS);
    p.x = p.mover.x;
    p.y = p.mover.y;
    // Invariant check: the server itself must never produce impossible movement.
    const travelled = Math.hypot(p.x - bx, p.y - by);
    if (travelled > maxTravel(speed, this.dt) + PLAYER_RADIUS) {
      this.events.suspicious(p, "impossible_movement", 5, { travelled, allowed: maxTravel(speed, this.dt) });
      p.x = bx;
      p.y = by;
      p.mover.x = bx;
      p.mover.y = by;
    }
  }

  private applyInput(p: SimPlayer, input: PlayerMoveInput, eff: CombatStats): void {
    p.ackSeq = input.seq;
    p.moveX = input.mx;
    p.moveY = input.my;
    p.aim = input.aim;
    p.buttons = input.buttons;

    if (input.buttons & Buttons.DASH && this.now >= p.nextDashAt) {
      startDash(p.mover, input.mx, input.my, input.aim);
      p.nextDashAt = this.now + DASH_COOLDOWN_MS;
    }
    this.move(p, input.mx, input.my, eff.speed);

    if (input.buttons & Buttons.ATTACK && this.now >= p.nextAttackAt) {
      p.nextAttackAt = this.now + 1000 / eff.attackSpeed;
      this.basicAttack(p);
    }
    if (input.buttons & Buttons.SKILL && this.now >= p.nextSkillAt) {
      p.nextSkillAt = this.now + p.def.skill.cooldownMs;
      this.castAbility(p, p.def.skill.effects, "skill");
    }
    if (input.buttons & Buttons.ULTIMATE && this.now >= p.nextUltAt) {
      p.nextUltAt = this.now + p.def.ultimate.cooldownMs;
      this.castAbility(p, p.def.ultimate.effects, "ultimate");
    }
    if (input.buttons & (Buttons.ATTACK | Buttons.SKILL | Buttons.ULTIMATE)) {
      p.spawnProtectedUntil = 0; // attacking ends spawn protection
    }
  }

  private respawn(p: SimPlayer): void {
    const s = this.pickSpawn();
    p.x = s.x;
    p.y = s.y;
    p.mover = { x: s.x, y: s.y, dashRemainingMs: 0, dashDirX: 0, dashDirY: 0 };
    p.hp = p.stats.maxHp;
    p.alive = true;
    p.buffs = [];
    p.spawnProtectedUntil = this.now + SPAWN_PROTECTION_MS;
    this.events.respawn(p);
  }

  // ───────────────────────── Combat ─────────────────────────

  private basicAttack(p: SimPlayer): void {
    const eff = this.effectiveStats(p);
    if (p.def.attack === "projectile") {
      this.spawnProjectile(p, p.aim, p.def.projectileSpeed, 1, eff.range, p.def.key === "mage" ? "bolt" : "arrow");
      this.events.attack(p, "projectile", eff.range);
    } else {
      this.meleeHit(p, eff.range, MELEE_ARC, 1);
      this.events.attack(p, "melee", eff.range);
    }
  }

  private spawnProjectile(p: SimPlayer, angle: number, speed: number, damageMult: number, range: number, kind: "arrow" | "bolt"): void {
    const ox = p.x + Math.cos(angle) * (PLAYER_RADIUS + 8);
    const oy = p.y + Math.sin(angle) * (PLAYER_RADIUS + 8);
    const proj: SimProjectile = {
      id: this.nextId("p"),
      ownerId: p.id,
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: PROJECTILE_RADIUS,
      damageMult,
      bornAt: this.now,
      expiresAt: this.now + (range / speed) * 1000,
      kind,
      hit: new Set(),
      pierce: false,
    };
    this.projectiles.set(proj.id, proj);
    this.events.entityAdded("projectile", proj.id);
  }

  /** Hits every valid target in a cone in front of the attacker. */
  private meleeHit(p: SimPlayer, range: number, arc: number, damageMult: number): void {
    const reach = range + PLAYER_RADIUS;
    const test = (x: number, y: number, r: number): boolean => {
      const d2 = dist2(p.x, p.y, x, y);
      if (d2 > (reach + r) ** 2) return false;
      if (d2 < (PLAYER_RADIUS + r) ** 2) return true;
      return Math.abs(angleDiff(p.aim, angleTo(p.x, p.y, x, y))) <= arc;
    };
    this.forTargetsNear(p, p.x, p.y, reach + 80, (t) => {
      if (t.kind === "player" ? test(t.player.x, t.player.y, PLAYER_RADIUS) : test(t.npc.x, t.npc.y, t.npc.def.radius)) {
        this.hit(p, t, damageMult);
      }
    });
  }

  private aoeHit(p: SimPlayer, x: number, y: number, radius: number, damageMult: number): void {
    this.forTargetsNear(p, x, y, radius + 80, (t) => {
      const tx = t.kind === "player" ? t.player.x : t.npc.x;
      const ty = t.kind === "player" ? t.player.y : t.npc.y;
      const tr = t.kind === "player" ? PLAYER_RADIUS : t.npc.def.radius;
      if (dist2(x, y, tx, ty) <= (radius + tr) ** 2) this.hit(p, t, damageMult);
    });
  }

  private forTargetsNear(
    p: SimPlayer,
    x: number,
    y: number,
    r: number,
    visit: (t: { kind: "player"; player: SimPlayer } | { kind: "npc"; npc: SimNpc }) => void,
  ): void {
    if (this.opts.pvp) {
      this.playerGrid.queryRadius(x, y, r, (other) => {
        if (other.id !== p.id && other.alive) visit({ kind: "player", player: other });
      });
    }
    this.npcGrid.queryRadius(x, y, r + 80, (npc) => {
      if (npc.hp > 0) visit({ kind: "npc", npc });
    });
  }

  private castAbility(p: SimPlayer, effects: readonly AbilityEffect[], kind: "skill" | "ultimate"): void {
    const eff = this.effectiveStats(p);
    let range = 0;
    for (const e of effects) {
      switch (e.type) {
        case "aoe":
          this.aoeHit(p, p.x, p.y, e.radius, e.damageMult);
          range = Math.max(range, e.radius);
          break;
        case "cone":
          this.meleeHit(p, e.range, e.arc, e.damageMult);
          range = Math.max(range, e.range);
          break;
        case "multishot": {
          const n = e.count;
          for (let i = 0; i < n; i++) {
            const a = p.aim + (n === 1 ? 0 : -e.spread / 2 + (e.spread * i) / (n - 1));
            this.spawnProjectile(p, a, e.speed, e.damageMult, eff.range, "arrow");
          }
          range = eff.range;
          break;
        }
        case "blink": {
          const tx = p.x + Math.cos(p.aim) * e.distance;
          const ty = p.y + Math.sin(p.aim) * e.distance;
          const res = resolveCircle(this.map.grid, tx, ty, PLAYER_RADIUS, this.map.size);
          if (this.map.grid.lineOfSight(p.x, p.y, res.x, res.y)) {
            p.x = res.x;
            p.y = res.y;
            p.mover.x = res.x;
            p.mover.y = res.y;
          }
          this.aoeHit(p, p.x, p.y, e.radius, e.damageMult);
          range = e.distance;
          break;
        }
        case "buff":
          p.buffs.push({
            until: this.now + e.durationMs,
            damageMult: e.damageMult ?? 1,
            armorMult: e.armorMult ?? 1,
            speedMult: e.speedMult ?? 1,
            attackSpeedMult: e.attackSpeedMult ?? 1,
            lifesteal: e.lifesteal ?? 0,
            invisible: e.invisible ?? false,
          } satisfies Buff);
          break;
        case "heal":
          p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * e.fraction);
          break;
        case "meteor": {
          const d = Math.min(e.range, 650);
          this.meteors.push({ ownerId: p.id, x: p.x + Math.cos(p.aim) * d, y: p.y + Math.sin(p.aim) * d, at: this.now + e.delayMs, radius: e.radius, damageMult: e.damageMult });
          range = d;
          break;
        }
      }
    }
    this.events.attack(p, kind, range);
  }

  private isSafe(x: number, y: number): boolean {
    return zonesAt(this.map, x, y).some((z) => z.kind === "safe");
  }

  /** Applies damage from a player to a target. All numbers are computed here, never on the client. */
  private hit(attacker: SimPlayer, t: { kind: "player"; player: SimPlayer } | { kind: "npc"; npc: SimNpc }, mult: number): void {
    const eff = this.effectiveStats(attacker);
    if (t.kind === "player") {
      const v = t.player;
      if (!v.alive || v.id === attacker.id) return;
      if (this.now < v.spawnProtectedUntil || this.isSafe(v.x, v.y) || this.isSafe(attacker.x, attacker.y)) return;
      const veff = this.effectiveStats(v);
      const dmg = rollDamage(eff, veff.armor, mult, this.rng.next());
      this.applyPlayerDamage(v, dmg.amount, dmg.crit, { kind: "player", player: attacker });
      attacker.damageDealt += dmg.amount;
      if (eff.lifesteal > 0) attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + dmg.amount * eff.lifesteal);
    } else {
      const n = t.npc;
      if (n.hp <= 0) return;
      const dmg = rollDamage(eff, n.def.armor, mult, this.rng.next());
      n.hp -= dmg.amount;
      n.damageBy.set(attacker.id, (n.damageBy.get(attacker.id) ?? 0) + dmg.amount);
      attacker.damageDealt += dmg.amount;
      if (eff.lifesteal > 0) attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + dmg.amount * eff.lifesteal);
      this.events.damage(n.id, n.x, n.y, attacker.id, dmg.amount, dmg.crit, Math.max(0, n.hp));
      if (n.def.behavior !== "static") {
        if (n.def.behavior === "passive" && n.hp < n.maxHp * n.def.fleeAt) {
          n.state = "flee";
          n.targetId = attacker.id;
          n.stateUntil = this.now + 3000;
        } else if (n.state !== "flee" || n.def.behavior === "aggressive") {
          n.state = "chase";
          n.targetId = attacker.id;
        }
      }
      if (n.hp <= 0) this.killNpc(n, attacker);
    }
  }

  private applyPlayerDamage(v: SimPlayer, amount: number, crit: boolean, source: Killer): void {
    v.hp -= amount;
    const sourceId = source.kind === "player" ? source.player.id : source.kind === "npc" ? source.npc.id : "";
    if (source.kind === "player") {
      v.lastHitBy = source.player.id;
      v.lastHitAt = this.now;
    }
    this.events.damage(v.id, v.x, v.y, sourceId, amount, crit, Math.max(0, Math.round(v.hp)));
    if (v.hp <= 0) {
      v.hp = 0;
      v.alive = false;
      v.deaths++;
      v.respawnAt = this.now + RESPAWN_DELAY_MS;
      v.inputQueue.length = 0;
      let killer: Killer = source;
      if (source.kind !== "player" && v.lastHitBy && this.now - v.lastHitAt < 8000) {
        const credited = this.players.get(v.lastHitBy);
        if (credited) killer = { kind: "player", player: credited };
      }
      if (killer.kind === "player") {
        killer.player.kills++;
        killer.player.score += 10;
        this.addXp(killer.player, killXp(40 + v.level * 12, killer.player.level, v.level));
        const gold = 10 + v.level * 3;
        this.events.goldGained(killer.player, gold);
      }
      this.events.playerKilled(v, killer);
    }
  }

  private killNpc(n: SimNpc, killer: SimPlayer): void {
    this.npcs.delete(n.id);
    this.events.entityRemoved("npc", n.id);
    killer.npcKills++;
    killer.score += n.def.key === "titan" ? 100 : 2;
    this.addXp(killer, killXp(n.def.xp, killer.level, n.def.level));
    const gold = this.rng.int(n.def.gold[0], n.def.gold[1]);
    this.events.goldGained(killer, gold);
    if (this.rng.chance(n.def.lootChance)) {
      const drop = rollLoot(this.rng, n.def.lootTier, this.opts.lootCatalog);
      if (drop) this.dropLoot(drop.key, n.x, n.y, killer.isBot ? null : killer.userId);
      if (n.def.key === "titan" || n.def.key === "chest") {
        const extra = rollLoot(this.rng, n.def.lootTier, this.opts.lootCatalog);
        if (extra) this.dropLoot(extra.key, n.x + 30, n.y + 20, killer.isBot ? null : killer.userId);
      }
    }
    this.events.npcKilled(n, killer);
    this.respawnQueue.push({ at: this.now + (n.def.key === "titan" ? 300_000 : NPC_RESPAWN_MS), kind: "npc", key: n.def.key });
  }

  dropLoot(itemKey: string, x: number, y: number, ownerUserId: string | null): SimLoot | null {
    const cat = this.opts.lootCatalog.find((c) => c.key === itemKey);
    if (!cat) return null;
    const res = resolveCircle(this.map.grid, x + this.rng.range(-20, 20), y + this.rng.range(-20, 20), 14, this.map.size);
    const loot: SimLoot = {
      id: this.nextId("l"),
      itemKey,
      rarity: cat.rarity,
      name: cat.name,
      x: res.x,
      y: res.y,
      ownerUserId,
      ownerUntil: this.now + LOOT_OWNER_MS,
      expiresAt: this.now + LOOT_LIFETIME_MS,
      claimedBy: null,
    };
    this.loot.set(loot.id, loot);
    this.events.entityAdded("loot", loot.id);
    this.events.lootSpawned(loot);
    return loot;
  }

  // ───────────────────────── Pickups ─────────────────────────

  /**
   * Finds the nearest loot the player may pick up and marks it claimed.
   * Returns null when nothing is in range. The room persists the item, then calls finishPickup/releasePickup.
   */
  claimLoot(p: SimPlayer, targetId?: string): SimLoot | "too_far" | null {
    if (!p.alive) return null;
    let best: SimLoot | null = null;
    let bestD = Infinity;
    for (const l of this.loot.values()) {
      if (l.claimedBy) continue;
      if (targetId && l.id !== targetId) continue;
      if (l.ownerUserId && l.ownerUserId !== p.userId && this.now < l.ownerUntil) continue;
      const d = dist2(p.x, p.y, l.x, l.y);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    if (!best) return null;
    if (bestD > (PICKUP_RADIUS + PLAYER_RADIUS) ** 2) return targetId ? "too_far" : null;
    best.claimedBy = p.id;
    return best;
  }

  finishPickup(lootId: string): void {
    if (this.loot.delete(lootId)) this.events.entityRemoved("loot", lootId);
  }

  releasePickup(lootId: string): void {
    const l = this.loot.get(lootId);
    if (l) l.claimedBy = null;
  }

  collectResource(p: SimPlayer): SimResource | null {
    if (!p.alive) return null;
    let best: SimResource | null = null;
    let bestD = (PICKUP_RADIUS + PLAYER_RADIUS) ** 2;
    for (const r of this.resources.values()) {
      const d = dist2(p.x, p.y, r.x, r.y);
      if (d <= bestD) {
        bestD = d;
        best = r;
      }
    }
    if (!best) return null;
    this.resources.delete(best.id);
    this.events.entityRemoved("resource", best.id);
    this.addXp(p, best.def.xp);
    if (best.def.gold > 0) this.events.goldGained(p, best.def.gold);
    this.events.resourceCollected(p, best);
    this.respawnQueue.push({ at: this.now + RESOURCE_RESPAWN_MS, kind: "resource", key: best.def.key });
    return best;
  }

  heal(p: SimPlayer, fraction: number): void {
    if (!p.alive) return;
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * Math.max(0, Math.min(1, fraction)));
  }

  // ───────────────────────── NPC AI ─────────────────────────

  private updateNpcWakeState(): void {
    for (const n of this.npcs.values()) {
      let awake = false;
      if (n.def.behavior !== "static") {
        this.playerGrid.queryRadius(n.x, n.y, NPC_WAKE_RADIUS, () => {
          awake = true;
        });
      }
      n.awake = awake;
    }
  }

  private stepNpc(n: SimNpc): void {
    const def = n.def;
    const dtS = this.dt / 1000;
    const target = n.targetId ? this.players.get(n.targetId) : undefined;

    // Leash: never chase too far from home.
    if (n.state === "chase" && dist2(n.x, n.y, n.homeX, n.homeY) > LEASH_DISTANCE ** 2) {
      n.state = "return";
      n.targetId = null;
    }

    switch (n.state) {
      case "idle":
      case "wander": {
        if (def.behavior === "aggressive") {
          const t = this.findAggroTarget(n);
          if (t) {
            n.state = "chase";
            n.targetId = t.id;
            break;
          }
        }
        if (this.now >= n.stateUntil) {
          if (n.state === "idle") {
            n.state = "wander";
            const a = this.rng.range(-Math.PI, Math.PI);
            const d = this.rng.range(80, 320);
            n.wanderX = n.homeX + Math.cos(a) * d;
            n.wanderY = n.homeY + Math.sin(a) * d;
            n.stateUntil = this.now + this.rng.range(1500, 4000);
          } else {
            n.state = "idle";
            n.stateUntil = this.now + this.rng.range(800, 3000);
          }
        }
        if (n.state === "wander") this.moveNpcTowards(n, n.wanderX, n.wanderY, def.speed * 0.45 * dtS);
        break;
      }
      case "chase": {
        if (!target || !target.alive || this.effectiveStats(target).invisible || this.isSafe(target.x, target.y)) {
          n.state = "return";
          n.targetId = null;
          break;
        }
        const d2 = dist2(n.x, n.y, target.x, target.y);
        const reach = def.attackRange + PLAYER_RADIUS;
        n.aim = angleTo(n.x, n.y, target.x, target.y);
        if (d2 > reach * reach) {
          this.moveNpcTowards(n, target.x, target.y, def.speed * dtS);
        } else if (this.now >= n.nextAttackAt && def.damage > 0) {
          n.nextAttackAt = this.now + def.attackCooldownMs;
          if (this.now >= target.spawnProtectedUntil) {
            const dmg = rollDamage({ damage: def.damage, critChance: 0.05, critDamage: 1.5 }, this.effectiveStats(target).armor, 1, this.rng.next());
            this.applyPlayerDamage(target, dmg.amount, dmg.crit, { kind: "npc", npc: n });
          }
        }
        if (def.fleeAt > 0 && n.hp < n.maxHp * def.fleeAt) {
          n.state = "flee";
          n.stateUntil = this.now + 3000;
        }
        break;
      }
      case "flee": {
        if (target) {
          const a = angleTo(target.x, target.y, n.x, n.y);
          this.moveNpcTowards(n, n.x + Math.cos(a) * 100, n.y + Math.sin(a) * 100, def.speed * 1.1 * dtS);
        }
        if (this.now >= n.stateUntil) {
          n.state = "return";
          n.targetId = null;
        }
        break;
      }
      case "return": {
        this.moveNpcTowards(n, n.homeX, n.homeY, def.speed * dtS);
        n.hp = Math.min(n.maxHp, n.hp + n.maxHp * 0.2 * dtS);
        if (dist2(n.x, n.y, n.homeX, n.homeY) < 30 * 30) {
          n.state = "idle";
          n.stateUntil = this.now + 1000;
          n.hp = n.maxHp;
          n.damageBy.clear();
        }
        break;
      }
    }
  }

  private findAggroTarget(n: SimNpc): SimPlayer | null {
    let best: SimPlayer | null = null;
    let bestD = n.def.aggroRange * n.def.aggroRange;
    this.playerGrid.queryRadius(n.x, n.y, n.def.aggroRange, (p) => {
      if (!p.alive || this.effectiveStats(p).invisible || this.isSafe(p.x, p.y)) return;
      const d = dist2(n.x, n.y, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    return best;
  }

  private moveNpcTowards(n: SimNpc, tx: number, ty: number, step: number): void {
    const dx = tx - n.x;
    const dy = ty - n.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const s = Math.min(step, d);
    const nx = n.x + (dx / d) * s;
    const ny = n.y + (dy / d) * s;
    if (this.isSafe(nx, ny)) return; // NPCs never enter safe zones
    const res = resolveCircle(this.map.grid, nx, ny, n.def.radius, this.map.size);
    n.x = res.x;
    n.y = res.y;
    n.aim = Math.atan2(dy, dx);
  }

  // ───────────────────────── Projectiles, meteors, world ─────────────────────────

  private stepProjectiles(): void {
    const dtS = this.dt / 1000;
    for (const proj of this.projectiles.values()) {
      proj.x += proj.vx * dtS;
      proj.y += proj.vy * dtS;
      let dead = this.now >= proj.expiresAt || this.map.grid.overlaps(proj.x, proj.y, proj.radius);
      const owner = this.players.get(proj.ownerId);
      if (!dead && owner) {
        const r = proj.radius;
        let hitSomething = false;
        const visit = (t: { kind: "player"; player: SimPlayer } | { kind: "npc"; npc: SimNpc }): void => {
          if (hitSomething && !proj.pierce) return;
          const id = t.kind === "player" ? t.player.id : t.npc.id;
          if (proj.hit.has(id)) return;
          const tx = t.kind === "player" ? t.player.x : t.npc.x;
          const ty = t.kind === "player" ? t.player.y : t.npc.y;
          const tr = t.kind === "player" ? PLAYER_RADIUS : t.npc.def.radius;
          if (dist2(proj.x, proj.y, tx, ty) <= (r + tr) ** 2) {
            proj.hit.add(id);
            hitSomething = true;
            this.hit(owner, t, proj.damageMult);
          }
        };
        this.forTargetsNear(owner, proj.x, proj.y, 90, visit);
        if (hitSomething && !proj.pierce) dead = true;
      } else if (!owner) {
        dead = true;
      }
      if (dead) {
        this.projectiles.delete(proj.id);
        this.events.entityRemoved("projectile", proj.id);
      }
    }
  }

  private stepMeteors(): void {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]!;
      if (this.now < m.at) continue;
      this.meteors.splice(i, 1);
      const owner = this.players.get(m.ownerId);
      if (owner && owner.alive) this.aoeHit(owner, m.x, m.y, m.radius, m.damageMult);
    }
  }

  private stepWorld(): void {
    for (const l of this.loot.values()) {
      if (!l.claimedBy && this.now >= l.expiresAt) {
        this.loot.delete(l.id);
        this.events.entityRemoved("loot", l.id);
      }
    }
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i]!;
      if (this.now < r.at) continue;
      this.respawnQueue.splice(i, 1);
      if (r.kind === "npc") this.spawnNpc(getNpcDef(r.key));
      else this.spawnResource(r.key);
    }
  }

  /** Cooldown snapshot relative to now (used to persist state across reconnects). */
  cooldownsOf(p: SimPlayer): { attack: number; dash: number; skill: number; ultimate: number } {
    return {
      attack: Math.max(0, p.nextAttackAt - this.now),
      dash: Math.max(0, p.nextDashAt - this.now),
      skill: Math.max(0, p.nextSkillAt - this.now),
      ultimate: Math.max(0, p.nextUltAt - this.now),
    };
  }
}

