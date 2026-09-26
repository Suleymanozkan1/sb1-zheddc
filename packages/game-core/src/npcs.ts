export type NpcBehavior = "passive" | "aggressive" | "static";

export interface NpcDef {
  key: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  behavior: NpcBehavior;
  radius: number;
  hp: number;
  damage: number;
  armor: number;
  speed: number;
  attackRange: number;
  attackCooldownMs: number;
  aggroRange: number;
  level: number;
  xp: number;
  gold: [number, number];
  /** Chance to drop an item on death. */
  lootChance: number;
  /** Loot tier passed to the rarity table. */
  lootTier: number;
  color: number;
  /** Fraction of HP at which passive/aggressive creatures flee. */
  fleeAt: number;
}

export const NPCS: readonly NpcDef[] = [
  { key: "slime", name: "Neon Slime", tier: 1, behavior: "passive", radius: 22, hp: 120, damage: 10, armor: 0, speed: 150, attackRange: 50, attackCooldownMs: 1200, aggroRange: 0, level: 1, xp: 18, gold: [2, 6], lootChance: 0.08, lootTier: 1, color: 0x4ade80, fleeAt: 0.3 },
  { key: "wolf", name: "Glitch Wolf", tier: 1, behavior: "aggressive", radius: 26, hp: 220, damage: 18, armor: 5, speed: 250, attackRange: 58, attackCooldownMs: 1000, aggroRange: 380, level: 3, xp: 35, gold: [5, 12], lootChance: 0.12, lootTier: 1, color: 0x94a3b8, fleeAt: 0.15 },
  { key: "stalker", name: "Forest Stalker", tier: 2, behavior: "aggressive", radius: 28, hp: 480, damage: 32, armor: 14, speed: 260, attackRange: 62, attackCooldownMs: 1000, aggroRange: 460, level: 10, xp: 80, gold: [12, 26], lootChance: 0.18, lootTier: 2, color: 0x16a34a, fleeAt: 0.1 },
  { key: "golem", name: "Ash Golem", tier: 3, behavior: "aggressive", radius: 40, hp: 1400, damage: 60, armor: 40, speed: 170, attackRange: 80, attackCooldownMs: 1600, aggroRange: 420, level: 22, xp: 220, gold: [30, 70], lootChance: 0.3, lootTier: 3, color: 0xb45309, fleeAt: 0 },
  { key: "wraith", name: "Void Wraith", tier: 4, behavior: "aggressive", radius: 32, hp: 2200, damage: 95, armor: 30, speed: 280, attackRange: 70, attackCooldownMs: 900, aggroRange: 560, level: 35, xp: 520, gold: [70, 160], lootChance: 0.4, lootTier: 4, color: 0x7c3aed, fleeAt: 0 },
  { key: "titan", name: "Crystal Titan", tier: 4, behavior: "aggressive", radius: 70, hp: 16000, damage: 150, armor: 60, speed: 150, attackRange: 130, attackCooldownMs: 1800, aggroRange: 650, level: 45, xp: 4000, gold: [800, 1500], lootChance: 1, lootTier: 5, color: 0xf43f5e, fleeAt: 0 },
  { key: "chest", name: "Supply Chest", tier: 1, behavior: "static", radius: 30, hp: 160, damage: 0, armor: 0, speed: 0, attackRange: 0, attackCooldownMs: 0, aggroRange: 0, level: 1, xp: 10, gold: [20, 60], lootChance: 1, lootTier: 2, color: 0xfacc15, fleeAt: 0 },
];

export function getNpcDef(key: string): NpcDef {
  const def = NPCS.find((n) => n.key === key);
  if (!def) throw new Error(`Unknown NPC ${key}`);
  return def;
}

/** Desired population per region tier (scaled by room config). */
export const NPC_POPULATION: readonly { key: string; count: number }[] = [
  { key: "slime", count: 90 },
  { key: "wolf", count: 60 },
  { key: "stalker", count: 55 },
  { key: "golem", count: 30 },
  { key: "wraith", count: 18 },
  { key: "titan", count: 1 },
  { key: "chest", count: 40 },
];

export interface ResourceDef {
  key: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  gold: number;
  xp: number;
  color: number;
  /** Quest objects count toward COLLECT_RESOURCE and give no gold. */
  questObject: boolean;
}

export const RESOURCES: readonly ResourceDef[] = [
  { key: "scrap", name: "Scrap Metal", tier: 1, gold: 4, xp: 4, color: 0x9ca3af, questObject: false },
  { key: "crystal", name: "Energy Crystal", tier: 2, gold: 10, xp: 8, color: 0x22d3ee, questObject: false },
  { key: "core_shard", name: "Core Shard", tier: 3, gold: 24, xp: 16, color: 0xe879f9, questObject: false },
  { key: "relic", name: "Ancient Relic", tier: 4, gold: 0, xp: 60, color: 0xfbbf24, questObject: true },
];

export const RESOURCE_POPULATION: readonly { key: string; count: number }[] = [
  { key: "scrap", count: 220 },
  { key: "crystal", count: 140 },
  { key: "core_shard", count: 70 },
  { key: "relic", count: 12 },
];
