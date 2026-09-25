// Background jobs (run in the API process, guarded by a Postgres advisory lock so only one
// instance executes them): deposit settlement/expiry and leaderboard reward distribution.

import { withTransaction } from "@cryptoarena/database";
import { dayKey, distributeLeaderboardRewards, processPendingDeposits, weekKey } from "@cryptoarena/economy";
import type { ApiContext } from "./context";

const LOCK_KEY = 872_341_001;

/** Performance-based leaderboard pools (token units). Paid from the capped reward pool. */
const DAILY_LEADERBOARD_REWARD_TOKENS = 20n;
const WEEKLY_LEADERBOARD_REWARD_TOKENS = 100n;

export async function runJobsOnce(ctx: ApiContext): Promise<void> {
  const [lock] = await ctx.prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`;
  if (!lock?.locked) return;
  try {
    if (ctx.config.REWARD_TOKEN_MINT || ctx.config.SOLANA_MOCK) {
      const r = await processPendingDeposits(ctx, ctx.gateway);
      if (r.settled || r.expired) ctx.logger.info(r, "deposit job");
    }

    const unit = 10n ** BigInt(ctx.config.REWARD_TOKEN_DECIMALS);
    const yesterday = dayKey(new Date(Date.now() - 86_400_000));
    const lastWeek = weekKey(new Date(Date.now() - 7 * 86_400_000));
    for (const [key, amount] of [
      [`DAILY:${yesterday}`, DAILY_LEADERBOARD_REWARD_TOKENS * unit],
      [`WEEKLY:${lastWeek}`, WEEKLY_LEADERBOARD_REWARD_TOKENS * unit],
    ] as const) {
      const board = await ctx.prisma.leaderboard.findUnique({ where: { key } });
      if (!board || board.rewardsDistributedAt || (board.endsAt && board.endsAt > new Date())) continue;
      const paid = await withTransaction(ctx.prisma, (tx) => distributeLeaderboardRewards(tx, ctx.config, ctx.logger, key, amount), { timeoutMs: 60_000 });
      ctx.logger.info({ key, paid }, "leaderboard rewards distributed");
    }
  } catch (err) {
    ctx.logger.error({ err }, "background job failed");
  } finally {
    await ctx.prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
  }
}

export function startJobs(ctx: ApiContext, intervalMs = 30_000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runJobsOnce(ctx).finally(() => {
      running = false;
    });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
