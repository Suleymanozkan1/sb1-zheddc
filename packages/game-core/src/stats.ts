import { ITEM_STAT_KEYS, type CombatStats, type ItemStats, type StatKey } from "@cryptoarena/shared";
import type { CharacterBase } from "./characters";
import { STAT_CAPS } from "./constants";
import { STAT_POINT_VALUES, itemUpgradeMultiplier } from "./progression";
import { clamp } from "./math";

export interface EquippedItemInput {
  stats: ItemStats;
  upgradeLevel: number;
}

export function scaleItemStats(stats: ItemStats, upgradeLevel: number): ItemStats {
  const m = itemUpgradeMultiplier(upgradeLevel);
  const out: ItemStats = {};
  for (const key of ITEM_STAT_KEYS) {
    const v = stats[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.round(v * m * 1000) / 1000;
  }
  return out;
}

/** Resolves final combat stats: class base + level growth + stat points + equipment, clamped to caps. */
export function computeCombatStats(
  base: CharacterBase,
  level: number,
  upgrades: Partial<Record<StatKey, number>>,
  equipped: readonly EquippedItemInput[],
): CombatStats {
  const lv = Math.max(1, level) - 1;
  const up = (k: StatKey): number => Math.max(0, upgrades[k] ?? 0) * STAT_POINT_VALUES[k];

  const stats: CombatStats = {
    maxHp: base.hp + base.hpPerLevel * lv + up("HP"),
    damage: base.damage + base.damagePerLevel * lv + up("DAMAGE"),
    armor: base.armor + base.armorPerLevel * lv + up("ARMOR"),
    speed: base.speed + up("SPEED"),
    attackSpeed: base.attackSpeed + up("ATTACK_SPEED"),
    critChance: base.critChance + up("CRIT_CHANCE"),
    critDamage: 1.5,
    lifesteal: 0,
    range: base.range,
  };

  for (const item of equipped) {
    const s = scaleItemStats(item.stats, item.upgradeLevel);
    stats.maxHp += s.hp ?? 0;
    stats.damage += s.damage ?? 0;
    stats.armor += s.armor ?? 0;
    stats.speed += s.speed ?? 0;
    stats.attackSpeed += s.attackSpeed ?? 0;
    stats.critChance += s.critChance ?? 0;
    stats.critDamage += s.critDamage ?? 0;
    stats.lifesteal += s.lifesteal ?? 0;
    stats.range += s.range ?? 0;
  }

  return {
    maxHp: Math.round(Math.max(1, stats.maxHp)),
    damage: Math.round(Math.max(1, stats.damage) * 10) / 10,
    armor: Math.round(Math.max(0, stats.armor) * 10) / 10,
    speed: Math.round(clamp(stats.speed, 120, STAT_CAPS.speed)),
    attackSpeed: Math.round(clamp(stats.attackSpeed, 0.3, STAT_CAPS.attackSpeed) * 100) / 100,
    critChance: Math.round(clamp(stats.critChance, 0, STAT_CAPS.critChance) * 1000) / 1000,
    critDamage: Math.round(clamp(stats.critDamage, 1, STAT_CAPS.critDamage) * 100) / 100,
    lifesteal: Math.round(clamp(stats.lifesteal, 0, STAT_CAPS.lifesteal) * 1000) / 1000,
    range: Math.round(clamp(stats.range, 40, STAT_CAPS.range)),
  };
}

/** Armor mitigation: 100 armor halves incoming damage. */
export function mitigate(rawDamage: number, armor: number): number {
  return rawDamage * (100 / (100 + Math.max(0, armor)));
}

export function rollDamage(
  attacker: Pick<CombatStats, "damage" | "critChance" | "critDamage">,
  defenderArmor: number,
  multiplier: number,
  roll: number,
): { amount: number; crit: boolean } {
  const crit = roll < attacker.critChance;
  const raw = attacker.damage * multiplier * (crit ? attacker.critDamage : 1);
  return { amount: Math.max(1, Math.round(mitigate(raw, defenderArmor))), crit };
}
