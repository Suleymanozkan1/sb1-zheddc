import { Room, type AuthContext, type Client } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import type { AppConfig } from "@cryptoarena/config";
import { AppError } from "@cryptoarena/economy";
import {
  BotBehaviorDetector,
  MAX_INPUTS_PER_SECOND,
  MERCHANT_RADIUS,
  RateWindow,
  VIEW_RADIUS_X,
  VIEW_RADIUS_Y,
  dist2,
  getCharacterDef,
  levelProgress,
} from "@cryptoarena/game-core";
import { LogEvent, metrics, type Logger } from "@cryptoarena/observability";
import type {
  GameTicketClaims,
  MatchMode,
  MatchStanding,
  PlayerMoveInput,
  SelfStatsMessage,
  ServerMessages,
} from "@cryptoarena/shared";
import { z } from "zod";
import type { Persistence } from "./persistence";
import { BotController } from "./sim/bots";
import { ArenaSimulation } from "./sim/simulation";
import type { EntityKind, Killer, SimEvents, SimLoot, SimNpc, SimPlayer, SimResource } from "./sim/types";
import { ArenaState, LootState, NpcState, PlayerState, ProjectileState, ResourceState } from "./state";
import type { TicketVerifier } from "./tickets";

export interface RoomDeps {
  config: AppConfig;
  logger: Logger;
  persistence: Persistence;
  tickets: TicketVerifier;
}

interface AuthData {
  claims: GameTicketClaims;
  loaded: Awaited<ReturnType<Persistence["loadPlayer"]>>;
  /** Fencing token of the account's GameSeat lease held by this room. */
  seatToken: string;
}

interface Progress {
  flushSeq: number;
  kills: number;
  deaths: number;
  npcKills: number;
  damageDealt: number;
  xp: number;
  gold: number;
  resources: number;
  chests: number;
}

interface ClientData {
  userId: string;
  userCharacterId: string;
  inputRate: RateWindow;
  actionRate: RateWindow;
  violations: number;
  botDetector: BotBehaviorDetector;
  botFlagged: boolean;
  progress: Progress;
  potions: number;
  goldTotal: number;
  lastStatsSentAt: number;
  pendingPickup: boolean;
  lastFlushedDamage: number;
  joinedAt: number;
}

type ArenaClient = Client<{ userData: ClientData; auth: AuthData; messages: ServerMessages }>;

// Process-wide registries. `activeUsers` is the fast, synchronous guard inside one process; the
// `GameSeat` lease in PostgreSQL (claimSeat / renewSeats) enforces the same rule across processes.
/** userId → live (or reserved) seat. A reservation made in onAuth expires if the join never completes. */
interface Seat {
  roomId: string;
  joined: boolean;
  at: number;
  /** Lease fencing token (null until the database claim returns). */
  token: string | null;
  /** Local time before which the database lease is guaranteed to still be ours. */
  leaseUntil: number;
}
const activeUsers = new Map<string, Seat>();
const RESERVATION_TTL_MS = 30_000;
/**
 * Database seat lease: renewed every SEAT_RENEW_MS while the player stays in the room. A room that
 * cannot prove its lease will outlive the next renewal (DB errors) or that lost it (taken over after
 * expiry) disconnects the player, so two rooms never act for the same account.
 */
const SEAT_LEASE_MS = 45_000;
const SEAT_RENEW_MS = 15_000;
const SEAT_SAFETY_MS = 2_000;
/** Close code for a player whose seat lease was lost (application range 4011–4999). */
export const SEAT_LOST_CLOSE_CODE = 4011;

function seatTaken(userId: string): boolean {
  const seat = activeUsers.get(userId);
  if (!seat) return false;
  if (!seat.joined && Date.now() - seat.at > RESERVATION_TTL_MS) {
    activeUsers.delete(userId);
    return false;
  }
  return true;
}
const recentLeavers = new Map<string, { hpFraction: number; cooldowns: { attack: number; dash: number; skill: number; ultimate: number }; until: number }>();
const pvpKillLog = new Map<string, number>();

const moveSchema = z.object({
  seq: z.number().int().nonnegative().max(2 ** 31),
  mx: z.number().finite(),
  my: z.number().finite(),
  aim: z.number().finite(),
  buttons: z.number().int().min(0).max(15),
});
const pickupSchema = z.object({ targetId: z.string().max(32).optional() });
const buySchema = z.object({ sku: z.string().max(64).regex(/^[a-z0-9_]+$/) });
const inventoryIdSchema = z.object({ inventoryItemId: z.string().uuid() });
const pingSchema = z.object({ t: z.number().finite() });

/** In-arena merchant catalogue (prices still come from the ShopProduct table). */
const MERCHANT_SKUS = new Set(["potion_pack_5"]);

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of recentLeavers) if (v.until < now) recentLeavers.delete(k);
  if (pvpKillLog.size > 50_000) {
    for (const [k, t] of pvpKillLog) if (now - t > 3_600_000) pvpKillLog.delete(k);
  }
}

function emptyProgress(): Progress {
  return { flushSeq: 0, kills: 0, deaths: 0, npcKills: 0, damageDealt: 0, xp: 0, gold: 0, resources: 0, chests: 0 };
}

export class ArenaRoom extends Room<{ state: ArenaState; client: ArenaClient }> {
  static deps: RoomDeps;

  override state = new ArenaState();
  mode: MatchMode = "CASUAL";
  matchId = "";
  sim!: ArenaSimulation;
  bots!: BotController;
  private deps!: RoomDeps;
  private accumulator = 0;
  private viewTimer = 0;
  private flushTimer = 0;
  private statsTimer = 0;
  private readonly playerStates = new Map<string, PlayerState>();
  private readonly npcStates = new Map<string, NpcState>();
  private readonly clientsBySim = new Map<string, ArenaClient>();
  /** Sessions already removed from the simulation (eviction or leave); cleanup runs once. */
  private readonly departed = new Set<string>();
  private ended = false;

