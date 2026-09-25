import type { CharacterBase } from "@cryptoarena/game-core";
import type { ItemStats } from "@cryptoarena/shared";
import type { Tx } from "@cryptoarena/database";

export interface AbilityJson {
  key: string;
  name: string;
  description: string;
  cooldownMs: number;
  effects: unknown[];
}

export function characterBaseFromRow(stats: {
  baseHp: number;
  baseDamage: number;
  baseArmor: number;
  baseSpeed: number;
  baseAttackSpeed: number;
  baseCritChance: number;
  baseRange: number;
  hpPerLevel: number;
  damagePerLevel: number;
  armorPerLevel: number;
}): CharacterBase {
  return {
    hp: stats.baseHp,
    damage: stats.baseDamage,
    armor: stats.baseArmor,
    speed: stats.baseSpeed,
    attackSpeed: stats.baseAttackSpeed,
    critChance: stats.baseCritChance,
    range: stats.baseRange,
    hpPerLevel: stats.hpPerLevel,
    damagePerLevel: stats.damagePerLevel,
    armorPerLevel: stats.armorPerLevel,
  };
}

/** Defensive parse of the Item.stats JSON column: only finite numeric known keys survive. */
export function parseItemStats(json: unknown): ItemStats {
  const out: ItemStats = {};
  if (!json || typeof json !== "object") return out;
  const allowed = ["damage", "armor", "hp", "speed", "critChance", "critDamage", "attackSpeed", "lifesteal", "range"] as const;
  for (const key of allowed) {
    const v = (json as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

export async function getItemByKey(tx: Tx, key: string) {
  return tx.item.findUnique({ where: { key } });
}
