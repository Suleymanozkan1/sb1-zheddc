// Withdrawal lifecycle.
//
//  request  → funds moved user CRYPTO_REWARD → WITHDRAWAL_CLEARING (hold), status PENDING
//  worker   → claims row (SKIP LOCKED), signs with the treasury signer, PERSISTS the signature
//             before broadcasting, then polls. A signature is only abandoned once its blockhash
//             has expired without landing, so a withdrawal can never be paid twice.
//  complete → CLEARING → CRYPTO_EXTERNAL (amount) and CLEARING → FEES (fee), status COMPLETED
//  fail/cancel → CLEARING → user (compensating REFUND journal)

import { explorerTxUrl } from "@cryptoarena/config";
import type { WithdrawalDto } from "@cryptoarena/shared";
import { withTransaction, type Tx, type Withdrawal } from "@cryptoarena/database";
import { LogEvent, metrics } from "@cryptoarena/observability";
import { getUserBalances } from "./accounts";
import { writeAudit } from "./audit";
import { requireFeature } from "./compliance";
import type { EconomyContext } from "./context";
import { AppError } from "./errors";
import { postJournal, transfer } from "./ledger";

export function withdrawalToDto(w: Withdrawal, network: string): WithdrawalDto {
  return {
    id: w.id,
    amount: w.amount.toString(),
    fee: w.fee.toString(),
    walletAddress: w.walletAddress,
    status: w.status,
    requiresReview: w.requiresReview,
    signature: w.status === "COMPLETED" || w.status === "PROCESSING" ? w.signature : null,
    lastError: w.status === "FAILED" ? w.lastError : null,
    createdAt: w.createdAt.toISOString(),
    completedAt: w.completedAt?.toISOString() ?? null,
    explorerUrl: w.signature && w.status === "COMPLETED" && !w.signature.startsWith("mock") ? explorerTxUrl(w.signature, network) : null,
  };
}

export interface WithdrawalLimitsView {
  withdrawnToday: bigint;
  nextWithdrawalAt: Date | null;
}

const COUNTED_STATUSES = ["PENDING", "PROCESSING", "COMPLETED"] as const;