  override async onCreate(options: { mode?: MatchMode }): Promise<void> {
    this.deps = ArenaRoom.deps;
    const { config } = this.deps;
    this.mode = options.mode === "RANKED" ? "RANKED" : "CASUAL";
    this.maxClients = this.mode === "RANKED" ? config.RANKED_MAX_PLAYERS : config.MAX_PLAYERS_PER_ROOM;
    this.autoDispose = true;
    this.setPatchRate(config.GAME_PATCH_RATE_MS);

    const lootCatalog = await this.deps.persistence.loadLootCatalog();
    const seed = config.ARENA_MAP_SEED + (this.mode === "RANKED" ? Math.floor(Math.random() * 1000) : 0);
    this.sim = new ArenaSimulation(
      { seed, worldSize: config.ARENA_SIZE, tickRate: config.GAME_TICK_RATE, npcDensity: config.NPC_DENSITY, pvp: true, lootCatalog },
      this.simEvents(),
    );

    this.state.mode = this.mode;
    this.state.worldSize = config.ARENA_SIZE;
    this.state.mapSeed = seed;
    this.state.tickRate = config.GAME_TICK_RATE;
    this.state.phase = this.mode === "RANKED" ? "waiting" : "running";
    this.state.phaseEndsAt = 0;

    this.sim.populate();
    this.bots = new BotController(this.sim);
    if (config.DEV_BOTS > 0 && !config.isProduction) this.bots.spawn(this.mode === "RANKED" ? Math.min(config.DEV_BOTS, 3) : config.DEV_BOTS);

    const match = await this.deps.persistence.createMatch(this.roomId, this.mode, this.maxClients, config.GAME_TICK_RATE);
    this.matchId = match.id;
    this.setMetadata({ mode: this.mode, matchId: this.matchId });
    metrics.activeRooms.inc();
    metrics.gamesStarted.inc();
    this.deps.logger.info({ event: LogEvent.GAME_STARTED, roomId: this.roomId, matchId: this.matchId, mode: this.mode }, "game started");

    this.registerMessages();

    // Keep this room's seat leases alive (reserved and joined players, including reconnect windows).
    this.clock.setInterval(() => void this.renewSeats(), SEAT_RENEW_MS);

    const step = this.sim.dt;
    this.setSimulationInterval((delta) => {
      this.accumulator += Math.min(delta, 250);
      while (this.accumulator >= step) {
        this.accumulator -= step;
        this.fixedTick();
      }
    }, step);
  }

  // ───────────────────────── Auth & lifecycle ─────────────────────────

  override async onAuth(_client: ArenaClient, options: { ticket?: unknown }, _ctx: AuthContext): Promise<AuthData> {
    const claims = await this.deps.tickets.verify(options?.ticket, this.mode);
    if (!claims) throw new Error("Invalid or expired game ticket");
    // One live character per account across all rooms (reconnections bypass onAuth).
    // The seat is reserved synchronously, before any await, so concurrent joins cannot both pass.
    if (seatTaken(claims.sub)) throw new Error("You are already playing in an arena");
    if (this.mode === "RANKED" && this.state.phase !== "waiting" && this.state.phase !== "countdown") {
      throw new Error("This ranked match already started");
    }
    const seat: Seat = { roomId: this.roomId, joined: false, at: Date.now(), token: null, leaseUntil: 0 };
    activeUsers.set(claims.sub, seat);
    let token: string | null = null;
    try {
      const claimStart = Date.now();
      token = await this.deps.persistence.claimSeat(claims.sub, this.roomId, SEAT_LEASE_MS);
      if (!token) throw new AppError("CONFLICT", "You are already playing in an arena");
      seat.token = token;
      seat.leaseUntil = claimStart + SEAT_LEASE_MS;
      const loaded = await this.deps.persistence.loadPlayer(claims.sub, claims.uc);
      return { claims, loaded, seatToken: token };
    } catch (err) {
      if (activeUsers.get(claims.sub) === seat) activeUsers.delete(claims.sub);
      if (token) await this.deps.persistence.releaseSeat(claims.sub, token).catch(() => undefined);
      throw new Error(err instanceof AppError ? err.message : "Could not load your character", { cause: err });
    }
  }

  override async onJoin(client: ArenaClient): Promise<void> {
    if (!client.auth) throw new Error("Not authenticated");
    const { claims, loaded, seatToken } = client.auth;
    const seat = activeUsers.get(claims.sub);
    // The lease may have been lost between onAuth and onJoin (renewal failure / takeover).
    if (!seat || seat.roomId !== this.roomId || seat.token !== seatToken) throw new Error("Your arena seat expired — please rejoin");
    // Re-prove the database lease right before the character enters the simulation.
    const renewStart = Date.now();
    const renewed = await this.deps.persistence.renewSeats(this.roomId, [{ userId: claims.sub, token: seatToken }], SEAT_LEASE_MS);
    if (!renewed.has(claims.sub) || activeUsers.get(claims.sub) !== seat) throw new Error("Your arena seat expired — please rejoin");
    seat.leaseUntil = renewStart + SEAT_LEASE_MS;
    seat.joined = true;
    seat.at = Date.now();
    const recent = recentLeavers.get(claims.sub);
    const restore = recent && recent.until > Date.now() ? recent : undefined;
    recentLeavers.delete(claims.sub);

    const c = loaded.character;
    const def = getCharacterDef(c.characterKey);
    const p = this.sim.addPlayer({
      id: client.sessionId,
      userId: claims.sub,
      userCharacterId: c.userCharacterId,
      isBot: false,
      name: loaded.user.username,
      characterKey: c.characterKey,
      def,
      base: c.base,
      upgrades: c.upgrades,
      equipped: c.equipped,
      level: c.level,
      xp: c.xp,
      xpBoostUntil: 0,
      tint: loaded.tint ?? def.color,
      ...(restore ? { hpFraction: restore.hpFraction, cooldowns: restore.cooldowns } : {}),
    });

    client.userData = {
      userId: claims.sub,
      userCharacterId: c.userCharacterId,
      inputRate: new RateWindow(MAX_INPUTS_PER_SECOND),
      actionRate: new RateWindow(8),
      violations: 0,
      botDetector: new BotBehaviorDetector(),
      botFlagged: false,
      progress: emptyProgress(),
      potions: loaded.potions,
      goldTotal: 0,
      lastStatsSentAt: 0,
      pendingPickup: false,
      lastFlushedDamage: 0,
      joinedAt: Date.now(),
    };
    this.clientsBySim.set(p.id, client);
    client.view = new StateView();
    const ps = this.playerStates.get(p.id);
    if (ps) client.view.add(ps);
    this.refreshView(client);

    await this.deps.persistence.joinMatch(this.matchId, claims.sub, c.userCharacterId).catch((err: unknown) =>
      this.deps.logger.error({ err }, "failed to record match player"),
    );

    client.send("welcome", { sessionId: client.sessionId, userId: claims.sub, matchId: this.matchId, mode: this.mode, serverTime: this.sim.now, tickRate: this.deps.config.GAME_TICK_RATE });
    this.sendSelfStats(client, true);
    this.broadcastNear(p.x, p.y, "player_join", { id: p.id, name: p.name });
    this.state.playerCount = this.humanCount();
    metrics.activePlayers.inc();
    this.deps.logger.info({ event: LogEvent.PLAYER_JOINED, roomId: this.roomId, userId: claims.sub, character: c.characterKey }, "player joined");
    this.checkRankedStart();
  }

