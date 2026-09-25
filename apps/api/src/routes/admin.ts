// Admin API. Every route checks the admin role server-side; every mutation is audited.
import { withTransaction } from "@cryptoarena/database";
import {
  AppError,
  adjustBalance,
  adminFundRewardPool,
  adminGrantItem,
  approveWithdrawal,
  assetImbalance,
  cancelWithdrawal,
  distributeLeaderboardRewards,
  fundRewardPool,
  getUserBalances,
  refundPurchase,
  setUserStatus,
  setWithdrawalsSuspended,
  writeAudit,
} from "@cryptoarena/economy";
import { parseUnits } from "@cryptoarena/shared";
import {
  adminAdjustRequest,
  adminFundPoolRequest,
  adminGrantItemRequest,
  adminLeaderboardDistributeRequest,
  adminListQuery,
  adminProductUpdateRequest,
  adminRefundRequest,
  adminRoleRequest,
  adminSeasonRequest,
  adminUserStatusRequest,
  adminWithdrawalActionRequest,
  adminWithdrawalSuspendRequest,
  uuid,
  z,
} from "@cryptoarena/validation";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireAdmin } from "../auth";
import type { ApiContext } from "../context";
import { parseBody, parseParams, parseQuery } from "../http";

function actorOf(req: FastifyRequest, min: Parameters<typeof requireAdmin>[1]) {
  const a = requireAdmin(req, min);
  return { adminUserId: a.adminUserId, role: a.adminRole, ip: req.ip };
}

function units(ctx: ApiContext, v: string): bigint {
  try {
    return parseUnits(v, ctx.config.REWARD_TOKEN_DECIMALS);
  } catch (e) {
    throw new AppError("BAD_REQUEST", (e as Error).message);
  }
}

