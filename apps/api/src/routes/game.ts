import { withTransaction } from "@cryptoarena/database";
import {
  AppError,
  claimQuest,
  equipItem,
  getLeaderboard,
  listCharacters,
  listInventory,
  listQuests,
  listShop,
  parseProductMetadata,
  purchaseProduct,
  requireFeature,
  unequipItem,
  upgradeCharacterStat,
  upgradeItem,
} from "@cryptoarena/economy";
import {
  characterUnlockRequest,
  characterUpgradeRequest,
  gameTicketRequest,
  inventoryItemRequest,
  itemUpgradeRequest,
  leaderboardQuery,
  purchaseRequest,
  questClaimRequest,
} from "@cryptoarena/validation";
import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth";
import type { ApiContext } from "../context";
import { parseBody, parseQuery } from "../http";
import { buildBalances } from "../me";
import { signGameTicket } from "../tokens";

export async function registerGameRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  // Inventory
  app.get("/api/inventory", async (req) => {
    const user = requireUser(req);
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { inventorySlots: true } });
    return { slots: u.inventorySlots, items: await listInventory(ctx.prisma, user.id) };
  });

  app.post("/api/inventory/equip", async (req) => {
    const user = requireUser(req);
    const body = parseBody(inventoryItemRequest, req);
    return withTransaction(ctx.prisma, (tx) => equipItem(tx, user.id, body.inventoryItemId));
  });

  app.post("/api/inventory/unequip", async (req) => {
    const user = requireUser(req);
    const body = parseBody(inventoryItemRequest, req);
    return withTransaction(ctx.prisma, (tx) => unequipItem(tx, user.id, body.inventoryItemId));
  });

  app.post("/api/inventory/upgrade", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(itemUpgradeRequest, req);
    const item = await withTransaction(ctx.prisma, (tx) => upgradeItem(tx, user.id, body.inventoryItemId, body.idempotencyKey));
    return { item, balances: await buildBalances(ctx, user.id) };
  });

  // Shop
  app.get("/api/shop", async (req) => listShop(ctx.prisma, req.auth?.id ?? null));

  app.post("/api/shop/purchase", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(purchaseRequest, req);
    const { purchase, duplicate } = await withTransaction(ctx.prisma, (tx) =>
      purchaseProduct(tx, ctx.config, ctx.logger, { userId: user.id, sku: body.sku, quantity: body.quantity, idempotencyKey: body.idempotencyKey }),
    );
    return { purchaseId: purchase.id, duplicate, balances: await buildBalances(ctx, user.id) };
  });

  // Characters
  app.get("/api/characters", async (req) => listCharacters(ctx.prisma, requireUser(req).id));

  app.post("/api/characters/unlock", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(characterUnlockRequest, req);
    const products = await ctx.prisma.shopProduct.findMany({ where: { active: true, category: "CHARACTER" }, orderBy: { sortOrder: "asc" } });
    const sku = body.sku ?? null;
    const product = products.find(
      (p) => (!sku || p.sku === sku) && parseProductMetadata(p.metadata).grants.some((g) => g.kind === "CHARACTER" && g.characterKey === body.characterKey),
    );
    if (!product) throw new AppError("NOT_FOUND", "This character cannot be unlocked right now");
    await withTransaction(ctx.prisma, (tx) =>
      purchaseProduct(tx, ctx.config, ctx.logger, { userId: user.id, sku: product.sku, quantity: 1, idempotencyKey: body.idempotencyKey }),
    );
    return { characters: await listCharacters(ctx.prisma, user.id), balances: await buildBalances(ctx, user.id) };
  });

  app.post("/api/characters/upgrade", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(characterUpgradeRequest, req);
    await withTransaction(ctx.prisma, (tx) => upgradeCharacterStat(tx, user.id, body.userCharacterId, body.stat, body.idempotencyKey));
    return { characters: await listCharacters(ctx.prisma, user.id), balances: await buildBalances(ctx, user.id) };
  });

  // Leaderboard (scores are only ever written by the game server)
  app.get("/api/leaderboard", async (req) => {
    const q = parseQuery(leaderboardQuery, req);
    return getLeaderboard(ctx.prisma, q.scope, req.auth?.id ?? null, q.limit);
  });

  // Quests
  app.get("/api/quests", async (req) => listQuests(ctx.prisma, requireUser(req).id));

  app.post("/api/quests/claim", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(questClaimRequest, req);
    const result = await withTransaction(ctx.prisma, (tx) => claimQuest(tx, ctx.config, ctx.logger, user.id, body.questKey));
    return { ...result, balances: await buildBalances(ctx, user.id) };
  });

  // Game ticket: short-lived proof for the Colyseus server that this user may play this character.
  app.post("/api/game/ticket", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(gameTicketRequest, req);
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await requireFeature(ctx.prisma, ctx.config, u, "PLAY");
    const uc = await ctx.prisma.userCharacter.findFirst({ where: { id: body.userCharacterId, userId: user.id }, include: { character: true } });
    if (!uc || !uc.character.active) throw new AppError("NOT_FOUND", "Character not owned");
    const ticket = await signGameTicket(ctx.config, { sub: user.id, uc: uc.id, mode: body.mode, name: user.username });
    return { ticket, mode: body.mode, expiresInSeconds: ctx.config.GAME_TICKET_TTL_SECONDS };
  });
}
