import { verifyWalletSignature } from "@cryptoarena/blockchain";
import { withTransaction } from "@cryptoarena/database";
import {
  AppError,
  cancelWithdrawal,
  depositToDto,
  prepareDeposit,
  requestWithdrawal,
  simulateMockDepositTransfer,
  verifyDeposit,
  withdrawalLimits,
  withdrawalToDto,
  writeAudit,
} from "@cryptoarena/economy";
import { LogEvent } from "@cryptoarena/observability";
import { parseUnits, type LedgerEntryDto, type WalletInfoDto } from "@cryptoarena/shared";
import {
  depositMockSendRequest,
  depositPrepareRequest,
  depositVerifyRequest,
  walletConnectRequest,
  withdrawCancelRequest,
  withdrawRequest,
} from "@cryptoarena/validation";
import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth";
import type { ApiContext } from "../context";
import { parseBody } from "../http";
import { buildBalances, buildMe } from "../me";
import { consumeNonce } from "./auth";

function toUnits(ctx: ApiContext, amount: string): bigint {
  try {
    return parseUnits(amount, ctx.config.REWARD_TOKEN_DECIMALS);
  } catch (err) {
    throw new AppError("BAD_REQUEST", (err as Error).message);
  }
}

export async function registerUserRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  app.get("/api/me", async (req) => buildMe(ctx, requireUser(req).id));

  app.get("/api/profile", async (req) => {
    const user = requireUser(req);
    const [me, characters, matches, totals] = await Promise.all([
      buildMe(ctx, user.id),
      ctx.prisma.userCharacter.findMany({ where: { userId: user.id }, include: { character: true }, orderBy: { level: "desc" } }),
      ctx.prisma.gameMatchPlayer.findMany({ where: { userId: user.id }, orderBy: { joinedAt: "desc" }, take: 10, include: { match: true } }),
      ctx.prisma.gameMatchPlayer.aggregate({ where: { userId: user.id }, _sum: { kills: true, deaths: true, npcKills: true, xpEarned: true }, _count: true }),
    ]);
    return {
      ...me,
      characters: characters.map((c) => ({ key: c.character.key, name: c.character.name, level: c.level, xp: c.xp })),
      stats: {
        matches: totals._count,
        kills: totals._sum.kills ?? 0,
        deaths: totals._sum.deaths ?? 0,
        npcKills: totals._sum.npcKills ?? 0,
        xpEarned: totals._sum.xpEarned ?? 0,
      },
      recentMatches: matches.map((m) => ({ id: m.matchId, mode: m.match.mode, kills: m.kills, deaths: m.deaths, score: m.score, placement: m.placement, joinedAt: m.joinedAt.toISOString() })),
    };
  });

  // Link an additional wallet to the signed-in account (signature required; public key alone is never trusted).
  app.post("/api/wallet/connect", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(walletConnectRequest, req);
    // The nonce is burned in its own transaction so a failed signature check cannot be retried with it.
    const message = await withTransaction(ctx.prisma, (tx) => consumeNonce(tx, body.address, body.nonce, "LINK_WALLET", user.id));
    if (!(await verifyWalletSignature(body.address, message, body.signature))) throw new AppError("INVALID_SIGNATURE", "Wallet signature is invalid");
    await withTransaction(ctx.prisma, async (tx) => {
      const existing = await tx.wallet.findUnique({ where: { address: body.address } });
      if (existing && existing.userId !== user.id) throw new AppError("CONFLICT", "This wallet is linked to another account");
      if (!existing) {
        const count = await tx.wallet.count({ where: { userId: user.id } });
        const w = await tx.wallet.create({ data: { userId: user.id, address: body.address, verifiedAt: new Date(), isPrimary: count === 0 } });
        await tx.user.update({ where: { id: user.id }, data: { isGuest: false } });
        await writeAudit(tx, { actorType: "USER", userId: user.id, action: "WALLET_LINK", targetType: "Wallet", targetId: w.id, ip: req.ip });
      }
    });
    ctx.logger.info({ event: LogEvent.WALLET_CONNECTED, userId: user.id, address: body.address }, "wallet connected");
    return buildMe(ctx, user.id);
  });

  app.get("/api/wallet", async (req): Promise<WalletInfoDto> => {
    const user = requireUser(req);
    const [wallets, deposits, withdrawals, limits] = await Promise.all([
      ctx.prisma.wallet.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
      ctx.prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      ctx.prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      withdrawalLimits(ctx.prisma, ctx, user.id),
    ]);
    const c = ctx.config;
    return {
      network: c.SOLANA_NETWORK,
      mint: c.REWARD_TOKEN_MINT || null,
      symbol: c.REWARD_TOKEN_SYMBOL,
      decimals: c.REWARD_TOKEN_DECIMALS,
      treasury: c.TREASURY_PUBLIC_KEY || null,
      wallets: wallets.map((w) => ({ address: w.address, isPrimary: w.isPrimary, verifiedAt: w.verifiedAt.toISOString() })),
      balances: await buildBalances(ctx, user.id),
      limits: {
        minWithdrawal: c.MIN_WITHDRAWAL.toString(),
        maxWithdrawal: c.MAX_WITHDRAWAL.toString(),
        dailyLimit: c.DAILY_WITHDRAWAL_LIMIT.toString(),
        withdrawnToday: limits.withdrawnToday.toString(),
        fee: c.WITHDRAWAL_FEE.toString(),
        cooldownSeconds: c.WITHDRAWAL_COOLDOWN_SECONDS,
        nextWithdrawalAt: limits.nextWithdrawalAt?.toISOString() ?? null,
        minAccountAgeHours: c.WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS,
      },
      deposits: deposits.map((d) => depositToDto(d, c.SOLANA_NETWORK)),
      withdrawals: withdrawals.map((w) => withdrawalToDto(w, c.SOLANA_NETWORK)),
    };
  });

  app.get("/api/wallet/ledger", async (req): Promise<LedgerEntryDto[]> => {
    const user = requireUser(req);
    const rows = await ctx.prisma.balanceLedger.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { account: { select: { kind: true } } } });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      asset: r.asset,
      direction: r.direction,
      amount: r.amount.toString(),
      balanceAfter: r.balanceAfter.toString(),
      reference: r.reference,
      account: r.account.kind,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  app.post("/api/wallet/deposit/prepare", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(depositPrepareRequest, req);
    const res = await prepareDeposit(ctx, ctx.gateway, user.id, toUnits(ctx, body.amount));
    return {
      depositId: res.deposit.id,
      transaction: res.transaction,
      reference: res.deposit.reference,
      amount: res.deposit.amount.toString(),
      wallet: res.wallet,
      expiresAt: res.deposit.expiresAt.toISOString(),
      network: ctx.config.SOLANA_NETWORK,
      mock: res.mock,
    };
  });

  /** DEV ONLY (SOLANA_MOCK): simulate the wallet broadcasting the deposit so the flow can be tested offline. */
  app.post("/api/wallet/deposit/mock-send", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(depositMockSendRequest, req);
    return { signature: await simulateMockDepositTransfer(ctx, ctx.gateway, user.id, body.depositId) };
  });

  app.post("/api/wallet/deposit/verify", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = requireUser(req);
    const body = parseBody(depositVerifyRequest, req);
    const res = await verifyDeposit(ctx, ctx.gateway, user.id, body.depositId, body.signature);
    if (res.status === "SUBMITTED") reply.status(202);
    return { status: res.status, reason: res.reason ?? null, deposit: depositToDto(res.deposit, ctx.config.SOLANA_NETWORK) };
  });

  app.post("/api/wallet/withdraw", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(withdrawRequest, req);
    const { withdrawal, duplicate } = await requestWithdrawal(ctx, { userId: user.id, amount: toUnits(ctx, body.amount), walletAddress: body.walletAddress, idempotencyKey: body.idempotencyKey });
    return { duplicate, withdrawal: withdrawalToDto(withdrawal, ctx.config.SOLANA_NETWORK) };
  });

  app.post("/api/wallet/withdraw/cancel", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const body = parseBody(withdrawCancelRequest, req);
    const w = await cancelWithdrawal(ctx, body.withdrawalId, { userId: user.id });
    return { withdrawal: withdrawalToDto(w, ctx.config.SOLANA_NETWORK) };
  });
}

