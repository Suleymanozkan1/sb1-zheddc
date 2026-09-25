import { StatKey, type CharacterDto, type SkillDto } from "@cryptoarena/shared";
import {
  MAX_LEVEL,
  MAX_STAT_POINTS_PER_STAT,
  computeCombatStats,
  levelFromXp,
  levelProgress,
  statPointsForLevels,
  statUpgradeGoldCost,
} from "@cryptoarena/game-core";
import type { CharacterUpgrade, Tx, UserCharacter } from "@cryptoarena/database";
import { characterBaseFromRow, type AbilityJson } from "./catalog";
import { AppError } from "./errors";
import { getEquippedForStats } from "./inventory";
import { postJournal, transfer } from "./ledger";



function skillDto(json: unknown): SkillDto {
  const a = json as Partial<AbilityJson>;
  return { key: String(a.key ?? ""), name: String(a.name ?? ""), description: String(a.description ?? ""), cooldownMs: Number(a.cooldownMs ?? 0) };
}

function upgradesRecord(rows: CharacterUpgrade[]): Record<StatKey, number> {
  const out = Object.fromEntries(StatKey.map((k) => [k, 0])) as Record<StatKey, number>;
  for (const r of rows) out[r.stat] = r.points;
  return out;
}

export async function listCharacters(tx: Tx, userId: string): Promise<CharacterDto[]> {
  const [characters, owned, products] = await Promise.all([
    tx.character.findMany({ where: { active: true }, include: { stats: true }, orderBy: { createdAt: "asc" } }),
    tx.userCharacter.findMany({ where: { userId }, include: { upgrades: true } }),
    tx.shopProduct.findMany({ where: { active: true, category: "CHARACTER" } }),
  ]);
  const equipped = await getEquippedForStats(tx, userId);

  return characters.map((c) => {
    if (!c.stats) throw new AppError("INTERNAL", `Character ${c.key} has no stats`);
    const base = characterBaseFromRow(c.stats);
    const uc = owned.find((o) => o.characterId === c.id);
    const product = products.find((p) =>
      ((p.metadata as { grants?: { kind?: string; characterKey?: string }[] }).grants ?? []).some(
        (g) => g.kind === "CHARACTER" && g.characterKey === c.key,
      ),
    );
    const baseStats = computeCombatStats(base, 1, {}, []);
    let progress: CharacterDto["progress"] = null;
    if (uc) {
      const ups = upgradesRecord(uc.upgrades);
      const lp = levelProgress(uc.xp);
      progress = {
        userCharacterId: uc.id,
        level: uc.level,
        xp: uc.xp,
        xpIntoLevel: lp.xpIntoLevel,
        xpForNext: lp.xpForNext,
        statPoints: uc.statPoints,
        upgrades: ups,
        upgradeCosts: Object.fromEntries(StatKey.map((k) => [k, statUpgradeGoldCost(k, ups[k]).toString()])) as Record<StatKey, string>,
        stats: computeCombatStats(base, uc.level, ups, equipped),
      };
    }
    return {
      key: c.key,
      name: c.name,
      class: c.class,
      rarity: c.rarity,
      description: c.description,
      skill: skillDto(c.skill),
      ultimate: skillDto(c.ultimate),
      base: baseStats,
      owned: !!uc,
      isStarter: c.isStarter,
      unlockProduct: product ? { sku: product.sku, price: product.price.toString(), currency: product.currency } : null,
      progress,
    };
  });
}

export async function grantCharacter(tx: Tx, userId: string, characterKey: string): Promise<{ userCharacter: UserCharacter; duplicate: boolean }> {
  const character = await tx.character.findUnique({ where: { key: characterKey } });
  if (!character || !character.active) throw new AppError("NOT_FOUND", `Unknown character ${characterKey}`);
  const existing = await tx.userCharacter.findUnique({ where: { userId_characterId: { userId, characterId: character.id } } });
  if (existing) return { userCharacter: existing, duplicate: true };
  const userCharacter = await tx.userCharacter.create({ data: { userId, characterId: character.id } });
  return { userCharacter, duplicate: false };
}

export async function upgradeCharacterStat(
  tx: Tx,
  userId: string,
  userCharacterId: string,
  stat: StatKey,
  idempotencyKey: string,
): Promise<void> {
  const uc = await tx.userCharacter.findFirst({ where: { id: userCharacterId, userId }, include: { upgrades: true } });
  if (!uc) throw new AppError("NOT_FOUND", "Character not owned");
  const current = uc.upgrades.find((u) => u.stat === stat)?.points ?? 0;
  if (current >= MAX_STAT_POINTS_PER_STAT) throw new AppError("LIMIT_EXCEEDED", "This stat is maxed out");
  if (uc.statPoints < 1) throw new AppError("INSUFFICIENT_FUNDS", "No stat points available — level up to earn more");

  const posted = await postJournal(tx, {
    type: "CHARACTER_UPGRADE",
    idempotencyKey: `char_upgrade:${userId}:${idempotencyKey}`,
    reference: uc.id,
    metadata: { stat, from: current, to: current + 1 },
    legs: transfer({ userId, kind: "GOLD" }, { system: "GOLD_SINK" }, statUpgradeGoldCost(stat, current)),
  });
  if (posted.duplicate) return;

  const dec = await tx.userCharacter.updateMany({ where: { id: uc.id, statPoints: { gte: 1 } }, data: { statPoints: { decrement: 1 } } });
  if (dec.count !== 1) throw new AppError("CONFLICT", "Stat points changed concurrently");
  await tx.characterUpgrade.upsert({
    where: { userCharacterId_stat: { userCharacterId: uc.id, stat } },
    update: { points: { increment: 1 } },
    create: { userCharacterId: uc.id, stat, points: 1 },
  });
}

/** Adds server-computed XP to a character, applying level-ups and stat points. */
export async function addCharacterXp(tx: Tx, userCharacterId: string, xp: number): Promise<{ level: number; leveledUp: boolean }> {
  if (!Number.isInteger(xp) || xp < 0) throw new AppError("INTERNAL", "Invalid XP delta");
  const uc = await tx.userCharacter.findUniqueOrThrow({ where: { id: userCharacterId } });
  const newXp = uc.xp + xp;
  const newLevel = Math.min(MAX_LEVEL, levelFromXp(newXp));
  const points = statPointsForLevels(uc.level, newLevel);
  await tx.userCharacter.update({
    where: { id: uc.id },
    data: { xp: newXp, level: newLevel, statPoints: { increment: points } },
  });
  return { level: newLevel, leveledUp: newLevel > uc.level };
}


/** Everything the game server needs to spawn a player's character. */
export async function loadCharacterForMatch(tx: Tx, userId: string, userCharacterId: string) {
  const uc = await tx.userCharacter.findFirst({
    where: { id: userCharacterId, userId },
    include: { upgrades: true, character: { include: { stats: true } } },
  });
  if (!uc || !uc.character.stats || !uc.character.active) throw new AppError("NOT_FOUND", "Character not owned");
  const equipped = await getEquippedForStats(tx, userId);
  const base = characterBaseFromRow(uc.character.stats);
  return {
    userCharacterId: uc.id,
    characterKey: uc.character.key,
    level: uc.level,
    xp: uc.xp,
    base,
    upgrades: upgradesRecord(uc.upgrades),
    equipped,
    stats: computeCombatStats(base, uc.level, upgradesRecord(uc.upgrades), equipped),
  };
}