  override async onDrop(client: ArenaClient): Promise<void> {
    // Keep the character in the world (it can still be hit) while the client reconnects.
    try {
      await this.allowReconnection(client, 15);
    } catch {
      // reconnection window elapsed → onLeave follows
    }
  }

  override async onReconnect(client: ArenaClient): Promise<void> {
    // An evicted seat must not resume through the reconnection window.
    const sub = client.auth?.claims.sub;
    const seat = sub ? activeUsers.get(sub) : undefined;
    if (this.departed.has(client.sessionId) || !seat || seat.roomId !== this.roomId || seat.token !== client.auth?.seatToken) {
      client.send("notice", { level: "error", message: "Your arena session could not be kept — please rejoin." });
      client.leave(SEAT_LOST_CLOSE_CODE);
      return;
    }
    client.view = new StateView();
    const ps = this.playerStates.get(client.sessionId);
    if (ps) client.view.add(ps);
    this.refreshView(client);
    this.sendSelfStats(client, true);
  }

  override async onLeave(client: ArenaClient): Promise<void> {
    await this.departPlayer(client);
    const data = client.userData;
    const seat = data ? activeUsers.get(data.userId) : undefined;
    // Only this session's own lease: a replacement session (evict + rejoin) holds a different token.
    if (data && seat && seat.roomId === this.roomId && seat.token === client.auth?.seatToken) {
      activeUsers.delete(data.userId);
      if (seat.token) await this.deps.persistence.releaseSeat(data.userId, seat.token).catch((err: unknown) => this.deps.logger.warn({ err }, "failed to release game seat"));
    }
  }

  /** Saves progress and removes the character from the simulation. Idempotent per session. */
  private async departPlayer(client: ArenaClient): Promise<void> {
    if (this.departed.has(client.sessionId)) return;
    this.departed.add(client.sessionId);
    const data = client.userData;
    const p = this.sim.players.get(client.sessionId);
    if (p && data) {
      // Remember HP and cooldowns briefly so leaving/rejoining cannot be used to reset them.
      pruneExpired();
      recentLeavers.set(data.userId, { hpFraction: p.alive ? p.hp / p.stats.maxHp : 0.5, cooldowns: this.sim.cooldownsOf(p), until: Date.now() + 60_000 });
      // flushClient snapshots progress synchronously before its first await, so the character can
      // leave the world immediately while the save completes.
      // A session only counts as a played match after 60s (prevents join/leave quest farming).
      const saving = this.flushClient(client, { left: true, countsAsMatch: Date.now() - data.joinedAt >= 60_000 });
      this.sim.removePlayer(client.sessionId);
      await saving;
      this.broadcastNear(p.x, p.y, "player_leave", { id: p.id, name: p.name });
    }
    this.sim.removePlayer(client.sessionId);
    this.clientsBySim.delete(client.sessionId);
    this.state.playerCount = this.humanCount();
    metrics.activePlayers.dec();
    if (data) this.deps.logger.info({ event: LogEvent.PLAYER_LEFT, roomId: this.roomId, userId: data.userId }, "player left");
  }

  override async onDispose(): Promise<void> {
    metrics.activeRooms.dec();
    if (!this.ended) await this.finishMatch(false);
    await this.deps.persistence.drain();
    for (const [userId, seat] of activeUsers) if (seat.roomId === this.roomId) activeUsers.delete(userId);
    await this.deps.persistence.releaseRoomSeats(this.roomId).catch((err: unknown) => this.deps.logger.warn({ err }, "failed to release game seats"));
    this.deps.logger.info({ event: LogEvent.GAME_ENDED, roomId: this.roomId, matchId: this.matchId }, "game ended");
  }

  /** Renews this room's seat leases and evicts players whose lease is lost or cannot be guaranteed. */
  private async renewSeats(): Promise<void> {
    const mine: { userId: string; seat: Seat; token: string }[] = [];
    for (const [userId, seat] of activeUsers) if (seat.roomId === this.roomId && seat.token) mine.push({ userId, seat, token: seat.token });
    if (mine.length === 0) return;
    const started = Date.now();
    let renewed: Set<string> | null = null;
    try {
      renewed = await this.deps.persistence.renewSeats(this.roomId, mine.map((m) => ({ userId: m.userId, token: m.token })), SEAT_LEASE_MS);
    } catch (err) {
      this.deps.logger.warn({ err, roomId: this.roomId }, "failed to renew game seats");
    }
    const now = Date.now();
    for (const m of mine) {
      if (activeUsers.get(m.userId) !== m.seat) continue; // left meanwhile
      if (renewed?.has(m.userId)) {
        m.seat.leaseUntil = started + SEAT_LEASE_MS;
      } else if (renewed) {
        this.evictSeat(m.userId, "lost"); // another room took the lease over
      } else if (m.seat.leaseUntil - now <= SEAT_RENEW_MS + SEAT_SAFETY_MS) {
        this.evictSeat(m.userId, "unverified"); // could expire before the next renewal attempt
      }
    }
  }

