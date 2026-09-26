// Reward engine. All rewards are computed server-side from gameplay events.
//
//   amount = baseAmount × performance × event × season   (each multiplier clamped to [0, 3])
//
// Crypto rewards are paid from the CRYPTO_REWARD_POOL system account, which cannot go negative,
// and are additionally capped by a global daily budget and a per-user daily cap. The engine can
// therefore never create unlimited tokens, and there is no fixed/guaranteed return on spending.

import type { AppConfig } from "@cryptoarena/config";
import type { Asset, RewardSource, RewardStatus, Tx } from "@cryptoarena/database";
import { LogEvent, metrics, type Logger } from "@cryptoarena/observability";
import { resolveAccount } from "./accounts";
import { evaluateFeature } from "./compliance";
import { postJournal, transfer } from "./ledger";
import { startOfUtcDay } from "./periods";

export const BPS = 10_000;
const MAX_MULTIPLIER_BPS = 30_000;

export interface RewardInput {
  userId: string;
  source: RewardSource;
  asset: Asset;
  baseAmount: bigint;
  /** Basis points; default 10000 (1.0x). */
  performanceBps?: number;
  eventBps?: number;
  /** Overrides the active season multiplier (tests/admin). */
  seasonBps?: number;
  idempotencyKey: string;
  matchId?: string | null;
  reason?: string;
}

export interface RewardResult {
  rewardId: string;
  status: RewardStatus;
  amount: bigint;
  duplicate: boolean;
  reason?: string;
}

function clampBps(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return BPS;
  return Math.max(0, Math.min(MAX_MULTIPLIER_BPS, Math.round(v)));
}

export function applyMultipliers(base: bigint, performanceBps: number, eventBps: number, seasonBps: number): bigint {
  if (base <= 0n) return 0n;
  const denom = BigInt(BPS) ** 3n;
  return (base * BigInt(performanceBps) * BigInt(eventBps) * BigInt(seasonBps)) / denom;
}

export async function getActiveSeason(tx: Tx) {
  const now = new Date();
  return tx.season.findFirst({ where: { status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } } });
}

