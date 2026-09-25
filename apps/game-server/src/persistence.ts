// Bridges the in-memory simulation and the database. Every write is idempotent and
// serialised per user, so reconnects, retries or duplicate events can never double-grant.

import type { AppConfig } from "@cryptoarena/config";
import { withTransaction, type Db } from "@cryptoarena/database";
import {
  AppError,
  addMatchPlayer,
  consumeItem,
  countItem,
  createMatch,
  endMatch,
  equipItem,
  evaluateFeature,
  flushPlayerProgress,
  getEquippedForStats,
  getEquippedSkinTint,
  grantItem,
  grantReward,
  loadCharacterForMatch,
  purchaseProduct,
  recordAntiCheatFlag,
  type PlayerProgressDelta,
  type RewardResult,
} from "@cryptoarena/economy";
import type { LootCandidate } from "@cryptoarena/game-core";
import type { Logger } from "@cryptoarena/observability";
import type { MatchMode } from "@cryptoarena/shared";

export class Persistence {
  private readonly prisma: Db;
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(prisma: Db, config: AppConfig, logger: Logger) {
    this.prisma = prisma;
    this.config = config;
    this.logger = logger;
  }

  /** Runs `fn` after all previously queued work for `key` (per-user write ordering). */
  enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.queues.set(key, next);
    void next.finally(() => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    }).catch(() => undefined);
    return next;
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.queues.values()]);
  }

  async loadLootCatalog(): Promise<(LootCandidate & { name: string })[]> {
    const items = await this.prisma.item.findMany({ where: { active: true, dropWeight: { gt: 0 } } });
    return items.map((i) => ({ key: i.key, rarity: i.rarity, type: i.type, dropWeight: i.dropWeight, name: i.name }));
  }

  async createMatch(roomId: string, mode: MatchMode, maxPlayers: number, tickRate: number) {
    return withTransaction(this.prisma, (tx) => createMatch(tx, { roomId, mode, mapKey: "neon_arena", maxPlayers, tickRate }));
  }

  async endMatch(matchId: string, winnerUserId: string | null, placements: { userId: string; placement: number }[]) {
    await withTransaction(this.prisma, (tx) => endMatch(tx, matchId, winnerUserId, placements));
  }

  async loadPlayer(userId: string, userCharacterId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("NOT_FOUND", "User not found");
    const play = await evaluateFeature(this.prisma, this.config, user, "PLAY");
    if (!play.allowed) throw new AppError(play.code, play.reason);
    const character = await loadCharacterForMatch(this.prisma, userId, userCharacterId);
    const potions = await countItem(this.prisma, userId, "potion_health");
    const tint = await getEquippedSkinTint(this.prisma, userId, character.characterKey);
    return { user, character, potions, tint };
  }

  async joinMatch(matchId: string, userId: string, userCharacterId: string) {
    await withTransaction(this.prisma, (tx) => addMatchPlayer(tx, matchId, userId, userCharacterId));
  }

  flush(delta: PlayerProgressDelta) {
    return this.enqueue(delta.userId, () =>
      withTransaction(this.prisma, (tx) => flushPlayerProgress(tx, this.config, this.logger, delta)),
    );
  }

  grantLoot(userId: string, matchId: string, lootId: string, itemKey: string) {
    return this.enqueue(userId, () =>
      withTransaction(this.prisma, (tx) =>
        grantItem(tx, { userId, itemKey, quantity: 1, source: "LOOT", sourceRef: `loot:${matchId}:${lootId}` }),
      ),
    );
  }

  reward(input: Parameters<typeof grantReward>[3]): Promise<RewardResult> {
    return this.enqueue(input.userId, () => withTransaction(this.prisma, (tx) => grantReward(tx, this.config, this.logger, input)));
  }

  consumePotion(userId: string) {
    return this.enqueue(userId, () => withTransaction(this.prisma, (tx) => consumeItem(tx, userId, "potion_health")));
  }

  consumeItemByInventoryId(userId: string, inventoryItemId: string) {
    return this.enqueue(userId, () =>
      withTransaction(this.prisma, async (tx) => {
        const row = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, userId }, include: { item: true } });
        if (!row || row.item.type !== "CONSUMABLE") throw new AppError("NOT_FOUND", "Consumable not found");
        const meta = await consumeItem(tx, userId, row.item.key);
        return { itemKey: row.item.key, meta };
      }),
    );
  }

  equip(userId: string, inventoryItemId: string) {
    return this.enqueue(userId, () =>
      withTransaction(this.prisma, async (tx) => {
        const dto = await equipItem(tx, userId, inventoryItemId);
        const equipped = await getEquippedForStats(tx, userId);
        return { dto, equipped };
      }),
    );
  }

  buy(userId: string, sku: string, idempotencyKey: string) {
    return this.enqueue(userId, () =>
      withTransaction(this.prisma, (tx) => purchaseProduct(tx, this.config, this.logger, { userId, sku, quantity: 1, idempotencyKey })),
    );
  }

  flag(userId: string, matchId: string | null, kind: string, severity: number, details: Record<string, unknown>) {
    return this.enqueue(userId, () =>
      withTransaction(this.prisma, (tx) => recordAntiCheatFlag(tx, { userId, matchId, kind, severity, details })),
    ).catch((err: unknown) => this.logger.error({ err, userId, kind }, "failed to record anti-cheat flag"));
  }
}