  /** Drops a player whose exclusive seat can no longer be guaranteed (fail closed). */
  private evictSeat(userId: string, why: "lost" | "unverified"): void {
    const token = activeUsers.get(userId)?.token;
    activeUsers.delete(userId);
    // Best effort: an unverified lease may still be ours; freeing it lets the player rejoin at once.
    if (why === "unverified" && token) void this.deps.persistence.releaseSeat(userId, token).catch(() => undefined);
    this.deps.logger.warn({ roomId: this.roomId, userId, why }, "game seat lease lost; disconnecting player");
    // Covers connected clients and ones inside the reconnection window (tracked in clientsBySim).
    const targets = new Set<ArenaClient>();
    for (const client of this.clientsBySim.values()) if (client.userData?.userId === userId) targets.add(client);
    for (const client of this.clients) if (client.userData?.userId === userId || client.auth?.claims.sub === userId) targets.add(client);
    for (const client of targets) {
      void this.departPlayer(client).catch((err: unknown) => this.deps.logger.error({ err }, "failed to remove evicted player"));
      client.send("notice", { level: "error", message: "Your arena session could not be kept — please rejoin." });
      client.leave(SEAT_LOST_CLOSE_CODE);
    }
  }

  private humanCount(): number {
    let n = 0;
    for (const p of this.sim.players.values()) if (!p.isBot) n++;
    return n;
  }

  // ───────────────────────── Messages (client → server) ─────────────────────────

  private violation(client: ArenaClient, kind: string, severity: number, details: Record<string, unknown> = {}): void {
    const data = client.userData;
    if (!data) return;
    data.violations += severity;
    metrics.antiCheatFlags.inc({ kind });
    if (data.violations >= 20) {
      this.deps.logger.warn({ event: LogEvent.ANTICHEAT_FLAG, userId: data.userId, kind, violations: data.violations }, "kicking client for repeated violations");
      void this.deps.persistence.flag(data.userId, this.matchId, kind, 5, { ...details, kicked: true });
      client.leave(4003);
    } else if (severity >= 2) {
      void this.deps.persistence.flag(data.userId, this.matchId, kind, severity, details);
    }
  }

  private registerMessages(): void {
    this.onMessage("player_move", (client: ArenaClient, raw: unknown) => {
      const data = client.userData;
      if (!data) return;
      if (!data.inputRate.hit(Date.now())) return this.violation(client, "packet_spam", 1, { type: "player_move" });
      const parsed = moveSchema.safeParse(raw);
      if (!parsed.success) return this.violation(client, "invalid_input", 2);
      const input: PlayerMoveInput = parsed.data;
      const rejected = this.sim.queueInput(client.sessionId, input);
      if (rejected === "bad_seq") return this.violation(client, "input_replay", 1, { seq: input.seq });
      if (rejected === "queue_full") return this.violation(client, "input_flood", 1);
      data.botDetector.record(Date.now(), input.aim, input.mx !== 0 || input.my !== 0);
    });

    this.onMessage("pickup", (client: ArenaClient, raw: unknown) => {
      const data = client.userData;
      if (!data || !data.actionRate.hit(Date.now())) return this.violation(client, "packet_spam", 1, { type: "pickup" });
      const parsed = pickupSchema.safeParse(raw ?? {});
      if (!parsed.success) return this.violation(client, "invalid_input", 2);
      this.handlePickup(client, parsed.data.targetId);
    });

    this.onMessage("buy_item", (client: ArenaClient, raw: unknown) => {
      const data = client.userData;
      if (!data || !data.actionRate.hit(Date.now())) return this.violation(client, "packet_spam", 1, { type: "buy_item" });
      const parsed = buySchema.safeParse(raw);
      if (!parsed.success) return this.violation(client, "invalid_input", 2);
      void this.handleBuy(client, parsed.data.sku);
    });

    this.onMessage("use_item", (client: ArenaClient, raw: unknown) => {
      const data = client.userData;
      if (!data || !data.actionRate.hit(Date.now())) return this.violation(client, "packet_spam", 1, { type: "use_item" });
      const parsed = inventoryIdSchema.safeParse(raw);
      void this.handleUseItem(client, parsed.success ? parsed.data.inventoryItemId : null);
    });

    this.onMessage("equip_item", (client: ArenaClient, raw: unknown) => {
      const data = client.userData;
      if (!data || !data.actionRate.hit(Date.now())) return this.violation(client, "packet_spam", 1, { type: "equip_item" });
      const parsed = inventoryIdSchema.safeParse(raw);
      if (!parsed.success) return this.violation(client, "invalid_input", 2);
      void this.handleEquip(client, parsed.data.inventoryItemId);
    });

    this.onMessage("ping", (client: ArenaClient, raw: unknown) => {
      const parsed = pingSchema.safeParse(raw);
      if (!parsed.success) return;
      client.send("pong", { t: parsed.data.t, serverTime: this.sim.now });
    });

    this.onMessage("*", (client: ArenaClient, type: string | number) => {
      this.violation(client, "unknown_message", 1, { type: String(type).slice(0, 32) });
    });
  }

  private notice(client: ArenaClient, level: "info" | "warn" | "error", message: string): void {
    client.send("notice", { level, message });
  }

