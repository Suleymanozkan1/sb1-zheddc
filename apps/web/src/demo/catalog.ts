// Demo-only data. These values never reach the real economy: the live game reads prices, pools and
// limits from the database and config. The demo mirrors the seeded shop without crypto products.
import type { ProductCategory, ProductGrant, Rarity } from "@cryptoarena/shared";

/** Starting balances. Heroes also start with a few stat points so upgrades can be tried right away. */
export const DEMO_START = { gold: 5_000, gems: 2_000, slots: 60, potions: 5, statPoints: 6 } as const;

export interface DemoProduct {
  sku: string;
  name: string;
  description: string;
  category: ProductCategory;
  price: number;
  currency: "GOLD" | "GEMS";
  rarity: Rarity;
  grants: ProductGrant[];
  perUserLimit?: number;
}

const item = (itemKey: string, quantity = 1): ProductGrant[] => [{ kind: "ITEM", itemKey, quantity }];

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  { sku: "char_assassin_gems", name: "Assassin", description: "Unlock the Assassin.", category: "CHARACTER", price: 900, currency: "GEMS", rarity: "RARE", grants: [{ kind: "CHARACTER", characterKey: "assassin" }] },
  { sku: "char_assassin_gold", name: "Assassin (Gold)", description: "Unlock the Assassin with gold earned in the arena.", category: "CHARACTER", price: 25_000, currency: "GOLD", rarity: "RARE", grants: [{ kind: "CHARACTER", characterKey: "assassin" }] },
  { sku: "char_mage_gems", name: "Mage", description: "Unlock the Mage.", category: "CHARACTER", price: 1_200, currency: "GEMS", rarity: "EPIC", grants: [{ kind: "CHARACTER", characterKey: "mage" }] },
  { sku: "char_mage_gold", name: "Mage (Gold)", description: "Unlock the Mage with gold earned in the arena.", category: "CHARACTER", price: 40_000, currency: "GOLD", rarity: "EPIC", grants: [{ kind: "CHARACTER", characterKey: "mage" }] },
  { sku: "skin_warrior_crimson", name: "Crimson Warlord", description: "Warrior skin (cosmetic).", category: "SKIN", price: 450, currency: "GEMS", rarity: "EPIC", grants: item("skin_warrior_crimson"), perUserLimit: 1 },
  { sku: "skin_assassin_ghost", name: "Ghost Protocol", description: "Assassin skin (cosmetic).", category: "SKIN", price: 900, currency: "GEMS", rarity: "LEGENDARY", grants: item("skin_assassin_ghost"), perUserLimit: 1 },
  { sku: "skin_tank_titanium", name: "Titanium Bulwark", description: "Tank skin (cosmetic).", category: "SKIN", price: 300, currency: "GEMS", rarity: "RARE", grants: item("skin_tank_titanium"), perUserLimit: 1 },
  { sku: "skin_ranger_emerald", name: "Emerald Hunter", description: "Ranger skin (cosmetic).", category: "SKIN", price: 300, currency: "GEMS", rarity: "RARE", grants: item("skin_ranger_emerald"), perUserLimit: 1 },
  { sku: "skin_mage_solar", name: "Solar Archon", description: "Mage skin (cosmetic).", category: "SKIN", price: 1_500, currency: "GEMS", rarity: "MYTHIC", grants: item("skin_mage_solar"), perUserLimit: 1 },
  { sku: "weapon_blade_rare", name: "Neon Blade", description: "A reliable rare blade.", category: "WEAPON", price: 3_000, currency: "GOLD", rarity: "RARE", grants: item("blade_rare") },
  { sku: "weapon_longbow_rare", name: "Neon Longbow", description: "A reliable rare longbow.", category: "WEAPON", price: 3_000, currency: "GOLD", rarity: "RARE", grants: item("longbow_rare") },
  { sku: "equip_striders_uncommon", name: "Tuned Striders", description: "Boots for faster movement.", category: "EQUIPMENT", price: 1_200, currency: "GOLD", rarity: "UNCOMMON", grants: item("striders_uncommon") },
  { sku: "equip_vest_epic", name: "Quantum Vest", description: "Epic body armor.", category: "EQUIPMENT", price: 700, currency: "GEMS", rarity: "EPIC", grants: item("vest_epic") },
  { sku: "potion_pack_5", name: "Health Potions x5", description: "Five health potions.", category: "CONSUMABLE", price: 150, currency: "GOLD", rarity: "COMMON", grants: item("potion_health", 5) },
  { sku: "boost_xp_1", name: "XP Booster", description: "+50% XP for 30 minutes of play.", category: "BOOST", price: 120, currency: "GEMS", rarity: "RARE", grants: item("boost_xp") },
  { sku: "stash_20", name: "+20 Stash Slots", description: "Permanently expands your stash.", category: "COSMETIC", price: 2_000, currency: "GOLD", rarity: "UNCOMMON", grants: [{ kind: "STASH_SLOTS", amount: 20 }], perUserLimit: 10 },
  { sku: "slots_20", name: "+20 Inventory Slots", description: "Permanently expands your inventory.", category: "COSMETIC", price: 200, currency: "GEMS", rarity: "UNCOMMON", grants: [{ kind: "INVENTORY_SLOTS", amount: 20 }], perUserLimit: 5 },
];

/** Sell prices, mirroring the live defaults (SELL_* in the server config). */
export const DEMO_SELL_RATES = {
  gold: { COMMON: 12, UNCOMMON: 30, RARE: 80, EPIC: 200, LEGENDARY: 500, MYTHIC: 1200 },
  consumableBps: 2_500,
  upgradeRefundBps: 2_500,
} as const;
export const DEMO_STASH_SLOTS = 100;
export const DEMO_SELL_MAX_ITEMS = 100;

export type DemoObjective = "KILL_NPC" | "KILL_PLAYER" | "COLLECT_RESOURCE" | "PLAY_MATCH";

export interface DemoQuest {
  key: string;
  name: string;
  description: string;
  objective: DemoObjective;
  target: number;
  gold: number;
  gems: number;
}

export const DEMO_QUESTS: readonly DemoQuest[] = [
  { key: "demo_hunter", name: "Creature Hunter", description: "Defeat 15 creatures.", objective: "KILL_NPC", target: 15, gold: 400, gems: 0 },
  { key: "demo_duelist", name: "Duelist", description: "Defeat 3 rival heroes.", objective: "KILL_PLAYER", target: 3, gold: 600, gems: 20 },
  { key: "demo_scavenger", name: "Scavenger", description: "Collect 20 resources.", objective: "COLLECT_RESOURCE", target: 20, gold: 300, gems: 0 },
  { key: "demo_veteran", name: "Arena Veteran", description: "Finish 3 arena sessions.", objective: "PLAY_MATCH", target: 3, gold: 500, gems: 30 },
];

/** Rival names for the local leaderboard and the arena bots. */
export const DEMO_RIVALS = ["Voltra", "Nullbyte", "Kernel", "Pixelpunk", "Qubit", "Sprocket", "Glitchy", "Circuit", "Rusty"] as const;
