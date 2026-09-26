// Background jobs (run in the API process, guarded by a Postgres advisory lock so only one
// instance executes them): deposit settlement/expiry and leaderboard reward distribution.

import { withTransaction } from "@cryptoarena/database";
import pg from "pg";
import { dayKey, distributeLeaderboardRewards, processPendingDeposits, weekKey } from "@cryptoarena/economy";
import type { ApiContext } from "./context";

const LOCK_KEY = 872_341_001;

/** Performance-based leaderboard pools (token units). Paid from the capped reward pool. */
const DAILY_LEADERBOARD_REWARD_TOKENS = 20n;
const WEEKLY_LEADERBOARD_REWARD_TOKENS = 100n;

// Session-level advisory locks belong to one connection, so the leader lock uses a dedicated
// client instead of the Prisma pool (where lock and unlock could run on different connections).
let lockClient: pg.Client | null = null;

async function leaderClient(ctx: ApiContext): Promise<pg.Client> {
  if (!lockClient) {
    const client = new pg.Client({ connectionString: ctx.config.DATABASE_URL });
    client.on("error", (err) => {
      ctx.logger.warn({ err: err.message }, "job lock connection lost");
      lockClient = null;
    });
    await client.connect();
    lockClient = client;
  }
  return lockClient;
}

export async function closeJobLock(): Promise<void> {
  const c = lockClient;
  lockClient = null;
  await c?.end().catch(() => undefined);
}

export async function runJobsOnce(ctx: ApiContext): Promise<void> {
  const client = await leaderClient(ctx);
  const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
  if (!rows[0]?.locked) return;
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
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
  }
}

export function startJobs(ctx: ApiContext, intervalMs = 30_000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runJobsOnce(ctx)
      .catch((err: unknown) => ctx.logger.error({ err }, "job runner failed"))
      .finally(() => {
      running = false;
    });
  }, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
    void closeJobLock();
  };
}