  private handlePickup(client: ArenaClient, targetId?: string): void {
    const data = client.userData!;
    const p = this.sim.players.get(client.sessionId);
    if (!p || !p.alive || data.pendingPickup) return;

    const loot = this.sim.claimLoot(p, targetId);
    if (loot === "too_far") return this.violation(client, "pickup_out_of_range", 1, { targetId });
    if (loot) {
      data.pendingPickup = true;
      this.deps.persistence
        .grantLoot(data.userId, this.matchId, loot.id, loot.itemKey)
        .then(({ row }) => {
          this.sim.finishPickup(loot.id);
          if (loot.itemKey === "potion_health") data.potions += row.quantity;
          client.send("item_pickup", { id: loot.id, itemKey: loot.itemKey, name: loot.name, rarity: loot.rarity, quantity: row.quantity });
          this.sendSelfStats(client, true);
        })
        .catch((err: unknown) => {
          this.sim.releasePickup(loot.id);
          if (err instanceof AppError && err.code === "INVENTORY_FULL") this.notice(client, "warn", "Inventory full — upgrade or sell items first");
          else this.deps.logger.error({ err }, "loot pickup failed");
        })
        .finally(() => {
          data.pendingPickup = false;
        });
      return;
    }
    // Nothing to loot nearby: try harvesting a resource node instead.
    this.sim.collectResource(p);
  }

  private async handleBuy(client: ArenaClient, sku: string): Promise<void> {
    const data = client.userData!;
    const p = this.sim.players.get(client.sessionId);
    if (!p || !p.alive) return;
    if (!MERCHANT_SKUS.has(sku)) return this.notice(client, "warn", "The merchant does not sell that here");
    const nearMerchant = this.sim.map.merchants.some((m) => dist2(m.x, m.y, p.x, p.y) <= MERCHANT_RADIUS * MERCHANT_RADIUS);
    if (!nearMerchant) return this.violation(client, "merchant_out_of_range", 1);
    try {
      await this.deps.persistence.buy(data.userId, sku, `arena-${this.matchId}-${crypto.randomUUID()}`);
      data.potions += 5;
      this.notice(client, "info", "Purchased 5 health potions");
      this.sendSelfStats(client, true);
    } catch (err) {
      this.notice(client, "error", err instanceof AppError ? err.message : "Purchase failed");
    }
  }

  private async handleUseItem(client: ArenaClient, inventoryItemId: string | null): Promise<void> {
    const data = client.userData!;
    const p = this.sim.players.get(client.sessionId);
    if (!p || !p.alive) return;
    try {
      if (!inventoryItemId) {
        if (data.potions <= 0) return this.notice(client, "warn", "No potions left");
        const meta = await this.deps.persistence.consumePotion(data.userId);
        data.potions = Math.max(0, data.potions - 1);
        this.sim.heal(p, typeof meta.fraction === "number" ? meta.fraction : 0.35);
      } else {
        const { itemKey, meta } = await this.deps.persistence.consumeItemByInventoryId(data.userId, inventoryItemId);
        if (meta.effect === "heal") {
          if (itemKey === "potion_health") data.potions = Math.max(0, data.potions - 1);
          this.sim.heal(p, typeof meta.fraction === "number" ? meta.fraction : 0.35);
        } else if (meta.effect === "xp_boost") {
          p.xpBoostUntil = Date.now() + (typeof meta.durationMs === "number" ? meta.durationMs : 30 * 60_000);
          this.notice(client, "info", "XP boost active");
        }
      }
      this.sendSelfStats(client, true);
    } catch (err) {
      this.notice(client, "error", err instanceof AppError ? err.message : "Could not use item");
    }
  }

  private async handleEquip(client: ArenaClient, inventoryItemId: string): Promise<void> {
    const data = client.userData!;
    const p = this.sim.players.get(client.sessionId);
    if (!p) return;
    try {
      const { dto, equipped } = await this.deps.persistence.equip(data.userId, inventoryItemId);
      p.equipped = equipped;
      this.sim.recomputeStats(p);
      this.notice(client, "info", `Equipped ${dto.item.name}`);
    } catch (err) {
      this.notice(client, "error", err instanceof AppError ? err.message : "Could not equip item");
    }
  }

  // ───────────────────────── Simulation events ─────────────────────────

  private simEvents(): SimEvents {
    return {
      attack: (p, kind, range) => this.broadcastNear(p.x, p.y, "player_attack", { id: p.id, aim: p.aim, kind, range }),
      damage: (targetId, x, y, sourceId, amount, crit, hp) => this.broadcastNear(x, y, "player_damage", { targetId, sourceId, amount, crit, hp }),
      playerKilled: (victim, killer) => this.onPlayerKilled(victim, killer),
      npcKilled: (npc, killer) => this.onNpcKilled(npc, killer),
      respawn: (p) => this.broadcastNear(p.x, p.y, "player_respawn", { id: p.id, x: p.x, y: p.y }),
      levelUp: (p) => {
        this.broadcastNear(p.x, p.y, "player_level_up", { id: p.id, level: p.level });
        const client = this.clientsBySim.get(p.id);
        if (client) this.sendSelfStats(client, true);
      },
      xpGained: (p, amount) => {
        const client = this.clientsBySim.get(p.id);
        if (client?.userData) client.userData.progress.xp += amount;
      },
      goldGained: (p, amount) => {
        const client = this.clientsBySim.get(p.id);
        if (client?.userData) {
          client.userData.progress.gold += amount;
          client.userData.goldTotal += amount;
        }
      },
      resourceCollected: (p, r) => this.onResourceCollected(p, r),
      entityAdded: (kind, id) => this.onEntityAdded(kind, id),
      entityRemoved: (kind, id) => this.onEntityRemoved(kind, id),
      lootSpawned: (loot: SimLoot) => this.broadcastNear(loot.x, loot.y, "item_drop", { id: loot.id, x: loot.x, y: loot.y, itemKey: loot.itemKey, rarity: loot.rarity }),
      statsChanged: (p) => {
        const client = this.clientsBySim.get(p.id);
        if (client) this.sendSelfStats(client, true);
      },
      suspicious: (p, kind, severity, details) => {
        const client = this.clientsBySim.get(p.id);
        if (client) this.violation(client, kind, severity, details);
      },
    };
  }

