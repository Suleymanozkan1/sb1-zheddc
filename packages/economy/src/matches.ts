// Persistence of server-authoritative match results. Called by the game server only.

import type { AppConfig } from "@cryptoarena/config";
import type { MatchMode, Tx } from "@cryptoarena/database";
import type { Logger } from "@cryptoarena/observability";
import { addCharacterXp } from "./characters";
import { recordLeaderboardStats } from "./leaderboard";
import { postJournal, transfer } from "./ledger";
import { recordQuestProgress } from "./quests";
import { getActiveSeason } from "./rewards";

export async function createMatch(tx: Tx, input: { roomId: string; mode: MatchMode; mapKey: string; maxPlayers: number; tickRate: number }) {
  const season = await getActiveSeason(tx);
  return tx.gameMatch.create({ data: { ...input, seasonId: season?.id ?? null, status: "RUNNING", startedAt: new Date() } });
}

export async function addMatchPlayer(tx: Tx, matchId: string, userId: string, userCharacterId: string) {
  return tx.gameMatchPlayer.upsert({
    where: { matchId_userId: { matchId, userId } },
    update: { leftAt: null, userCharacterId },
    create: { matchId, userId, userCharacterId },
  });
}

export interface PlayerProgressDelta {
  matchId: string;
  userId: string;
  userCharacterId: string;
  /** Monotonic flush counter: makes each flush idempotent. */
  flushSeq: number;
  kills: number;
  deaths: number;
  npcKills: number;
  damageDealt: number;
  xp: number;
  gold: number;
  resources: number;
  chests: number;
  win: boolean;
  left?: boolean;
  /** True when the session lasted long enough to count toward PLAY_MATCH quests. */
  countsAsMatch?: boolean;
}

/**
 * Applies accumulated, server-computed progress since the last flush.
 * Gold is credited through the ledger with an idempotency key per flush.
 */
export async function flushPlayerProgress(tx: Tx, _config: AppConfig, _logger: Logger, d: PlayerProgressDelta) {
  const key = `match:${d.matchId}:${d.userId}:${d.flushSeq}`;
  const done = await tx.ledgerJournal.findUnique({ where: { idempotencyKey: `${key}:marker` } });
  if (done) return { level: null as number | null, leveledUp: false, completedQuests: [] as { key: string; name: string }[] };

  if (d.gold > 0) {
    await postJournal(tx, {
      type: "GAME_REWARD",
      idempotencyKey: `${key}:gold`,
      reference: d.matchId,
      metadata: { source: "gameplay" },
      legs: transfer({ system: "GOLD_ISSUANCE" }, { userId: d.userId, kind: "GOLD" }, BigInt(d.gold)),
    });
  }
  // Zero-value marker journal is not allowed by the ledger; use a tiny self-describing audit instead.
  await tx.ledgerJournal.create({ data: { type: "GAME_REWARD", idempotencyKey: `${key}:marker`, reference: d.matchId, description: "match flush marker" } });

  const xp = await addCharacterXp(tx, d.userCharacterId, Math.max(0, Math.floor(d.xp)));
  await tx.gameMatchPlayer.update({
    where: { matchId_userId: { matchId: d.matchId, userId: d.userId } },
    data: {
      kills: { increment: d.kills },
      deaths: { increment: d.deaths },
      npcKills: { increment: d.npcKills },
      damageDealt: { increment: Math.floor(d.damageDealt) },
      xpEarned: { increment: Math.floor(d.xp) },
      goldEarned: { increment: d.gold },
      score: { increment: d.kills * 10 + d.npcKills * 2 },
      ...(d.left ? { leftAt: new Date() } : {}),
    },
  });
  await recordLeaderboardStats(tx, d.userId, { kills: d.kills, npcKills: d.npcKills, xp: d.xp, wins: d.win ? 1 : 0 });

  const completed = [];
  if (d.npcKills > 0) completed.push(...(await recordQuestProgress(tx, d.userId, "KILL_NPC", d.npcKills)));
  if (d.kills > 0) completed.push(...(await recordQuestProgress(tx, d.userId, "KILL_PLAYER", d.kills)));
  if (d.resources > 0) completed.push(...(await recordQuestProgress(tx, d.userId, "COLLECT_RESOURCE", d.resources)));
  if (d.chests > 0) completed.push(...(await recordQuestProgress(tx, d.userId, "OPEN_CHEST", d.chests)));
  if (d.damageDealt > 0) completed.push(...(await recordQuestProgress(tx, d.userId, "DEAL_DAMAGE", Math.floor(d.damageDealt))));
  if (d.win) completed.push(...(await recordQuestProgress(tx, d.userId, "WIN_MATCH", 1)));
  if (d.countsAsMatch) completed.push(...(await recordQuestProgress(tx, d.userId, "PLAY_MATCH", 1)));
  completed.push(...(await recordQuestProgress(tx, d.userId, "REACH_LEVEL", xp.level, "max")));

  return { level: xp.level, leveledUp: xp.leveledUp, completedQuests: completed.map((q) => ({ key: q.key, name: q.name })) };
}

export async function endMatch(tx: Tx, matchId: string, winnerUserId: string | null, placements: { userId: string; placement: number }[]) {
  for (const p of placements) {
    await tx.gameMatchPlayer.updateMany({ where: { matchId, userId: p.userId }, data: { placement: p.placement } });
  }
  await tx.gameMatch.update({ where: { id: matchId }, data: { status: "ENDED", endedAt: new Date(), winnerUserId } });
}

export async function recordAntiCheatFlag(
  tx: Tx,
  input: { userId: string; matchId?: string | null; kind: string; severity: number; details?: Record<string, unknown> },
) {
  await tx.antiCheatFlag.create({
    data: { userId: input.userId, matchId: input.matchId ?? null, kind: input.kind, severity: input.severity, details: (input.details ?? {}) as object },
  });
  await tx.user.update({ where: { id: input.userId }, data: { riskScore: { increment: input.severity } } });
}
