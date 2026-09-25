import type { AppConfig } from "@cryptoarena/config";
import type { QuestDto } from "@cryptoarena/shared";
import type { PremiumTier, Quest, QuestObjective, Tx } from "@cryptoarena/database";
import type { Logger } from "@cryptoarena/observability";
import { addCharacterXp } from "./characters";
import { AppError } from "./errors";
import { grantReward, getActiveSeason } from "./rewards";
import { questPeriodKey } from "./periods";

const TIER_RANK: Record<PremiumTier, number> = { FREE: 0, VIP: 1, ELITE: 2 };

export function effectiveTier(user: { premiumTier: PremiumTier; premiumUntil: Date | null }): PremiumTier {
  if (user.premiumTier === "FREE") return "FREE";
  return user.premiumUntil && user.premiumUntil > new Date() ? user.premiumTier : "FREE";
}

async function periodKeyFor(tx: Tx, quest: Quest): Promise<string> {
  const season = quest.period === "SEASONAL" ? await getActiveSeason(tx) : null;
  return questPeriodKey(quest.period, season?.key ?? null);
}

export async function listQuests(tx: Tx, userId: string): Promise<QuestDto[]> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const tier = effectiveTier(user);
  const quests = await tx.quest.findMany({ where: { active: true }, orderBy: [{ period: "asc" }, { target: "asc" }] });
  const out: QuestDto[] = [];
  for (const q of quests) {
    const periodKey = await periodKeyFor(tx, q);
    const uq = await tx.userQuest.findUnique({ where: { userId_questId_periodKey: { userId, questId: q.id, periodKey } } });
    out.push({
      key: q.key,
      name: q.name,
      description: q.description,
      period: q.period,
      objective: q.objective,
      target: q.target,
      progress: Math.min(uq?.progress ?? 0, q.target),
      completed: !!uq?.completedAt,
      claimed: !!uq?.claimedAt,
      locked: TIER_RANK[tier] < TIER_RANK[q.requiredTier],
      rewards: { gold: q.rewardGold.toString(), gems: q.rewardGems.toString(), xp: q.rewardXp, crypto: q.rewardCrypto.toString() },
    });
  }
  return out;
}

/**
 * Records server-observed progress. `mode: "max"` is used for REACH_LEVEL (progress = level).
 * Returns quests that became complete with this update.
 */
export async function recordQuestProgress(
  tx: Tx,
  userId: string,
  objective: QuestObjective,
  amount: number,
  mode: "add" | "max" = "add",
): Promise<Quest[]> {
  if (!Number.isInteger(amount) || amount <= 0) return [];
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) return [];
  const tier = effectiveTier(user);
  const quests = await tx.quest.findMany({ where: { active: true, objective } });
  const completed: Quest[] = [];
  for (const q of quests) {
    if (TIER_RANK[tier] < TIER_RANK[q.requiredTier]) continue;
    const periodKey = await periodKeyFor(tx, q);
    const uq = await tx.userQuest.upsert({
      where: { userId_questId_periodKey: { userId, questId: q.id, periodKey } },
      update: {},
      create: { userId, questId: q.id, periodKey },
    });
    if (uq.completedAt) continue;
    const progress = mode === "max" ? Math.max(uq.progress, amount) : uq.progress + amount;
    const done = progress >= q.target;
    await tx.userQuest.update({
      where: { id: uq.id },
      data: { progress: Math.min(progress, q.target), completedAt: done ? new Date() : null },
    });
    if (done) completed.push(q);
  }
  return completed;
}

export async function claimQuest(tx: Tx, config: AppConfig, logger: Logger, userId: string, questKey: string) {
  const quest = await tx.quest.findUnique({ where: { key: questKey } });
  if (!quest || !quest.active) throw new AppError("NOT_FOUND", "Quest not found");
  const periodKey = await periodKeyFor(tx, quest);
  const uq = await tx.userQuest.findUnique({ where: { userId_questId_periodKey: { userId, questId: quest.id, periodKey } } });
  if (!uq?.completedAt) throw new AppError("FORBIDDEN", "Quest not completed yet");
  if (uq.claimedAt) throw new AppError("ALREADY_CLAIMED", "Quest reward already claimed");

  const referenceKey = `${quest.key}:${periodKey}`;
  // Unique (userId, kind, referenceKey) makes double claims impossible even under races.
  const claim = await tx.rewardClaim.create({ data: { userId, kind: "QUEST", referenceKey } });
  const marked = await tx.userQuest.updateMany({ where: { id: uq.id, claimedAt: null }, data: { claimedAt: new Date() } });
  if (marked.count !== 1) throw new AppError("ALREADY_CLAIMED", "Quest reward already claimed");

  const results = [];
  const base = `quest:${userId}:${referenceKey}`;
  if (quest.rewardGold > 0n) results.push(await grantReward(tx, config, logger, { userId, source: "QUEST", asset: "GOLD", baseAmount: quest.rewardGold, idempotencyKey: `${base}:gold`, seasonBps: 10_000 }));
  if (quest.rewardGems > 0n) results.push(await grantReward(tx, config, logger, { userId, source: "QUEST", asset: "GEMS", baseAmount: quest.rewardGems, idempotencyKey: `${base}:gems`, seasonBps: 10_000 }));
  let cryptoRewardId: string | null = null;
  if (quest.rewardCrypto > 0n) {
    const r = await grantReward(tx, config, logger, { userId, source: "QUEST", asset: "CRYPTO", baseAmount: quest.rewardCrypto, idempotencyKey: `${base}:crypto` });
    cryptoRewardId = r.rewardId;
    results.push(r);
  }
  if (cryptoRewardId) await tx.rewardClaim.update({ where: { id: claim.id }, data: { rewardId: cryptoRewardId } });

  if (quest.rewardXp > 0) {
    const uc = await tx.userCharacter.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    if (uc) await addCharacterXp(tx, uc.id, quest.rewardXp);
  }
  return {
    questKey: quest.key,
    rewards: results.map((r) => ({ status: r.status, amount: r.amount.toString(), reason: r.reason ?? null })),
  };
}
