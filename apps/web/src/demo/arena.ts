// Offline arena for the demo: runs the same ArenaSimulation as the game server inside the browser
// and exposes it through the ArenaLink interface the Phaser scene already uses. Progress is saved
// to the local demo profile only; nothing here can reach the real economy.
import {
  ArenaSimulation,
  BotController,
  MERCHANT_RADIUS,
  VIEW_RADIUS_X,
  VIEW_RADIUS_Y,
  WORLD_SIZE,
  dist2,
  levelProgress,
  type Killer,
  type SimEvents,
  type SimPlayer,
} from "@cryptoarena/game-core";
import type { ClientMessages, MatchMode, MatchStanding, PlayerMoveInput, ServerMessages } from "@cryptoarena/shared";
import type { ArenaLink, EntityCollection, StateCallbacks } from "../game/net";
import type { ArenaStateView, LootView, NpcView, PlayerView, ProjectileView, ResourceView } from "../game/types";
import { DEMO_PRODUCTS, DEMO_QUESTS, DEMO_RIVALS } from "./catalog";
import { DemoError, addCharacterXp, consumeItem, findCharacter, grantItem, itemDef, loadForMatch, lootCatalog, recordQuestProgress, requireProfile, saveProfile, spend } from "./profile";

const TICK_RATE = 60;
const BOTS = 8;
const RANKED_COUNTDOWN_MS = 10_000;
const RANKED_MATCH_MS = 180_000;
const SELF = "me";

type ViewOf = { players: PlayerView; npcs: NpcView; projectiles: ProjectileView; loot: LootView; resources: ResourceView };
type Handler = (msg: unknown) => void;

interface Progress {
  kills: number;
  deaths: number;
  npcKills: number;
  xp: number;
  gold: number;
  resources: number;
}

const emptyProgress = (): Progress => ({ kills: 0, deaths: 0, npcKills: 0, xp: 0, gold: 0, resources: 0 });

class DemoState implements ArenaStateView {
  mode = "CASUAL";
  phase = "running";
  phaseEndsAt = 0;
  serverTime = 0;
  worldSize = WORLD_SIZE;
  mapSeed = 0;
  tickRate = TICK_RATE;
  playerCount = 1;
  readonly players = new Map<string, PlayerView>();
  readonly npcs = new Map<string, NpcView>();
  readonly projectiles = new Map<string, ProjectileView>();
  readonly loot = new Map<string, LootView>();
  readonly resources = new Map<string, ResourceView>();
}