  private onEntityAdded(kind: EntityKind, id: string): void {
    const s = this.state;
    switch (kind) {
      case "player": {
        const p = this.sim.players.get(id)!;
        const ps = new PlayerState().assign({
          id: p.id,
          name: p.name,
          cls: p.characterKey,
          x: p.x,
          y: p.y,
          aim: 0,
          hp: Math.round(p.hp),
          maxHp: p.stats.maxHp,
          level: p.level,
          kills: 0,
          deaths: 0,
          score: 0,
          alive: true,
          ack: 0,
          flags: 0,
          tint: p.tint,
          isBot: p.isBot,
        });
        this.playerStates.set(id, ps);
        s.players.set(id, ps);
        break;
      }
      case "npc": {
        const n = this.sim.npcs.get(id)!;
        const ns = new NpcState().assign({ kind: n.def.key, x: n.x, y: n.y, aim: 0, hp: n.hp, maxHp: n.maxHp });
        this.npcStates.set(id, ns);
        s.npcs.set(id, ns);
        break;
      }
      case "projectile": {
        const pr = this.sim.projectiles.get(id)!;
        const st = new ProjectileState().assign({
          kind: pr.kind,
          owner: pr.ownerId,
          x: pr.x,
          y: pr.y,
          vx: pr.vx,
          vy: pr.vy,
          t0: this.sim.now,
          ttl: Math.round(pr.expiresAt - pr.bornAt),
        });
        s.projectiles.set(id, st);
        // Show new projectiles immediately to nearby clients (not only at the next view refresh).
        for (const client of this.clients) {
          const me = this.sim.players.get(client.sessionId);
          if (client.view && me && Math.abs(me.x - pr.x) < VIEW_RADIUS_X + 200 && Math.abs(me.y - pr.y) < VIEW_RADIUS_Y + 200) client.view.add(st);
        }
        break;
      }
      case "loot": {
        const l = this.sim.loot.get(id)!;
        s.loot.set(id, new LootState().assign({ itemKey: l.itemKey, name: l.name, rarity: l.rarity, x: l.x, y: l.y }));
        break;
      }
      case "resource": {
        const r = this.sim.resources.get(id)!;
        s.resources.set(id, new ResourceState().assign({ kind: r.def.key, x: r.x, y: r.y }));
        break;
      }
    }
  }

  private onEntityRemoved(kind: EntityKind, id: string): void {
    const map =
      kind === "player" ? this.state.players : kind === "npc" ? this.state.npcs : kind === "projectile" ? this.state.projectiles : kind === "loot" ? this.state.loot : this.state.resources;
    const obj = map.get(id);
    if (obj) {
      for (const client of this.clients) client.view?.remove(obj);
    }
    map.delete(id);
    if (kind === "player") this.playerStates.delete(id);
    if (kind === "npc") this.npcStates.delete(id);
  }

  private onPlayerKilled(victim: SimPlayer, killer: Killer): void {
    const killerName = killer.kind === "player" ? killer.player.name : killer.kind === "npc" ? killer.npc.def.name : "the arena";
    const killerId = killer.kind === "player" ? killer.player.id : killer.kind === "npc" ? killer.npc.id : "";
    this.broadcast("player_death", {
      killerId,
      killerName,
      victimId: victim.id,
      victimName: victim.name,
      victimIsNpc: false,
      respawnAt: victim.respawnAt,
    });
    const vc = this.clientsBySim.get(victim.id);
    if (vc?.userData) vc.userData.progress.deaths++;

    if (killer.kind !== "player") return;
    const kc = this.clientsBySim.get(killer.player.id);
    if (!kc?.userData) return;
    kc.userData.progress.kills++;

    // Crypto kill reward: real players only, anti-farming cooldown per (killer, victim) pair.
    if (victim.isBot || killer.player.isBot || victim.userId === killer.player.userId) return;
    const pairKey = `${killer.player.userId}:${victim.userId}`;
    const last = pvpKillLog.get(pairKey) ?? 0;
    if (Date.now() - last < this.deps.config.PVP_SAME_VICTIM_COOLDOWN_SECONDS * 1000) return;
    pvpKillLog.set(pairKey, Date.now());
    pruneExpired();

    const ratio = Math.max(0.5, Math.min(2, victim.level / Math.max(1, killer.player.level)));
    void this.deps.persistence
      .reward({
        userId: killer.player.userId,
        source: "KILL",
        asset: "CRYPTO",
        baseAmount: this.deps.config.KILL_REWARD_BASE,
        performanceBps: Math.round(ratio * 10_000),
        eventBps: this.mode === "RANKED" ? 12_000 : 10_000,
        idempotencyKey: `kill:${this.matchId}:${killer.player.userId}:${victim.userId}:${killer.player.kills}`,
        matchId: this.matchId,
      })
      .then((r) => {
        if (r.amount > 0n) kc.send("reward_granted", { source: "KILL", asset: "CRYPTO", amount: r.amount.toString(), reason: r.reason });
      })
      .catch((err: unknown) => this.deps.logger.error({ err }, "kill reward failed"));
  }

  private onNpcKilled(npc: SimNpc, killer: SimPlayer): void {
    const kc = this.clientsBySim.get(killer.id);
    if (kc?.userData) {
      kc.userData.progress.npcKills++;
      if (npc.def.key === "chest") kc.userData.progress.chests++;
    }
    if (npc.def.key === "titan") {
      this.broadcast("player_death", { killerId: killer.id, killerName: killer.name, victimId: npc.id, victimName: npc.def.name, victimIsNpc: true, respawnAt: 0 });
      if (kc?.userData && !killer.isBot) {
        const unit = 10n ** BigInt(this.deps.config.REWARD_TOKEN_DECIMALS);
        void this.deps.persistence
          .reward({ userId: killer.userId, source: "EVENT", asset: "CRYPTO", baseAmount: 5n * unit, idempotencyKey: `titan:${this.matchId}:${npc.id}`, matchId: this.matchId, reason: "Crystal Titan slain" })
          .then((r) => {
            if (r.amount > 0n) kc.send("reward_granted", { source: "EVENT", asset: "CRYPTO", amount: r.amount.toString(), reason: r.reason });
          })
          .catch((err: unknown) => this.deps.logger.error({ err }, "titan reward failed"));
      }
    }
  }

