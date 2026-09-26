import type { AppConfig } from "@cryptoarena/config";
import type { LeaderboardDto, LeaderboardScope } from "@cryptoarena/shared";
import type { Tx } from "@cryptoarena/database";
import type { Logger } from "@cryptoarena/observability";
import { AppError } from "./errors";
import { dayKey, startOfIsoWeek, startOfUtcDay, weekKey } from "./periods";
import { getActiveSeason, grantReward } from "./rewards";

export interface MatchStatsDelta {
  kills: number;
  npcKills: number;
  xp: number;
  wins: number;
}

/** Arena score formula. Computed only on the server from server-observed events. */
export function arenaScore(d: MatchStatsDelta): number {
  return d.kills * 10 + d.npcKills * 2 + d.wins * 50 + Math.floor(d.xp / 10);
}

async function boardFor(tx: Tx, scope: LeaderboardScope, now = new Date()) {
  let key: string;
  let periodKey: string;
  let seasonId: string | null = null;
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  switch (scope) {
    case "GLOBAL":
      key = "GLOBAL";
      periodKey = "all";
      break;
    case "DAILY":
      periodKey = dayKey(now);
      key = `DAILY:${periodKey}`;
      startsAt = startOfUtcDay(now);
      endsAt = new Date(startsAt.getTime() + 86_400_000);
      break;
    case "WEEKLY":
      periodKey = weekKey(now);
      key = `WEEKLY:${periodKey}`;
      startsAt = startOfIsoWeek(now);
      endsAt = new Date(startsAt.getTime() + 7 * 86_400_000);
      break;
    case "SEASON": {
      const season = await getActiveSeason(tx);
      if (!season) return null;
      periodKey = season.key;
      key = `SEASON:${season.key}`;
      seasonId = season.id;
      startsAt = season.startsAt;
      endsAt = season.endsAt;
      break;
    }
  }
  return tx.leaderboard.upsert({
    where: { key },
    update: {},
    create: { key, scope, periodKey, seasonId, startsAt, endsAt },
  });
}

export async function recordLeaderboardStats(tx: Tx, userId: string, d: MatchStatsDelta): Promise<void> {
  const clean: MatchStatsDelta = {
    kills: Math.max(0, Math.floor(d.kills)),
    npcKills: Math.max(0, Math.floor(d.npcKills)),
    xp: Math.max(0, Math.floor(d.xp)),
    wins: Math.max(0, Math.floor(d.wins)),
  };
  const score = arenaScore(clean);
  if (score === 0 && clean.kills === 0 && clean.xp === 0) return;
  for (const scope of ["GLOBAL", "DAILY", "WEEKLY", "SEASON"] as const) {
    const board = await boardFor(tx, scope);
    if (!board || board.finalizedAt) continue;
    await tx.leaderboardEntry.upsert({
      where: { leaderboardId_userId: { leaderboardId: board.id, userId } },
      update: {
        kills: { increment: clean.kills },
        npcKills: { increment: clean.npcKills },
        xp: { increment: clean.xp },
        wins: { increment: clean.wins },
        arenaScore: { increment: score },
        score: { increment: score },
      },
      create: { leaderboardId: board.id, userId, kills: clean.kills, npcKills: clean.npcKills, xp: clean.xp, wins: clean.wins, arenaScore: score, score },
    });
  }
}

export async function getLeaderboard(tx: Tx, scope: LeaderboardScope, userId: string | null, limit = 50): Promise<LeaderboardDto> {
  const board = await boardFor(tx, scope);
  if (!board) return { scope, periodKey: "none", rows: [], me: null };
  const entries = await tx.leaderboardEntry.findMany({
    where: { leaderboardId: board.id },
    orderBy: [{ score: "desc" }, { updatedAt: "asc" }],
    take: Math.min(100, Math.max(1, limit)),
    include: { user: { select: { username: true } } },
  });
  const rows = entries.map((e, i) => ({
    rank: i + 1,
    userId: e.userId,
    username: e.user.username,
    kills: e.kills,
    xp: e.xp,
    wins: e.wins,
    arenaScore: e.arenaScore,
    score: e.score,
  }));
  let me = rows.find((r) => r.userId === userId) ?? null;
  if (!me && userId) {
    const mine = await tx.leaderboardEntry.findUnique({ where: { leaderboardId_userId: { leaderboardId: board.id, userId } }, include: { user: true } });
    if (mine) {
      const ahead = await tx.leaderboardEntry.count({ where: { leaderboardId: board.id, score: { gt: mine.score } } });
      me = { rank: ahead + 1, userId, username: mine.user.username, kills: mine.kills, xp: mine.xp, wins: mine.wins, arenaScore: mine.arenaScore, score: mine.score };
    }
  }
  return { scope, periodKey: board.periodKey, rows, me };
}

/** Share of the leaderboard reward (basis points) for ranks 1..10. */
export const LEADERBOARD_SHARES_BPS = [2500, 1500, 1000, 800, 700, 600, 500, 400, 300, 200] as const;

/**
 * Finalises an ended board and distributes performance-based crypto rewards to the top 10.
 * Rewards go through the budget-capped reward engine and are idempotent per (board, user).
 */
export async function distributeLeaderboardRewards(
  tx: Tx,
  config: AppConfig,
  logger: Logger,
  boardKey: string,
  totalReward: bigint,
): Promise<number> {
  const board = await tx.leaderboard.findUnique({ where: { key: boardKey } });
  if (!board) throw new AppError("NOT_FOUND", "Leaderboard not found");
  if (board.rewardsDistributedAt) return 0;
  if (board.endsAt && board.endsAt > new Date()) throw new AppError("CONFLICT", "Leaderboard period has not ended");

  await tx.leaderboard.update({ where: { id: board.id }, data: { finalizedAt: board.finalizedAt ?? new Date() } });
  const top = await tx.leaderboardEntry.findMany({
    where: { leaderboardId: board.id, score: { gt: 0 } },
    orderBy: [{ score: "desc" }, { updatedAt: "asc" }],
    take: LEADERBOARD_SHARES_BPS.length,
  });
  let paid = 0;
  for (const [i, entry] of top.entries()) {
    const share = LEADERBOARD_SHARES_BPS[i]!;
    const base = (totalReward * BigInt(share)) / 10_000n;
    if (base <= 0n) continue;
    const claim = await tx.rewardClaim.findUnique({ where: { userId_kind_referenceKey: { userId: entry.userId, kind: "LEADERBOARD", referenceKey: board.key } } });
    if (claim) continue;
    const r = await grantReward(tx, config, logger, {
      userId: entry.userId,
      source: "LEADERBOARD",
      asset: "CRYPTO",
      baseAmount: base,
      idempotencyKey: `leaderboard:${board.key}:${entry.userId}`,
      reason: `rank ${i + 1} on ${board.key}`,
    });
    await tx.rewardClaim.create({ data: { userId: entry.userId, kind: "LEADERBOARD", referenceKey: board.key, rewardId: r.rewardId } });
    if (r.amount > 0n) paid++;
  }
  await tx.leaderboard.update({ where: { id: board.id }, data: { rewardsDistributedAt: new Date() } });
  return paid;
}
