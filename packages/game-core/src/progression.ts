import type { Rarity, StatKey } from "@cryptoarena/shared";
import { MAX_ITEM_UPGRADE, MAX_LEVEL, STAT_POINTS_PER_LEVEL } from "./constants";

/** Total XP required to reach `level` from level 1. */
export function totalXpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  // Sum over k=1..l-1 of 100 * k^1.6 (rounded), monotonic and cheap to compute.
  let total = 0;
  for (let k = 1; k < l; k++) total += Math.round(100 * Math.pow(k, 1.6));
  return total;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= totalXpForLevel(level + 1)) level++;
  return level;
}

export function levelProgress(xp: number): { level: number; xpIntoLevel: number; xpForNext: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, xpIntoLevel: 0, xpForNext: 0 };
  const start = totalXpForLevel(level);
  return { level, xpIntoLevel: xp - start, xpForNext: totalXpForLevel(level + 1) - start };
}

export function statPointsForLevels(fromLevel: number, toLevel: number): number {
  return Math.max(0, toLevel - fromLevel) * STAT_POINTS_PER_LEVEL;
}

const RARITY_UPGRADE_FACTOR: Record<Rarity, number> = {
  COMMON: 1,
  UNCOMMON: 1.4,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4.5,
  MYTHIC: 7,
};

/** Gold cost to upgrade an item from `currentLevel` to `currentLevel + 1`. */
export function itemUpgradeCost(rarity: Rarity, currentLevel: number): bigint | null {
  if (currentLevel >= MAX_ITEM_UPGRADE) return null;
  const base = 50 * RARITY_UPGRADE_FACTOR[rarity];
  return BigInt(Math.round(base * Math.pow(1.35, currentLevel)));
}

/** Multiplier applied to an item's stats at the given upgrade level (+5% per level, +100% at +20). */
export function itemUpgradeMultiplier(upgradeLevel: number): number {
  return 1 + 0.05 * Math.max(0, Math.min(MAX_ITEM_UPGRADE, upgradeLevel));
}

/** Gold cost to spend the next stat point in `stat` (on top of consuming one stat point). */
export function statUpgradeGoldCost(stat: StatKey, currentPoints: number): bigint {
  const weight: Record<StatKey, number> = { HP: 1, DAMAGE: 1.2, ARMOR: 1, SPEED: 1.3, ATTACK_SPEED: 1.3, CRIT_CHANCE: 1.25 };
  return BigInt(Math.round(40 * weight[stat] * Math.pow(1.18, currentPoints)));
}

/** Per-point stat bonus from CharacterUpgrade allocations. */
export const STAT_POINT_VALUES: Record<StatKey, number> = {
  HP: 30,
  DAMAGE: 3,
  ARMOR: 2,
  SPEED: 4,
  ATTACK_SPEED: 0.03,
  CRIT_CHANCE: 0.006,
};

/** XP granted for killing an entity of `victimLevel` by a killer of `killerLevel`. */
export function killXp(baseXp: number, killerLevel: number, victimLevel: number): number {
  const diff = victimLevel - killerLevel;
  const factor = Math.max(0.2, Math.min(2, 1 + diff * 0.1));
  return Math.max(1, Math.round(baseXp * factor));
}