  private onResourceCollected(p: SimPlayer, r: SimResource): void {
    const client = this.clientsBySim.get(p.id);
    if (!client?.userData) return;
    client.userData.progress.resources++;
    client.send("item_pickup", { id: r.id, itemKey: r.def.key, name: r.def.name, rarity: r.def.questObject ? "LEGENDARY" : "COMMON", quantity: 1, gold: r.def.gold });
  }

  // ───────────────────────── Tick ─────────────────────────

  private fixedTick(): void {
    const start = performance.now();
    if (this.state.phase === "running" || this.state.phase === "countdown" || this.state.phase === "waiting") {
      this.bots.update();
      this.sim.step();
    }
    this.syncState();

    const dt = this.sim.dt;
    this.viewTimer -= dt;
    if (this.viewTimer <= 0) {
      this.viewTimer = 200;
      for (const client of this.clients) this.refreshView(client);
    }
    this.statsTimer -= dt;
    if (this.statsTimer <= 0) {
      this.statsTimer = 500;
      for (const client of this.clients) this.sendSelfStats(client, false);
      this.checkBotBehaviour();
    }
    this.flushTimer -= dt;
    if (this.flushTimer <= 0) {
      this.flushTimer = 20_000;
      for (const client of this.clients) void this.flushClient(client, {});
    }
    this.updatePhase();
    metrics.tickDuration.observe(performance.now() - start);
  }

  private syncState(): void {
    this.state.serverTime = this.sim.now;
    for (const p of this.sim.players.values()) {
      const s = this.playerStates.get(p.id);
      if (!s) continue;
      const eff = this.sim.effectiveStats(p);
      const flags = (eff.invisible ? 1 : 0) | (p.buffs.length > 0 ? 2 : 0) | (this.sim.now < p.spawnProtectedUntil ? 4 : 0) | (p.mover.dashRemainingMs > 0 ? 8 : 0);
      if (s.x !== p.x) s.x = p.x;
      if (s.y !== p.y) s.y = p.y;
      if (s.aim !== p.aim) s.aim = p.aim;
      const hp = Math.max(0, Math.round(p.hp));
      if (s.hp !== hp) s.hp = hp;
      if (s.maxHp !== p.stats.maxHp) s.maxHp = p.stats.maxHp;
      if (s.level !== p.level) s.level = p.level;
      if (s.kills !== p.kills) s.kills = p.kills;
      if (s.deaths !== p.deaths) s.deaths = p.deaths;
      if (s.score !== p.score) s.score = p.score;
      if (s.alive !== p.alive) s.alive = p.alive;
      if (s.ack !== p.ackSeq) s.ack = p.ackSeq;
      if (s.flags !== flags) s.flags = flags;
      if (s.tint !== p.tint) s.tint = p.tint;
    }
    for (const n of this.sim.npcs.values()) {
      if (!n.awake) continue;
      const s = this.npcStates.get(n.id);
      if (!s) continue;
      if (s.x !== n.x) s.x = n.x;
      if (s.y !== n.y) s.y = n.y;
      if (s.aim !== n.aim) s.aim = n.aim;
      const hp = Math.max(0, Math.round(n.hp));
      if (s.hp !== hp) s.hp = hp;
    }
  }

  /** Interest management: each client's StateView holds only entities around its player. */
  private refreshView(client: ArenaClient): void {
    const view = client.view;
    const me = this.sim.players.get(client.sessionId);
    if (!view || !me) return;
    const minX = me.x - VIEW_RADIUS_X;
    const maxX = me.x + VIEW_RADIUS_X;
    const minY = me.y - VIEW_RADIUS_Y;
    const maxY = me.y + VIEW_RADIUS_Y;
    const inside = (x: number, y: number): boolean => x >= minX && x <= maxX && y >= minY && y <= maxY;
    const sync = <T extends object>(map: Map<string, T> | { forEach(cb: (v: T, k: string) => void): void }, pos: (id: string) => { x: number; y: number } | undefined): void => {
      map.forEach((obj: T, id: string) => {
        const p = pos(id);
        const visible = !!p && inside(p.x, p.y);
        const has = view.has(obj as never);
        if (visible && !has) view.add(obj as never);
        else if (!visible && has) view.remove(obj as never);
      });
    };
    sync(this.state.players, (id) => {
      if (id === me.id) return me;
      const o = this.sim.players.get(id);
      if (!o) return undefined;
      return this.sim.effectiveStats(o).invisible ? undefined : o;
    });
    sync(this.state.npcs, (id) => this.sim.npcs.get(id));
    sync(this.state.loot, (id) => this.sim.loot.get(id));
    sync(this.state.resources, (id) => this.sim.resources.get(id));
    sync(this.state.projectiles, (id) => this.sim.projectiles.get(id));
  }

  private broadcastNear<K extends keyof ServerMessages>(x: number, y: number, type: K, payload: ServerMessages[K]): void {
    for (const client of this.clients) {
      const me = this.sim.players.get(client.sessionId);
      if (!me) continue;
      if (Math.abs(me.x - x) <= VIEW_RADIUS_X + 200 && Math.abs(me.y - y) <= VIEW_RADIUS_Y + 200) {
        (client.send as (t: K, m: ServerMessages[K]) => void)(type, payload);
      }
    }
  }

  private sendSelfStats(client: ArenaClient, force: boolean): void {
    const data = client.userData;
    const p = this.sim.players.get(client.sessionId);
    if (!data || !p) return;
    const now = Date.now();
    if (!force && now - data.lastStatsSentAt < 450) return;
    data.lastStatsSentAt = now;
    const lp = levelProgress(p.xp);
    const msg: SelfStatsMessage = {
      stats: this.sim.effectiveStats(p),
      cooldowns: { attack: p.nextAttackAt, dash: p.nextDashAt, skill: p.nextSkillAt, ultimate: p.nextUltAt },
      skillName: p.def.skill.name,
      ultimateName: p.def.ultimate.name,
      gold: data.goldTotal,
      potions: data.potions,
      xp: p.xp,
      xpForNext: lp.xpForNext,
      xpIntoLevel: lp.xpIntoLevel,
    };
    client.send("self_stats", msg);
  }