export async function withdrawalLimits(tx: Tx, ctx: EconomyContext, userId: string): Promise<WithdrawalLimitsView> {
  const since = new Date(Date.now() - 86_400_000);
  const agg = await tx.withdrawal.aggregate({
    where: { userId, status: { in: [...COUNTED_STATUSES] }, createdAt: { gte: since } },
    _sum: { amount: true },
  });
  const last = await tx.withdrawal.findFirst({
    where: { userId, status: { in: [...COUNTED_STATUSES] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const next = last ? new Date(last.createdAt.getTime() + ctx.config.WITHDRAWAL_COOLDOWN_SECONDS * 1000) : null;
  return { withdrawnToday: agg._sum.amount ?? 0n, nextWithdrawalAt: next && next > new Date() ? next : null };
}

export interface WithdrawalRequest {
  userId: string;
  amount: bigint;
  walletAddress: string;
  idempotencyKey: string;
}

export async function requestWithdrawal(ctx: EconomyContext, req: WithdrawalRequest): Promise<{ withdrawal: Withdrawal; duplicate: boolean }> {
  const { config } = ctx;
  const idem = `withdrawal:${req.userId}:${req.idempotencyKey}`;
  if (!config.REWARD_TOKEN_MINT) throw new AppError("NOT_CONFIGURED", "Withdrawals are not configured (REWARD_TOKEN_MINT)");

  return withTransaction(ctx.prisma, async (tx) => {
    // Serialise all withdrawal requests of this user so cooldown / daily-limit / idempotency checks are race-free.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`withdrawal:${req.userId}`}))`;
    const prior = await tx.withdrawal.findUnique({ where: { idempotencyKey: idem } });
    if (prior) return { withdrawal: prior, duplicate: true };

    const user = await tx.user.findUniqueOrThrow({ where: { id: req.userId }, include: { wallets: true } });
    await requireFeature(tx, config, user, "WITHDRAWAL");
    if (user.isGuest) throw new AppError("FORBIDDEN", "Guest accounts cannot withdraw");
    if (user.withdrawalsSuspended) throw new AppError("ACCOUNT_RESTRICTED", "Withdrawals are suspended for this account — contact support");
    if (!user.wallets.some((w) => w.address === req.walletAddress)) {
      throw new AppError("FORBIDDEN", "Withdrawals can only be sent to a wallet you have verified on this account");
    }
    const ageHours = (Date.now() - user.createdAt.getTime()) / 3_600_000;
    if (ageHours < config.WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS) {
      throw new AppError("FORBIDDEN", `Account must be at least ${config.WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS}h old to withdraw`);
    }
    if (req.amount < config.MIN_WITHDRAWAL) throw new AppError("LIMIT_EXCEEDED", `Minimum withdrawal is ${config.MIN_WITHDRAWAL}`);
    if (req.amount > config.MAX_WITHDRAWAL) throw new AppError("LIMIT_EXCEEDED", `Maximum withdrawal is ${config.MAX_WITHDRAWAL}`);

    const limits = await withdrawalLimits(tx, ctx, req.userId);
    if (limits.nextWithdrawalAt) throw new AppError("COOLDOWN", `Next withdrawal available at ${limits.nextWithdrawalAt.toISOString()}`);
    if (limits.withdrawnToday + req.amount > config.DAILY_WITHDRAWAL_LIMIT) throw new AppError("LIMIT_EXCEEDED", "Daily withdrawal limit reached");

    const fee = config.WITHDRAWAL_FEE;
    const balances = await getUserBalances(tx, req.userId);
    if (balances.cryptoReward < req.amount + fee) throw new AppError("INSUFFICIENT_FUNDS", "Insufficient withdrawable reward balance");

    const recentFlags = await tx.antiCheatFlag.aggregate({
      where: { userId: req.userId, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      _sum: { severity: true },
    });
    const suspicious = (recentFlags._sum.severity ?? 0) >= 10;
    const requiresReview = req.amount >= config.WITHDRAWAL_REVIEW_THRESHOLD || user.riskScore >= config.WITHDRAWAL_RISK_SCORE_REVIEW || suspicious;

    const hold = await postJournal(tx, {
      type: "WITHDRAWAL",
      idempotencyKey: `${idem}:hold`,
      reference: req.walletAddress,
      metadata: { amount: req.amount.toString(), fee: fee.toString() },
      legs: transfer({ userId: req.userId, kind: "CRYPTO_REWARD" }, { system: "CRYPTO_WITHDRAWAL_CLEARING" }, req.amount + fee),
    });

    const withdrawal = await tx.withdrawal.create({
      data: {
        userId: req.userId,
        walletAddress: req.walletAddress,
        network: config.SOLANA_NETWORK,
        mint: config.REWARD_TOKEN_MINT,
        amount: req.amount,
        fee,
        requiresReview,
        reviewNote: suspicious ? "anti-cheat flags in the last 7 days" : null,
        idempotencyKey: idem,
        holdJournalId: hold.journalId,
      },
    });
    ctx.logger.info(
      { event: LogEvent.WITHDRAWAL_CREATED, userId: req.userId, withdrawalId: withdrawal.id, amount: req.amount.toString(), requiresReview },
      "withdrawal created",
    );
    return { withdrawal, duplicate: false };
  });
}

async function refundHold(tx: Tx, w: Withdrawal, type: "REFUND", reason: string, adminUserId: string | null): Promise<string> {
  const posted = await postJournal(tx, {
    type,
    idempotencyKey: `withdrawal_refund:${w.id}`,
    reference: w.id,
    adminUserId,
    description: reason,
    legs: transfer({ system: "CRYPTO_WITHDRAWAL_CLEARING" }, { userId: w.userId, kind: "CRYPTO_REWARD" }, w.amount + w.fee),
  });
  return posted.journalId;
}

/** Cancels a PENDING withdrawal (by its owner or an admin). PROCESSING withdrawals cannot be cancelled. */
export async function cancelWithdrawal(
  ctx: EconomyContext,
  withdrawalId: string,
  actor: { userId: string } | { adminUserId: string; reason: string; ip: string | null },
): Promise<Withdrawal> {
  return withTransaction(ctx.prisma, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Withdrawal" WHERE id = CAST(${withdrawalId} AS uuid) FOR UPDATE`;
    if (!row) throw new AppError("NOT_FOUND", "Withdrawal not found");
    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    if ("userId" in actor && w.userId !== actor.userId) throw new AppError("NOT_FOUND", "Withdrawal not found");
    if (w.status !== "PENDING" || w.signature) throw new AppError("CONFLICT", `Withdrawal is ${w.status.toLowerCase()} and can no longer be cancelled`);
    const adminUserId = "adminUserId" in actor ? actor.adminUserId : null;
    const refund = await refundHold(tx, w, "REFUND", "cancelled", adminUserId);
    const updated = await tx.withdrawal.update({
      where: { id: w.id },
      data: { status: "CANCELLED", settleJournalId: refund, lastError: "cancelled" },
    });
    if (adminUserId && "reason" in actor) {
      await writeAudit(tx, { actorType: "ADMIN", adminUserId, userId: w.userId, action: "WITHDRAWAL_CANCEL", targetType: "Withdrawal", targetId: w.id, before: { status: w.status }, after: { status: "CANCELLED" }, reason: actor.reason, ip: actor.ip });
    }
    ctx.logger.info({ event: LogEvent.WITHDRAWAL_CANCELLED, withdrawalId: w.id }, "withdrawal cancelled");
    return updated;
  });
}

export async function approveWithdrawal(ctx: EconomyContext, withdrawalId: string, adminUserId: string, note: string, ip: string | null): Promise<Withdrawal> {
  return withTransaction(ctx.prisma, async (tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w) throw new AppError("NOT_FOUND", "Withdrawal not found");
    if (w.status !== "PENDING" || !w.requiresReview) throw new AppError("CONFLICT", "Withdrawal is not awaiting review");
    // Conditional update: a concurrent cancel/claim cannot be overwritten.
    const res = await tx.withdrawal.updateMany({
      where: { id: w.id, status: "PENDING", requiresReview: true },
      data: { requiresReview: false, reviewedByAdminId: adminUserId, reviewedAt: new Date(), reviewNote: note },
    });
    if (res.count !== 1) throw new AppError("CONFLICT", "Withdrawal is not awaiting review");
    const updated = await tx.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    await writeAudit(tx, { actorType: "ADMIN", adminUserId, userId: w.userId, action: "WITHDRAWAL_APPROVE", targetType: "Withdrawal", targetId: w.id, before: { requiresReview: true }, after: { requiresReview: false }, reason: note, ip });
    return updated;
  });
}

// ───────────────────────── Worker side (blockchain-service) ─────────────────────────
//
// Every worker-side write is fenced by `lockToken`, which is rotated on each claim. A worker
// whose claim was taken over (e.g. after a stale-lock recovery) can no longer record a signature,
// reschedule, complete or fail the withdrawal: its writes match zero rows and it stops.

export class LostOwnershipError extends Error {
  constructor(id: string) {
    super(`Worker lost ownership of withdrawal ${id}`);
    this.name = "LostOwnershipError";
  }
}

/** A withdrawal row claimed by a worker, together with the fencing token of that claim. */
export type ClaimedWithdrawal = Withdrawal & { lockToken: string };

/**
 * Claims the next due withdrawal (or a specific one) and rotates its fencing token.
 * Uses SKIP LOCKED so concurrent workers never pick the same row at the same time.
 */
export async function claimNextWithdrawal(ctx: EconomyContext, staleLockMs = 120_000, onlyId?: string): Promise<ClaimedWithdrawal | null> {
  const staleBefore = new Date(Date.now() - staleLockMs);
  const rows = await ctx.prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Withdrawal" SET status = 'PROCESSING', "lockedAt" = now(), "lockToken" = gen_random_uuid(), "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Withdrawal"
      WHERE "nextAttemptAt" <= now()
        AND (${onlyId ?? null}::uuid IS NULL OR id = ${onlyId ?? null}::uuid)
        AND (
          (status = 'PENDING' AND "requiresReview" = false)
          OR (status = 'PROCESSING' AND ("lockedAt" IS NULL OR "lockedAt" < ${staleBefore}))
        )
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`;
  const id = rows[0]?.id;
  if (!id) return null;
  const w = await ctx.prisma.withdrawal.findUnique({ where: { id } });
  return w && w.lockToken ? { ...w, lockToken: w.lockToken } : null;
}

/** Locks the row and verifies the caller still owns it. Returns the fresh row. */
async function lockOwned(tx: Tx, id: string, lockToken: string): Promise<Withdrawal> {
  await tx.$queryRaw`SELECT id FROM "Withdrawal" WHERE id = CAST(${id} AS uuid) FOR UPDATE`;
  const current = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
  if (current.status !== "PROCESSING" || current.lockToken !== lockToken) throw new LostOwnershipError(id);
  return current;
}

/**
 * Stores the signed transaction's signature BEFORE it is broadcast. `previousSignature` is the
 * signature the worker evaluated as dead (or null); any other stored value means someone else
 * already moved on, so the write is refused.
 */
export async function recordWithdrawalSignature(
  ctx: EconomyContext,
  w: ClaimedWithdrawal,
  previousSignature: string | null,
  signature: string,
  lastValidBlockHeight: bigint,
): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    const current = await lockOwned(tx, w.id, w.lockToken);
    if (current.signature !== previousSignature) throw new LostOwnershipError(w.id);
    if (current.signature) {
      // Keep history of abandoned (expired/failed) attempts.
      await tx.walletTransaction.upsert({
        where: { signature: current.signature },
        update: { status: "FAILED" },
        create: { userId: current.userId, signature: current.signature, kind: "WITHDRAWAL", network: current.network, mint: current.mint, amount: current.amount, status: "FAILED" },
      });
    }
    await tx.withdrawal.update({ where: { id: w.id }, data: { signature, lastValidBlockHeight, attempts: { increment: 1 } } });
    await tx.walletTransaction.upsert({
      where: { signature },
      update: {},
      create: { userId: current.userId, signature, kind: "WITHDRAWAL", network: current.network, mint: current.mint, amount: current.amount, status: "SUBMITTED" },
    });
  });
}

/** Releases the worker lock (only if still owned) and schedules the next check. */
export async function rescheduleWithdrawal(ctx: EconomyContext, w: ClaimedWithdrawal, delayMs: number, lastError: string | null): Promise<void> {
  const res = await ctx.prisma.withdrawal.updateMany({
    where: { id: w.id, status: "PROCESSING", lockToken: w.lockToken },
    data: { lockedAt: null, lockToken: null, nextAttemptAt: new Date(Date.now() + delayMs), ...(lastError !== null ? { lastError } : {}) },
  });
  if (res.count !== 1) throw new LostOwnershipError(w.id);
}

/** Settles a withdrawal whose recorded transaction is finalized. Only the owning worker may do this. */
export async function completeWithdrawal(ctx: EconomyContext, w: ClaimedWithdrawal, signature: string, slot: bigint | null): Promise<Withdrawal> {
  const id = w.id;
  const done = await withTransaction(ctx.prisma, async (tx) => {
    const current = await lockOwned(tx, id, w.lockToken);
    if (current.signature !== signature) throw new AppError("CONFLICT", "Signature does not match the recorded withdrawal transaction");
    const settle = await postJournal(tx, {
      type: "WITHDRAWAL",
      idempotencyKey: `withdrawal_settle:${id}`,
      reference: signature,
      legs: transfer({ system: "CRYPTO_WITHDRAWAL_CLEARING" }, { system: "CRYPTO_EXTERNAL" }, current.amount),
    });
    if (current.fee > 0n) {
      await postJournal(tx, {
        type: "WITHDRAWAL_FEE",
        idempotencyKey: `withdrawal_fee:${id}`,
        reference: signature,
        legs: transfer({ system: "CRYPTO_WITHDRAWAL_CLEARING" }, { system: "CRYPTO_FEES" }, current.fee),
      });
    }
    await tx.walletTransaction.upsert({
      where: { signature },
      update: { status: "FINALIZED", slot },
      create: { userId: current.userId, signature, kind: "WITHDRAWAL", network: current.network, mint: current.mint, amount: current.amount, slot, status: "FINALIZED" },
    });
    return tx.withdrawal.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date(), settleJournalId: settle.journalId, lockedAt: null, lockToken: null, lastError: null },
    });
  });
  ctx.logger.info({ event: LogEvent.WITHDRAWAL_COMPLETED, withdrawalId: id, userId: done.userId, signature, amount: done.amount.toString() }, "withdrawal completed");
  return done;
}

/** Terminal failure: only when no recorded signature can still land, and only by the owning worker. Refunds the hold. */
export async function failWithdrawal(ctx: EconomyContext, w: ClaimedWithdrawal, reason: string): Promise<Withdrawal> {
  const done = await withTransaction(ctx.prisma, async (tx) => {
    const current = await lockOwned(tx, w.id, w.lockToken);
    const refund = await refundHold(tx, current, "REFUND", reason, null);
    return tx.withdrawal.update({ where: { id: w.id }, data: { status: "FAILED", lastError: reason, settleJournalId: refund, lockedAt: null, lockToken: null } });
  });
  ctx.logger.error({ event: LogEvent.WITHDRAWAL_FAILED, withdrawalId: w.id, reason }, "withdrawal failed and refunded");
  return done;
}

export async function updateWithdrawalQueueMetrics(ctx: EconomyContext): Promise<void> {
  const groups = await ctx.prisma.withdrawal.groupBy({ by: ["status"], where: { status: { in: ["PENDING", "PROCESSING"] } }, _count: true });
  metrics.withdrawalQueue.set({ status: "PENDING" }, groups.find((g) => g.status === "PENDING")?._count ?? 0);
  metrics.withdrawalQueue.set({ status: "PROCESSING" }, groups.find((g) => g.status === "PROCESSING")?._count ?? 0);
}