async function sumCryptoRewards(tx: Tx, since: Date, userId?: string): Promise<bigint> {
  const agg = await tx.reward.aggregate({
    where: { asset: "CRYPTO", status: { in: ["GRANTED", "CAPPED"] }, createdAt: { gte: since }, ...(userId ? { userId } : {}) },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0n;
}

/**
 * Number of paid (GRANTED/CAPPED) rewards a user received today whose idempotency key starts with
 * `keyPrefix`. Used by per-day anti-farming rules (repeat kills, boss rewards). Call it inside the
 * same serialized per-user queue as the grant so the count cannot race.
 */
export async function countRewardsToday(tx: Tx, userId: string, keyPrefix: string): Promise<number> {
  return tx.reward.count({
    where: { userId, idempotencyKey: { startsWith: keyPrefix }, status: { in: ["GRANTED", "CAPPED"] }, createdAt: { gte: startOfUtcDay() } },
  });
}

export async function grantReward(tx: Tx, config: AppConfig, logger: Logger, input: RewardInput): Promise<RewardResult> {
  const existing = await tx.reward.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    return { rewardId: existing.id, status: existing.status, amount: existing.amount, duplicate: true, reason: existing.reason ?? undefined };
  }

  const season = await getActiveSeason(tx);
  const performanceBps = clampBps(input.performanceBps);
  const eventBps = clampBps(input.eventBps);
  const seasonBps = clampBps(input.seasonBps ?? season?.multiplierBps ?? BPS);
  const requested = applyMultipliers(input.baseAmount, performanceBps, eventBps, seasonBps);

  const d: { amount: bigint; status: RewardStatus; reason: string | undefined } = {
    amount: requested,
    status: "GRANTED",
    reason: input.reason,
  };
  const reject = (why: string): void => {
    d.amount = 0n;
    d.status = "REJECTED";
    d.reason = why;
  };

  if (requested <= 0n) reject("zero reward");

  if (d.status !== "REJECTED" && input.asset === "CRYPTO") {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const compliance = await evaluateFeature(tx, config, user, "CRYPTO_REWARDS");
    if (!compliance.allowed) reject(compliance.reason);
    else if (user.isGuest) reject("guest accounts do not earn crypto rewards — connect a wallet");
    else if (!season) reject("no active season");
    else {
      // Lock the pool first: serialises all crypto reward grants so budgets are race-free.
      const pool = await resolveAccount(tx, { system: "CRYPTO_REWARD_POOL" });
      const locked = await tx.$queryRaw<{ balance: bigint }[]>`
        SELECT balance FROM "BalanceAccount" WHERE id = CAST(${pool.id} AS uuid) FOR UPDATE`;
      const poolBalance = BigInt(locked[0]?.balance ?? 0);

      const today = startOfUtcDay();
      const dailyBudget = season.dailyRewardBudget < config.REWARD_POOL ? season.dailyRewardBudget : config.REWARD_POOL;
      const usedToday = await sumCryptoRewards(tx, today);
      const userToday = await sumCryptoRewards(tx, today, input.userId);
      const seasonUsed = await sumCryptoRewards(tx, season.startsAt);

      const limits = [
        poolBalance,
        dailyBudget - usedToday,
        config.USER_DAILY_REWARD_CAP - userToday,
        season.rewardPool - seasonUsed,
      ];
      const cap = limits.reduce((m, v) => (v < m ? v : m), d.amount);
      if (cap <= 0n) reject("reward budget exhausted");
      else if (cap < d.amount) {
        d.amount = cap;
        d.status = "CAPPED";
        d.reason = "capped by reward budget";
      }
    }
  }

  const { amount, status, reason } = d;
  let journalId: string | null = null;
  if (status !== "REJECTED" && amount > 0n) {
    const from = input.asset === "CRYPTO" ? ({ system: "CRYPTO_REWARD_POOL" } as const) : input.asset === "GOLD" ? ({ system: "GOLD_ISSUANCE" } as const) : ({ system: "GEMS_ISSUANCE" } as const);
    const to = input.asset === "CRYPTO" ? ({ userId: input.userId, kind: "CRYPTO_REWARD" } as const) : ({ userId: input.userId, kind: input.asset } as const);
    const posted = await postJournal(tx, {
      type: "GAME_REWARD",
      idempotencyKey: `reward:${input.idempotencyKey}`,
      reference: input.matchId ?? null,
      metadata: { source: input.source, performanceBps, eventBps, seasonBps },
      legs: transfer(from, to, amount),
    });
    journalId = posted.journalId;
  }

  const reward = await tx.reward.create({
    data: {
      userId: input.userId,
      source: input.source,
      asset: input.asset,
      baseAmount: input.baseAmount,
      performanceBps,
      eventBps,
      seasonBps,
      amount,
      status,
      reason: reason ?? null,
      seasonId: season?.id ?? null,
      matchId: input.matchId ?? null,
      idempotencyKey: input.idempotencyKey,
      journalId,
    },
  });

  if (status === "REJECTED") {
    logger.debug({ event: LogEvent.REWARD_REJECTED, userId: input.userId, source: input.source, reason }, "reward rejected");
  } else {
    metrics.rewardsGranted.inc({ source: input.source, asset: input.asset });
    logger.info(
      { event: LogEvent.REWARD_GRANTED, userId: input.userId, source: input.source, asset: input.asset, amount: amount.toString(), status },
      "reward granted",
    );
  }
  return { rewardId: reward.id, status, amount, duplicate: false, reason };
}

/** Moves treasury-held tokens into the reward pool (admin / season bootstrap). */
export async function fundRewardPool(tx: Tx, amount: bigint, idempotencyKey: string, adminUserId: string | null, note: string): Promise<void> {
  await postJournal(tx, {
    type: "POOL_FUNDING",
    idempotencyKey: `pool_funding:${idempotencyKey}`,
    adminUserId,
    description: note,
    legs: transfer({ system: "CRYPTO_EXTERNAL" }, { system: "CRYPTO_REWARD_POOL" }, amount),
  });
}