  private checkBotBehaviour(): void {
    for (const client of this.clients) {
      const data = client.userData;
      if (!data || data.botFlagged) continue;
      const score = data.botDetector.score();
      if (score >= 0.8) {
        data.botFlagged = true;
        this.deps.logger.warn({ event: LogEvent.ANTICHEAT_FLAG, userId: data.userId, score }, "bot-like input pattern");
        void this.deps.persistence.flag(data.userId, this.matchId, "bot_like_input", 5, { score });
      }
    }
  }

  private async flushClient(client: ArenaClient, opts: { left?: boolean; win?: boolean; countsAsMatch?: boolean }): Promise<void> {
    const data = client.userData;
    if (!data) return;
    const p = this.sim.players.get(client.sessionId);
    const pr = data.progress;
    const damage = p ? p.damageDealt : data.lastFlushedDamage;
    const damageDelta = Math.max(0, damage - data.lastFlushedDamage);
    const hasProgress = pr.kills || pr.deaths || pr.npcKills || pr.xp || pr.gold || pr.resources || pr.chests || damageDelta;
    if (!hasProgress && !opts.left && !opts.win) return;

    const delta = { ...pr, damageDealt: damageDelta };
    pr.flushSeq++;
    const seq = pr.flushSeq;
    data.progress = { ...emptyProgress(), flushSeq: seq };
    data.lastFlushedDamage = damage;
    try {
      const res = await this.deps.persistence.flush({
        matchId: this.matchId,
        userId: data.userId,
        userCharacterId: data.userCharacterId,
        flushSeq: seq,
        kills: delta.kills,
        deaths: delta.deaths,
        npcKills: delta.npcKills,
        damageDealt: delta.damageDealt,
        xp: delta.xp,
        gold: delta.gold,
        resources: delta.resources,
        chests: delta.chests,
        win: !!opts.win,
        left: !!opts.left,
        countsAsMatch: !!opts.countsAsMatch,
      });
      for (const q of res.completedQuests) client.send("quest_complete", { questKey: q.key, name: q.name });
    } catch (err) {
      // Put the numbers back so the next flush retries them (the flushSeq keeps it idempotent).
      data.progress.kills += delta.kills;
      data.progress.deaths += delta.deaths;
      data.progress.npcKills += delta.npcKills;
      data.progress.xp += delta.xp;
      data.progress.gold += delta.gold;
      data.progress.resources += delta.resources;
      data.progress.chests += delta.chests;
      data.lastFlushedDamage -= delta.damageDealt;
      this.deps.logger.error({ err, userId: data.userId }, "progress flush failed");
    }
  }

  // ───────────────────────── Ranked phases ─────────────────────────

  private checkRankedStart(): void {
    if (this.mode !== "RANKED" || this.state.phase !== "waiting") return;
    const participants = this.sim.players.size;
    if (participants >= this.deps.config.RANKED_MIN_PLAYERS) {
      this.state.phase = "countdown";
      this.state.phaseEndsAt = this.sim.now + 10_000;
    }
  }

  private updatePhase(): void {
    if (this.mode !== "RANKED") return;
    const now = this.sim.now;
    if (this.state.phase === "waiting") {
      this.checkRankedStart();
    } else if (this.state.phase === "countdown" && now >= this.state.phaseEndsAt) {
      this.state.phase = "running";
      this.state.phaseEndsAt = now + this.deps.config.RANKED_MATCH_SECONDS * 1000;
      void this.lock();
      for (const p of this.sim.players.values()) {
        p.kills = 0;
        p.deaths = 0;
        p.score = 0;
        p.hp = p.stats.maxHp;
      }
      this.broadcast("match_start", { mode: this.mode, endsAt: this.state.phaseEndsAt });
    } else if (this.state.phase === "running" && now >= this.state.phaseEndsAt) {
      void this.finishMatch(true);
    }
  }

  private standings(): MatchStanding[] {
    return [...this.sim.players.values()]
      .sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths)
      .map((p, i) => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths, score: p.score, placement: i + 1 }));
  }

  private async finishMatch(ranked: boolean): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.state.phase = "ended";
    const standings = this.standings();
    this.broadcast("match_end", { mode: this.mode, standings });

    const placements: { userId: string; placement: number }[] = [];
    let winnerUserId: string | null = null;
    for (const s of standings) {
      const p = this.sim.players.get(s.id);
      if (!p || p.isBot) continue;
      placements.push({ userId: p.userId, placement: s.placement });
      if (s.placement === 1) winnerUserId = p.userId;
    }

    for (const client of this.clients) {
      const p = this.sim.players.get(client.sessionId);
      const placement = standings.find((s) => s.id === client.sessionId)?.placement ?? 99;
      const win = ranked && placement === 1 && !!p && p.score > 0;
      await this.flushClient(client, { win });
      // Tournament reward for the top 3 of a ranked match (performance-based, budget-capped).
      if (ranked && p && !p.isBot && placement <= 3 && p.score > 0 && client.userData) {
        const unit = 10n ** BigInt(this.deps.config.REWARD_TOKEN_DECIMALS);
        const share = placement === 1 ? 10_000 : placement === 2 ? 6_000 : 3_000;
        const r = await this.deps.persistence
          .reward({ userId: p.userId, source: "TOURNAMENT", asset: "CRYPTO", baseAmount: 2n * unit, performanceBps: share, idempotencyKey: `ranked:${this.matchId}:${p.userId}`, matchId: this.matchId, reason: `Ranked placement #${placement}` })
          .catch(() => null);
        if (r && r.amount > 0n) client.send("reward_granted", { source: "TOURNAMENT", asset: "CRYPTO", amount: r.amount.toString(), reason: r.reason });
      }
    }
    await this.deps.persistence.endMatch(this.matchId, winnerUserId, placements).catch((err: unknown) => this.deps.logger.error({ err }, "failed to end match"));
    if (ranked) this.clock.setTimeout(() => void this.disconnect(), 15_000);
  }
}