export async function registerAdminRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const db = ctx.prisma;

  app.get("/api/admin/overview", async (req) => {
    requireAdmin(req, "SUPPORT");
    const pool = await db.balanceAccount.findUnique({ where: { systemKey: "CRYPTO_REWARD_POOL" } });
    const [users, activeMatches, pendingWithdrawals, reviewWithdrawals, deposits24h, rewards24h, flags24h] = await Promise.all([
      db.user.count(),
      db.gameMatch.count({ where: { status: "RUNNING" } }),
      db.withdrawal.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      db.withdrawal.count({ where: { status: "PENDING", requiresReview: true } }),
      db.deposit.aggregate({ where: { status: "CREDITED", creditedAt: { gte: new Date(Date.now() - 86_400_000) } }, _sum: { amount: true }, _count: true }),
      db.reward.aggregate({ where: { asset: "CRYPTO", status: { in: ["GRANTED", "CAPPED"] }, createdAt: { gte: new Date(Date.now() - 86_400_000) } }, _sum: { amount: true }, _count: true }),
      db.antiCheatFlag.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    ]);
    return {
      users,
      activeMatches,
      pendingWithdrawals,
      reviewWithdrawals,
      deposits24h: { count: deposits24h._count, amount: (deposits24h._sum.amount ?? 0n).toString() },
      cryptoRewards24h: { count: rewards24h._count, amount: (rewards24h._sum.amount ?? 0n).toString() },
      antiCheatFlags24h: flags24h,
      rewardPoolBalance: (pool?.balance ?? 0n).toString(),
      ledgerImbalance: Object.fromEntries(Object.entries(await assetImbalance(db)).map(([k, v]) => [k, v.toString()])),
      network: ctx.config.SOLANA_NETWORK,
      decimals: ctx.config.REWARD_TOKEN_DECIMALS,
      symbol: ctx.config.REWARD_TOKEN_SYMBOL,
    };
  });

  app.get("/api/admin/users", async (req) => {
    requireAdmin(req, "SUPPORT");
    const q = parseQuery(adminListQuery, req);
    const where = {
      ...(q.q ? { OR: [{ username: { contains: q.q, mode: "insensitive" as const } }, { wallets: { some: { address: { contains: q.q } } } }, ...(uuid.safeParse(q.q).success ? [{ id: q.q }] : [])] } : {}),
      ...(q.status ? { status: q.status as "ACTIVE" | "SUSPENDED" | "BANNED" } : {}),
    };
    const [rows, total] = await Promise.all([
      db.user.findMany({ where, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset, include: { wallets: true, admin: true } }),
      db.user.count({ where }),
    ]);
    return { total, rows };
  });

  app.get("/api/admin/users/:id", async (req) => {
    requireAdmin(req, "SUPPORT");
    const { id } = parseParams(z.object({ id: uuid }), req);
    const user = await db.user.findUnique({
      where: { id },
      include: {
        wallets: true,
        admin: true,
        characters: { include: { character: true } },
        antiCheatFlags: { orderBy: { createdAt: "desc" }, take: 50 },
        purchases: { orderBy: { createdAt: "desc" }, take: 50, include: { product: true } },
        withdrawals: { orderBy: { createdAt: "desc" }, take: 20 },
        deposits: { orderBy: { createdAt: "desc" }, take: 20 },
        inventory: { include: { item: true }, take: 200 },
      },
    });
    if (!user) throw new AppError("NOT_FOUND", "User not found");
    return { user, balances: await getUserBalances(db, id) };
  });

  const list = <T>(path: string, min: Parameters<typeof requireAdmin>[1], fn: (q: z.infer<typeof adminListQuery>) => Promise<T>) =>
    app.get(path, async (req) => {
      requireAdmin(req, min);
      return fn(parseQuery(adminListQuery, req));
    });

  list("/api/admin/wallets", "SUPPORT", (q) => db.wallet.findMany({ where: q.q ? { address: { contains: q.q } } : {}, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset, include: { user: { select: { username: true } } } }));
  list("/api/admin/deposits", "SUPPORT", (q) => db.deposit.findMany({ where: q.status ? { status: q.status as never } : {}, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset, include: { user: { select: { username: true } } } }));
  list("/api/admin/withdrawals", "SUPPORT", (q) => db.withdrawal.findMany({ where: q.status === "REVIEW" ? { status: "PENDING", requiresReview: true } : q.status ? { status: q.status as never } : {}, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset, include: { user: { select: { username: true, riskScore: true } } } }));
  list("/api/admin/rewards", "SUPPORT", (q) => db.reward.findMany({ where: q.status ? { status: q.status as never } : {}, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset, include: { user: { select: { username: true } } } }));
  list("/api/admin/items", "SUPPORT", () => db.item.findMany({ orderBy: [{ type: "asc" }, { rarity: "asc" }] }));
  list("/api/admin/characters", "SUPPORT", () => db.character.findMany({ include: { stats: true, _count: { select: { userCharacters: true } } } }));
  list("/api/admin/shop", "SUPPORT", () => db.shopProduct.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }], include: { _count: { select: { purchases: true } } } }));
  list("/api/admin/purchases", "SUPPORT", (q) => db.purchase.findMany({ orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset, include: { product: true, user: { select: { username: true } } } }));
  list("/api/admin/seasons", "SUPPORT", () => db.season.findMany({ orderBy: { startsAt: "desc" } }));
  list("/api/admin/leaderboards", "SUPPORT", (q) => db.leaderboard.findMany({ orderBy: { createdAt: "desc" }, take: q.limit, include: { _count: { select: { entries: true } } } }));
  list("/api/admin/rooms", "SUPPORT", (q) => db.gameMatch.findMany({ where: q.status ? { status: q.status as never } : { status: "RUNNING" }, orderBy: { createdAt: "desc" }, take: q.limit, include: { _count: { select: { players: { where: { leftAt: null } } } } } }));
  list("/api/admin/transactions", "SUPPORT", (q) => db.balanceLedger.findMany({ where: q.q && uuid.safeParse(q.q).success ? { OR: [{ userId: q.q }, { journalId: q.q }] } : {}, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset, include: { account: { select: { kind: true, systemKey: true } } } }));
  list("/api/admin/audit", "ADMIN", (q) => db.auditLog.findMany({ where: q.q ? { action: { contains: q.q.toUpperCase() } } : {}, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset }));
  list("/api/admin/anticheat", "MODERATOR", (q) => db.antiCheatFlag.findMany({ orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset, include: { user: { select: { username: true, riskScore: true } } } }));

  // ── Actions ──
  app.post("/api/admin/users/status", async (req) => {
    const actor = actorOf(req, "MODERATOR");
    const b = parseBody(adminUserStatusRequest, req);
    return withTransaction(db, (tx) => setUserStatus(tx, ctx.logger, actor, b.userId, b.status, b.reason));
  });

  app.post("/api/admin/users/withdrawals", async (req) => {
    const actor = actorOf(req, "MODERATOR");
    const b = parseBody(adminWithdrawalSuspendRequest, req);
    return withTransaction(db, (tx) => setWithdrawalsSuspended(tx, ctx.logger, actor, b.userId, b.suspended, b.reason));
  });

  app.post("/api/admin/withdrawals/approve", async (req) => {
    const actor = actorOf(req, "ADMIN");
    const b = parseBody(adminWithdrawalActionRequest, req);
    return approveWithdrawal(ctx, b.withdrawalId, actor.adminUserId, b.reason, actor.ip);
  });

  app.post("/api/admin/withdrawals/cancel", async (req) => {
    const actor = actorOf(req, "ADMIN");
    const b = parseBody(adminWithdrawalActionRequest, req);
    return cancelWithdrawal(ctx, b.withdrawalId, { adminUserId: actor.adminUserId, reason: b.reason, ip: actor.ip });
  });

  app.post("/api/admin/purchases/refund", async (req) => {
    const actor = actorOf(req, "ADMIN");
    const b = parseBody(adminRefundRequest, req);
    return withTransaction(db, (tx) => refundPurchase(tx, ctx.logger, b.purchaseId, actor.adminUserId, b.reason, actor.ip));
  });

  app.post("/api/admin/items/grant", async (req) => {
    const actor = actorOf(req, "ADMIN");
    const b = parseBody(adminGrantItemRequest, req);
    return withTransaction(db, (tx) => adminGrantItem(tx, ctx.logger, actor, b.userId, b.itemKey, b.quantity, b.reason, b.requestId));
  });

  app.post("/api/admin/balance/adjust", async (req) => {
    const actor = actorOf(req, "ADMIN");
    const b = parseBody(adminAdjustRequest, req);
    const posted = await withTransaction(db, (tx) => adjustBalance(tx, ctx.logger, actor, b.userId, b.account, BigInt(b.delta), b.reason, b.requestId));
    return { ...posted, balances: await getUserBalances(db, b.userId) };
  });

  app.post("/api/admin/pool/fund", async (req) => {
    const actor = actorOf(req, "SUPER_ADMIN");
    const b = parseBody(adminFundPoolRequest, req);
    await withTransaction(db, (tx) => adminFundRewardPool(tx, ctx.logger, actor, units(ctx, b.amount), b.reason, b.requestId));
    return { ok: true };
  });

  app.post("/api/admin/shop/product", async (req) => {
    const actor = actorOf(req, "ADMIN");
    const b = parseBody(adminProductUpdateRequest, req);
    return withTransaction(db, async (tx) => {
      const before = await tx.shopProduct.findUnique({ where: { sku: b.sku } });
      if (!before) throw new AppError("NOT_FOUND", "Product not found");
      const after = await tx.shopProduct.update({
        where: { sku: b.sku },
        data: {
          ...(b.price !== undefined ? { price: BigInt(b.price) } : {}),
          ...(b.active !== undefined ? { active: b.active } : {}),
          ...(b.name !== undefined ? { name: b.name } : {}),
          ...(b.description !== undefined ? { description: b.description } : {}),
        },
      });
      await writeAudit(tx, { actorType: "ADMIN", adminUserId: actor.adminUserId, action: "SHOP_PRODUCT_UPDATE", targetType: "ShopProduct", targetId: before.id, before: { price: before.price, active: before.active, name: before.name }, after: { price: after.price, active: after.active, name: after.name }, ip: actor.ip });
      return after;
    });
  });

  app.post("/api/admin/roles", async (req) => {
    const actor = actorOf(req, "SUPER_ADMIN");
    const b = parseBody(adminRoleRequest, req);
    return withTransaction(db, async (tx) => {
      const before = await tx.adminUser.findUnique({ where: { userId: b.userId } });
      if (b.userId === (await tx.adminUser.findUniqueOrThrow({ where: { id: actor.adminUserId } })).userId) throw new AppError("FORBIDDEN", "You cannot change your own role");
      const after = b.role
        ? await tx.adminUser.upsert({ where: { userId: b.userId }, update: { role: b.role, active: true }, create: { userId: b.userId, role: b.role, createdById: actor.adminUserId } })
        : before
          ? await tx.adminUser.update({ where: { userId: b.userId }, data: { active: false } })
          : null;
      await writeAudit(tx, { actorType: "ADMIN", adminUserId: actor.adminUserId, userId: b.userId, action: "ADMIN_ROLE_SET", targetType: "AdminUser", targetId: b.userId, before: before ? { role: before.role, active: before.active } : null, after: after ? { role: after.role, active: after.active } : null, ip: actor.ip });
      return after;
    });
  });

  app.post("/api/admin/leaderboards/distribute", async (req) => {
    const actor = actorOf(req, "SUPER_ADMIN");
    const b = parseBody(adminLeaderboardDistributeRequest, req);
    const paid = await withTransaction(db, async (tx) => {
      const n = await distributeLeaderboardRewards(tx, ctx.config, ctx.logger, b.key, units(ctx, b.totalReward));
      await writeAudit(tx, { actorType: "ADMIN", adminUserId: actor.adminUserId, action: "LEADERBOARD_DISTRIBUTE", targetType: "Leaderboard", targetId: b.key, after: { totalReward: b.totalReward, paid: n }, ip: actor.ip });
      return n;
    }, { timeoutMs: 60_000 });
    return { paid };
  });

  app.post("/api/admin/seasons", async (req) => {
    const actor = actorOf(req, "SUPER_ADMIN");
    const b = parseBody(adminSeasonRequest, req);
    return withTransaction(db, async (tx) => {
      const now = new Date();
      await tx.season.updateMany({ where: { status: "ACTIVE" }, data: { status: "ENDED", endsAt: now } });
      const season = await tx.season.create({
        data: { key: b.key, name: b.name, status: "ACTIVE", startsAt: now, endsAt: new Date(now.getTime() + b.days * 86_400_000), rewardPool: units(ctx, b.rewardPool), dailyRewardBudget: units(ctx, b.dailyRewardBudget), multiplierBps: b.multiplierBps },
      });
      await fundRewardPool(tx, season.rewardPool, `season:${season.key}`, actor.adminUserId, `Season ${season.key} reward pool`);
      await writeAudit(tx, { actorType: "ADMIN", adminUserId: actor.adminUserId, action: "SEASON_START", targetType: "Season", targetId: season.id, after: { key: season.key, rewardPool: season.rewardPool }, ip: actor.ip });
      return season;
    });
  });
}
