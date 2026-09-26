// Item catalog used to seed the Item table, plus loot rolling helpers.

import type { ItemStats, ItemType, Rarity } from "@cryptoarena/shared";
import { Rarity as RARITIES } from "@cryptoarena/shared";
import type { Rng } from "./rng";

export interface ItemDef {
  key: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: Rarity;
  stats: ItemStats;
  stackable: boolean;
  maxStack: number;
  maxUpgrade: number;
  levelRequirement: number;
  dropWeight: number;
  metadata: Record<string, unknown>;
}

const RARITY_MULT: Record<Rarity, number> = { COMMON: 1, UNCOMMON: 1.5, RARE: 2.2, EPIC: 3.2, LEGENDARY: 4.6, MYTHIC: 6.5 };
const RARITY_LEVEL: Record<Rarity, number> = { COMMON: 1, UNCOMMON: 5, RARE: 12, EPIC: 20, LEGENDARY: 30, MYTHIC: 40 };
const RARITY_DROP_WEIGHT: Record<Rarity, number> = { COMMON: 100, UNCOMMON: 60, RARE: 30, EPIC: 12, LEGENDARY: 4, MYTHIC: 1 };
const RARITY_PREFIX: Record<Rarity, string> = {
  COMMON: "Rusty",
  UNCOMMON: "Tuned",
  RARE: "Neon",
  EPIC: "Quantum",
  LEGENDARY: "Genesis",
  MYTHIC: "Singularity",
};

const EQUIPMENT: { type: ItemType; noun: string; stats: ItemStats; desc: string }[] = [
  { type: "WEAPON", noun: "Blade", stats: { damage: 8, critChance: 0.01 }, desc: "Increases damage." },
  { type: "WEAPON", noun: "Longbow", stats: { damage: 6, range: 40, attackSpeed: 0.04 }, desc: "Damage, range and attack speed." },
  { type: "ARMOR", noun: "Vest", stats: { armor: 6, hp: 40 }, desc: "Armor and health." },
  { type: "HELMET", noun: "Visor", stats: { armor: 3, hp: 25, critChance: 0.005 }, desc: "Armor, health and a bit of crit." },
  { type: "BOOTS", noun: "Striders", stats: { speed: 10, armor: 1 }, desc: "Movement speed." },
  { type: "RING", noun: "Loop", stats: { critChance: 0.015, critDamage: 0.06 }, desc: "Critical strikes." },
  { type: "AMULET", noun: "Core", stats: { lifesteal: 0.012, hp: 20, attackSpeed: 0.03 }, desc: "Lifesteal and attack speed." },
];

function scale(stats: ItemStats, m: number): ItemStats {
  const out: ItemStats = {};
  for (const [k, v] of Object.entries(stats) as [keyof ItemStats, number][]) {
    out[k] = Math.round(v * m * 1000) / 1000;
  }
  return out;
}

export function buildItemCatalog(): ItemDef[] {
  const items: ItemDef[] = [];
  for (const eq of EQUIPMENT) {
    for (const rarity of RARITIES) {
      const noun = eq.noun.toLowerCase();
      items.push({
        key: `${noun}_${rarity.toLowerCase()}`,
        name: `${RARITY_PREFIX[rarity]} ${eq.noun}`,
        description: eq.desc,
        type: eq.type,
        rarity,
        stats: scale(eq.stats, RARITY_MULT[rarity]),
        stackable: false,
        maxStack: 1,
        maxUpgrade: 20,
        levelRequirement: RARITY_LEVEL[rarity],
        dropWeight: RARITY_DROP_WEIGHT[rarity],
        metadata: {},
      });
    }
  }
  const skins: { key: string; name: string; character: string; rarity: Rarity; tint: number }[] = [
    { key: "skin_warrior_crimson", name: "Crimson Warlord", character: "warrior", rarity: "EPIC", tint: 0xdc2626 },
    { key: "skin_assassin_ghost", name: "Ghost Protocol", character: "assassin", rarity: "LEGENDARY", tint: 0xe5e7eb },
    { key: "skin_tank_titanium", name: "Titanium Bulwark", character: "tank", rarity: "RARE", tint: 0x94a3b8 },
    { key: "skin_ranger_emerald", name: "Emerald Hunter", character: "ranger", rarity: "RARE", tint: 0x10b981 },
    { key: "skin_mage_solar", name: "Solar Archon", character: "mage", rarity: "MYTHIC", tint: 0xfacc15 },
  ];
  for (const s of skins) {
    items.push({
      key: s.key,
      name: s.name,
      description: `Cosmetic skin for the ${s.character}. No stat bonus.`,
      type: "SKIN",
      rarity: s.rarity,
      stats: {},
      stackable: false,
      maxStack: 1,
      maxUpgrade: 0,
      levelRequirement: 1,
      dropWeight: 0,
      metadata: { characterKey: s.character, tint: s.tint },
    });
  }
  items.push(
    {
      key: "potion_health",
      name: "Health Potion",
      description: "Restores 35% of max HP instantly.",
      type: "CONSUMABLE",
      rarity: "COMMON",
      stats: {},
      stackable: true,
      maxStack: 99,
      maxUpgrade: 0,
      levelRequirement: 1,
      dropWeight: 140,
      metadata: { effect: "heal", fraction: 0.35 },
    },
    {
      key: "boost_xp",
      name: "XP Booster",
      description: "+50% XP for 30 minutes of play.",
      type: "CONSUMABLE",
      rarity: "RARE",
      stats: {},
      stackable: true,
      maxStack: 20,
      maxUpgrade: 0,
      levelRequirement: 1,
      dropWeight: 0,
      metadata: { effect: "xp_boost", multiplier: 1.5, durationMs: 30 * 60 * 1000 },
    },
  );
  return items;
}

/** Rarity weights per loot tier (1 = weakest NPC, 5 = boss). */
const LOOT_RARITY_WEIGHTS: Record<number, Record<Rarity, number>> = {
  1: { COMMON: 80, UNCOMMON: 18, RARE: 2, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 },
  2: { COMMON: 55, UNCOMMON: 30, RARE: 12, EPIC: 3, LEGENDARY: 0, MYTHIC: 0 },
  3: { COMMON: 30, UNCOMMON: 35, RARE: 24, EPIC: 9, LEGENDARY: 2, MYTHIC: 0 },
  4: { COMMON: 10, UNCOMMON: 25, RARE: 35, EPIC: 22, LEGENDARY: 7, MYTHIC: 1 },
  5: { COMMON: 0, UNCOMMON: 0, RARE: 30, EPIC: 45, LEGENDARY: 20, MYTHIC: 5 },
};

export interface LootCandidate {
  key: string;
  rarity: Rarity;
  type: ItemType;
  dropWeight: number;
}

/** Rolls an item from the active catalog. Returns null when nothing is droppable. */
export function rollLoot(rng: Rng, tier: number, catalog: readonly LootCandidate[]): LootCandidate | null {
  const weights = LOOT_RARITY_WEIGHTS[Math.max(1, Math.min(5, tier))]!;
  const droppable = catalog.filter((c) => c.dropWeight > 0 && c.type !== "SKIN");
  const potions = droppable.filter((c) => c.type === "CONSUMABLE");
  if (potions.length > 0 && rng.chance(0.35)) return rng.pick(potions);
  const rarity = rng.weighted(RARITIES.map((r) => ({ value: r, weight: weights[r] })));
  const pool = droppable.filter((c) => c.rarity === rarity && c.type !== "CONSUMABLE");
  if (pool.length === 0) return null;
  return rng.weighted(pool.map((c) => ({ value: c, weight: c.dropWeight })));
}