export class DemoArena implements ArenaLink {
  readonly sessionId = SELF;
  readonly rtt = 0;
  readonly state = new DemoState();
  private readonly sim: ArenaSimulation;
  private readonly bots: BotController;
  private readonly mode: MatchMode;
  private readonly userCharacterId: string;
  /** Every entity view, visible or not; `state` holds only what is near the player (like a StateView). */
  private readonly all: { [K in EntityCollection]: Map<string, ViewOf[K]> } = { players: new Map(), npcs: new Map(), projectiles: new Map(), loot: new Map(), resources: new Map() };
  private readonly addHandlers = new Map<EntityCollection, ((v: unknown, k: string) => void)[]>();
  private readonly removeHandlers = new Map<EntityCollection, ((v: unknown, k: string) => void)[]>();
  private readonly changeHandlers = new Map<object, (() => void)[]>();
  private readonly listenHandlers = new Map<string, ((v: unknown) => void)[]>();
  private readonly listeners = new Map<string, Handler[]>();
  private readonly early: { type: string; msg: unknown }[] = [];
  private readonly leaveHandlers: ((code: number) => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = performance.now();
  private accumulator = 0;
  private viewTimer = 0;
  private statsTimer = 0;
  private flushTimer = 20_000;
  private progress = emptyProgress();
  private goldTotal = 0;
  private potions: number;
  private readonly joinedAt = Date.now();
  private closed = false;

  constructor(userCharacterId: string, mode: MatchMode) {
    this.mode = mode;
    this.userCharacterId = userCharacterId;
    const loaded = loadForMatch(requireProfile(), userCharacterId);
    this.potions = loaded.potions;
    const seed = Math.floor(Math.random() * 1_000_000);
    this.sim = new ArenaSimulation({ seed, worldSize: WORLD_SIZE, tickRate: TICK_RATE, npcDensity: 1, pvp: true, lootCatalog: lootCatalog() }, this.simEvents());
    this.state.mode = mode;
    this.state.mapSeed = seed;
    this.state.phase = mode === "RANKED" ? "countdown" : "running";
    this.state.phaseEndsAt = mode === "RANKED" ? RANKED_COUNTDOWN_MS : 0;

    this.sim.populate();
    this.sim.addPlayer({
      id: SELF,
      userId: SELF,
      userCharacterId,
      isBot: false,
      name: loaded.username,
      characterKey: loaded.characterKey,
      def: loaded.def,
      base: loaded.def.base,
      upgrades: loaded.upgrades,
      equipped: loaded.equipped,
      level: loaded.level,
      xp: loaded.xp,
      xpBoostUntil: 0,
      tint: loaded.tint,
    });
    this.bots = new BotController(this.sim);
    this.bots.spawn(BOTS);
    this.renameBots();
    this.refreshView();

    this.emit("welcome", { sessionId: SELF, userId: SELF, matchId: "demo", mode, serverTime: this.sim.now, tickRate: TICK_RATE });
    this.sendSelfStats();
    this.timer = setInterval(() => this.loop(), 1000 / TICK_RATE);
  }

  // ───────────────────────── ArenaLink ─────────────────────────

  serverNow(): number {
    return this.sim.now;
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  onLeave(handler: (code: number) => void): void {
    this.leaveHandlers.push(handler);
  }

  on<K extends keyof ServerMessages>(type: K, handler: (msg: ServerMessages[K]) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler as Handler);
    this.listeners.set(type, list);
    for (let i = 0; i < this.early.length; i++) {
      const e = this.early[i]!;
      if (e.type === type) {
        this.early.splice(i--, 1);
        (handler as Handler)(e.msg);
      }
    }
  }

  callbacks(): StateCallbacks {
    return {
      onAdd: (prop, handler) => {
        this.push(this.addHandlers, prop, handler);
        // Like Colyseus: existing entries are reported immediately.
        (this.state[prop] as Map<string, unknown>).forEach((v, k) => handler(v, k));
      },
      onRemove: (prop, handler) => this.push(this.removeHandlers, prop, handler),
      onChange: (instance, handler) => {
        if (typeof instance === "object" && instance !== null) this.push(this.changeHandlers, instance, handler);
      },
      listen: (prop, handler) => {
        this.push(this.listenHandlers, prop, handler);
        handler(this.state[prop]);
      },
    };
  }

  send<K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]): void {
    if (this.closed) return;
    switch (type) {
      case "player_move": {
        const m = payload as PlayerMoveInput;
        if ([m.seq, m.mx, m.my, m.aim, m.buttons].every(Number.isFinite)) this.sim.queueInput(SELF, m);
        break;
      }
      case "pickup":
        this.pickup();
        break;
      case "buy_item":
        this.buyPotions();
        break;
      case "use_item":
        this.drinkPotion();
        break;
      case "ping":
        this.emit("pong", { t: (payload as ClientMessages["ping"]).t, serverTime: this.sim.now });
        break;
      default:
        break;
    }
  }

  leave(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flush(true);
    return Promise.resolve();
  }

  // ───────────────────────── Loop ─────────────────────────

  private loop(): void {
    const now = performance.now();
    this.accumulator += Math.min(now - this.lastTickAt, 250);
    this.lastTickAt = now;
    const dt = this.sim.dt;
    while (this.accumulator >= dt) {
      this.accumulator -= dt;
      this.fixedTick(dt);
    }
  }

  private fixedTick(dt: number): void {
    if (this.state.phase !== "ended") {
      this.bots.update();
      this.sim.step();
    }
    this.syncState();
    this.viewTimer -= dt;
    if (this.viewTimer <= 0) {
      this.viewTimer = 200;
      this.refreshView();
    }
    this.statsTimer -= dt;
    if (this.statsTimer <= 0) {
      this.statsTimer = 500;
      this.sendSelfStats();
    }
    this.flushTimer -= dt;
    if (this.flushTimer <= 0) {
      this.flushTimer = 20_000;
      this.flush(false);
    }
    this.updatePhase();
  }

  private updatePhase(): void {
    if (this.mode !== "RANKED") return;
    const now = this.sim.now;
    if (this.state.phase === "countdown" && now >= this.state.phaseEndsAt) {
      this.setPhase("running", now + RANKED_MATCH_MS);
      for (const p of this.sim.players.values()) {
        p.kills = 0;
        p.deaths = 0;
        p.score = 0;
        p.hp = p.stats.maxHp;
      }
      this.emit("match_start", { mode: this.mode, endsAt: this.state.phaseEndsAt });
    } else if (this.state.phase === "running" && now >= this.state.phaseEndsAt) {
      this.setPhase("ended", this.state.phaseEndsAt);
      this.emit("match_end", { mode: this.mode, standings: this.standings() });
      this.flush(false);
    }
  }

  private setPhase(phase: string, endsAt: number): void {
    this.state.phase = phase;
    this.state.phaseEndsAt = endsAt;
    for (const h of this.listenHandlers.get("phase") ?? []) h(phase);
    for (const h of this.listenHandlers.get("phaseEndsAt") ?? []) h(endsAt);
  }

  private standings(): MatchStanding[] {
    return [...this.sim.players.values()]
      .sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths)
      .map((p, i) => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths, score: p.score, placement: i + 1 }));
  }

  // ───────────────────────── State mirroring ─────────────────────────

  private syncState(): void {
    this.state.serverTime = this.sim.now;
    for (const p of this.sim.players.values()) {
      const v = this.all.players.get(p.id);
      if (!v) continue;
      const eff = this.sim.effectiveStats(p);
      const next = {
        x: p.x,
        y: p.y,
        aim: p.aim,
        hp: Math.max(0, Math.round(p.hp)),
        maxHp: p.stats.maxHp,
        level: p.level,
        kills: p.kills,
        deaths: p.deaths,
        score: p.score,
        alive: p.alive,
        ack: p.ackSeq,
        flags: (eff.invisible ? 1 : 0) | (p.buffs.length > 0 ? 2 : 0) | (this.sim.now < p.spawnProtectedUntil ? 4 : 0) | (p.mover.dashRemainingMs > 0 ? 8 : 0),
      };
      if (this.assign(v, next)) this.changed(v);
    }
    for (const n of this.sim.npcs.values()) {
      if (!n.awake) continue;
      const v = this.all.npcs.get(n.id);
      if (v && this.assign(v, { x: n.x, y: n.y, aim: n.aim, hp: Math.max(0, Math.round(n.hp)) }) && this.state.npcs.has(n.id)) this.changed(v);
    }
  }

  private assign<T extends object>(target: T, next: Partial<T>): boolean {
    let dirty = false;
    for (const k of Object.keys(next) as (keyof T)[]) {
      if (target[k] !== next[k]) {
        target[k] = next[k] as T[keyof T];
        dirty = true;
      }
    }
    return dirty;
  }

  private changed(view: object): void {
    for (const h of this.changeHandlers.get(view) ?? []) h();
  }

  /** Interest management, mirroring the server: only entities around the player are in `state`. */
  private refreshView(): void {
    const me = this.sim.players.get(SELF);
    if (!me) return;
    const near = (x: number, y: number): boolean => Math.abs(x - me.x) <= VIEW_RADIUS_X && Math.abs(y - me.y) <= VIEW_RADIUS_Y;
    const sync = (coll: Exclude<EntityCollection, "players">, pos: (id: string) => { x: number; y: number } | undefined): void => {
      const shown = this.state[coll] as Map<string, unknown>;
      (this.all[coll] as Map<string, unknown>).forEach((view, id) => {
        const p = pos(id);
        const visible = !!p && near(p.x, p.y);
        if (visible && !shown.has(id)) this.show(coll, id, view);
        else if (!visible && shown.has(id)) this.hide(coll, id, view);
      });
    };
    sync("npcs", (id) => this.sim.npcs.get(id));
    sync("loot", (id) => this.sim.loot.get(id));
    sync("resources", (id) => this.sim.resources.get(id));
    sync("projectiles", (id) => this.sim.projectiles.get(id));
  }

  private show(coll: EntityCollection, id: string, view: unknown): void {
    (this.state[coll] as Map<string, unknown>).set(id, view);
    for (const h of this.addHandlers.get(coll) ?? []) h(view, id);
  }

  private hide(coll: EntityCollection, id: string, view: unknown): void {
    (this.state[coll] as Map<string, unknown>).delete(id);
    if (typeof view === "object" && view !== null) this.changeHandlers.delete(view);
    for (const h of this.removeHandlers.get(coll) ?? []) h(view, id);
  }

  private collectionOf(kind: "player" | "npc" | "projectile" | "loot" | "resource"): EntityCollection {
    return kind === "player" ? "players" : kind === "npc" ? "npcs" : kind === "projectile" ? "projectiles" : kind === "loot" ? "loot" : "resources";
  }

  private onEntityAdded(kind: "player" | "npc" | "projectile" | "loot" | "resource", id: string): void {
    const me = this.sim.players.get(SELF);
    const near = (x: number, y: number): boolean => !me || (Math.abs(x - me.x) <= VIEW_RADIUS_X + 200 && Math.abs(y - me.y) <= VIEW_RADIUS_Y + 200);
    switch (kind) {
      case "player": {
        const p = this.sim.players.get(id)!;
        const v: PlayerView = { id: p.id, name: p.name, cls: p.characterKey, x: p.x, y: p.y, aim: 0, hp: Math.round(p.hp), maxHp: p.stats.maxHp, level: p.level, kills: 0, deaths: 0, score: 0, alive: true, ack: 0, flags: 0, tint: p.tint, isBot: p.isBot };
        this.all.players.set(id, v);
        this.show("players", id, v); // every player is listed (scoreboard), like a small room
        this.state.playerCount = this.all.players.size;
        break;
      }
      case "npc": {
        const n = this.sim.npcs.get(id)!;
        const v: NpcView = { kind: n.def.key, x: n.x, y: n.y, aim: 0, hp: n.hp, maxHp: n.maxHp };
        this.all.npcs.set(id, v);
        if (near(n.x, n.y)) this.show("npcs", id, v);
        break;
      }
      case "projectile": {
        const pr = this.sim.projectiles.get(id)!;
        const v: ProjectileView = { kind: pr.kind, owner: pr.ownerId, x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, t0: this.sim.now, ttl: Math.round(pr.expiresAt - pr.bornAt) };
        this.all.projectiles.set(id, v);
        if (near(pr.x, pr.y)) this.show("projectiles", id, v);
        break;
      }
      case "loot": {
        const l = this.sim.loot.get(id)!;
        const v: LootView = { itemKey: l.itemKey, name: l.name, rarity: l.rarity, x: l.x, y: l.y };
        this.all.loot.set(id, v);
        if (near(l.x, l.y)) this.show("loot", id, v);
        break;
      }
      case "resource": {
        const r = this.sim.resources.get(id)!;
        const v: ResourceView = { kind: r.def.key, x: r.x, y: r.y };
        this.all.resources.set(id, v);
        if (near(r.x, r.y)) this.show("resources", id, v);
        break;
      }
    }
  }

  private onEntityRemoved(kind: "player" | "npc" | "projectile" | "loot" | "resource", id: string): void {
    const coll = this.collectionOf(kind);
    const view = (this.all[coll] as Map<string, unknown>).get(id);
    (this.all[coll] as Map<string, unknown>).delete(id);
    if ((this.state[coll] as Map<string, unknown>).has(id)) this.hide(coll, id, view);
    if (kind === "player") this.state.playerCount = this.all.players.size;
  }

  // ───────────────────────── Simulation events ─────────────────────────

  private simEvents(): SimEvents {
    return {
      attack: (p, kind, range) => this.emitNear(p.x, p.y, "player_attack", { id: p.id, aim: p.aim, kind, range }),
      damage: (targetId, x, y, sourceId, amount, crit, hp) => this.emitNear(x, y, "player_damage", { targetId, sourceId, amount, crit, hp }),
      playerKilled: (victim, killer) => this.onPlayerKilled(victim, killer),
      npcKilled: (npc, killer) => {
        if (killer.id === SELF) this.progress.npcKills++;
        if (npc.def.key === "titan") this.emit("player_death", { killerId: killer.id, killerName: killer.name, victimId: npc.id, victimName: npc.def.name, victimIsNpc: true, respawnAt: 0 });
      },
      respawn: (p) => this.emitNear(p.x, p.y, "player_respawn", { id: p.id, x: p.x, y: p.y }),
      levelUp: (p) => {
        this.emitNear(p.x, p.y, "player_level_up", { id: p.id, level: p.level });
        if (p.id === SELF) this.sendSelfStats();
      },
      xpGained: (p, amount) => {
        if (p.id === SELF) this.progress.xp += amount;
      },
      goldGained: (p, amount) => {
        if (p.id !== SELF) return;
        this.progress.gold += amount;
        this.goldTotal += amount;
      },
      resourceCollected: (p, r) => {
        if (p.id !== SELF) return;
        this.progress.resources++;
        this.emit("item_pickup", { id: r.id, itemKey: r.def.key, name: r.def.name, rarity: r.def.questObject ? "LEGENDARY" : "COMMON", quantity: 1, gold: r.def.gold });
      },
      entityAdded: (kind, id) => this.onEntityAdded(kind, id),
      entityRemoved: (kind, id) => this.onEntityRemoved(kind, id),
      lootSpawned: (l) => this.emitNear(l.x, l.y, "item_drop", { id: l.id, x: l.x, y: l.y, itemKey: l.itemKey, rarity: l.rarity }),
      statsChanged: (p) => {
        if (p.id === SELF) this.sendSelfStats();
      },
      suspicious: () => undefined,
    };
  }

  private onPlayerKilled(victim: SimPlayer, killer: Killer): void {
    const killerName = killer.kind === "player" ? killer.player.name : killer.kind === "npc" ? killer.npc.def.name : "the arena";
    const killerId = killer.kind === "player" ? killer.player.id : killer.kind === "npc" ? killer.npc.id : "";
    this.emit("player_death", { killerId, killerName, victimId: victim.id, victimName: victim.name, victimIsNpc: false, respawnAt: victim.respawnAt });
    if (victim.id === SELF) this.progress.deaths++;
    if (killer.kind === "player" && killer.player.id === SELF) this.progress.kills++;
  }

  // ───────────────────────── Actions ─────────────────────────

  private pickup(): void {
    const p = this.sim.players.get(SELF);
    if (!p?.alive) return;
    const loot = this.sim.claimLoot(p);
    if (loot && loot !== "too_far") {
      try {
        const profile = requireProfile();
        const row = grantItem(profile, loot.itemKey, 1);
        saveProfile(profile);
        this.sim.finishPickup(loot.id);
        if (loot.itemKey === "potion_health") this.potions++;
        this.emit("item_pickup", { id: loot.id, itemKey: loot.itemKey, name: loot.name, rarity: loot.rarity, quantity: row.quantity });
        this.sendSelfStats();
      } catch (err) {
        this.sim.releasePickup(loot.id);
        this.notice("warn", err instanceof DemoError ? err.message : "Could not pick that up");
      }
      return;
    }
    this.sim.collectResource(p);
  }

  private buyPotions(): void {
    const p = this.sim.players.get(SELF);
    if (!p?.alive) return;
    if (!this.sim.map.merchants.some((m) => dist2(m.x, m.y, p.x, p.y) <= MERCHANT_RADIUS * MERCHANT_RADIUS)) return;
    const product = DEMO_PRODUCTS.find((x) => x.sku === "potion_pack_5");
    if (!product) return;
    // Gold earned this session is saved first so it can be spent at the merchant.
    this.flush(false);
    try {
      const profile = requireProfile();
      spend(profile, product.currency, product.price);
      for (const g of product.grants) if (g.kind === "ITEM") grantItem(profile, g.itemKey, g.quantity);
      saveProfile(profile);
      this.potions += 5;
      this.notice("info", "Purchased 5 health potions");
      this.sendSelfStats();
    } catch (err) {
      this.notice("error", err instanceof DemoError ? err.message : "Purchase failed");
    }
  }

  private drinkPotion(): void {
    const p = this.sim.players.get(SELF);
    if (!p?.alive) return;
    const profile = requireProfile();
    if (this.potions <= 0 || !consumeItem(profile, "potion_health")) return this.notice("warn", "No potions left");
    saveProfile(profile);
    this.potions--;
    const fraction = itemDef("potion_health").metadata.fraction;
    this.sim.heal(p, typeof fraction === "number" ? fraction : 0.35);
    this.sendSelfStats();
  }

  // ───────────────────────── Persistence & messages ─────────────────────────

  /** Saves this session's progress to the demo profile. */
  private flush(left: boolean): void {
    const d = this.progress;
    this.progress = emptyProgress();
    const countsAsMatch = left && Date.now() - this.joinedAt >= 60_000;
    if (!d.xp && !d.gold && !d.kills && !d.npcKills && !d.resources && !countsAsMatch) return;
    try {
      const profile = requireProfile();
      const { uc } = findCharacter(profile, this.userCharacterId);
      addCharacterXp(uc, d.xp);
      profile.gold += d.gold;
      profile.totals.kills += d.kills;
      profile.totals.npcKills += d.npcKills;
      profile.totals.xp += d.xp;
      if (countsAsMatch) profile.totals.matches++;
      const done = [
        ...recordQuestProgress(profile, "KILL_NPC", d.npcKills),
        ...recordQuestProgress(profile, "KILL_PLAYER", d.kills),
        ...recordQuestProgress(profile, "COLLECT_RESOURCE", d.resources),
        ...recordQuestProgress(profile, "PLAY_MATCH", countsAsMatch ? 1 : 0),
      ];
      saveProfile(profile);
      if (!left) for (const key of done) this.emit("quest_complete", { questKey: key, name: DEMO_QUESTS.find((q) => q.key === key)?.name ?? key });
    } catch {
      /* the profile was reset meanwhile: nothing to save */
    }
  }

  private sendSelfStats(): void {
    const p = this.sim.players.get(SELF);
    if (!p) return;
    const lp = levelProgress(p.xp);
    this.emit("self_stats", {
      stats: this.sim.effectiveStats(p),
      cooldowns: { attack: p.nextAttackAt, dash: p.nextDashAt, skill: p.nextSkillAt, ultimate: p.nextUltAt },
      skillName: p.def.skill.name,
      ultimateName: p.def.ultimate.name,
      gold: this.goldTotal,
      potions: this.potions,
      xp: p.xp,
      xpForNext: lp.xpForNext,
      xpIntoLevel: lp.xpIntoLevel,
    });
  }

  private notice(level: "info" | "warn" | "error", message: string): void {
    this.emit("notice", { level, message });
  }

  private emit<K extends keyof ServerMessages>(type: K, msg: ServerMessages[K]): void {
    const handlers = this.listeners.get(type);
    if (handlers && handlers.length > 0) for (const h of handlers) h(msg);
    else if (this.early.length < 200) this.early.push({ type, msg });
  }

  private emitNear<K extends keyof ServerMessages>(x: number, y: number, type: K, msg: ServerMessages[K]): void {
    const me = this.sim.players.get(SELF);
    if (!me || (Math.abs(me.x - x) <= VIEW_RADIUS_X + 200 && Math.abs(me.y - y) <= VIEW_RADIUS_Y + 200)) this.emit(type, msg);
  }

  private renameBots(): void {
    let i = 0;
    for (const p of this.sim.players.values()) {
      if (!p.isBot) continue;
      p.name = `[BOT] ${DEMO_RIVALS[i++ % DEMO_RIVALS.length]}`;
      const v = this.all.players.get(p.id);
      if (v) v.name = p.name;
    }
  }

  private push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  }
}
