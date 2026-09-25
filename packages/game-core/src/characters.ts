// Starter character definitions. These seed the Character / CharacterStats tables;
// at runtime the server reads base stats from the database.

import type { CharacterClass, Rarity } from "@cryptoarena/shared";

export type AbilityEffect =
  | { type: "aoe"; radius: number; damageMult: number }
  | { type: "cone"; range: number; arc: number; damageMult: number }
  | { type: "multishot"; count: number; spread: number; damageMult: number; speed: number }
  | { type: "blink"; distance: number; damageMult: number; radius: number }
  | { type: "buff"; durationMs: number; damageMult?: number; armorMult?: number; speedMult?: number; attackSpeedMult?: number; lifesteal?: number; invisible?: boolean }
  | { type: "heal"; fraction: number }
  | { type: "meteor"; radius: number; damageMult: number; delayMs: number; range: number };

export interface AbilityDef {
  key: string;
  name: string;
  description: string;
  cooldownMs: number;
  effects: AbilityEffect[];
}

export interface CharacterBase {
  hp: number;
  damage: number;
  armor: number;
  speed: number;
  attackSpeed: number;
  critChance: number;
  range: number;
  hpPerLevel: number;
  damagePerLevel: number;
  armorPerLevel: number;
}

export interface CharacterDef {
  key: string;
  name: string;
  class: CharacterClass;
  rarity: Rarity;
  description: string;
  attack: "melee" | "projectile";
  projectileSpeed: number;
  base: CharacterBase;
  skill: AbilityDef;
  ultimate: AbilityDef;
  isStarter: boolean;
  color: number;
}

export const CHARACTERS: readonly CharacterDef[] = [
  {
    key: "warrior",
    name: "Warrior",
    class: "WARRIOR",
    rarity: "COMMON",
    description: "Balanced frontline fighter with a sweeping blade.",
    attack: "melee",
    projectileSpeed: 0,
    base: { hp: 620, damage: 48, armor: 22, speed: 300, attackSpeed: 1.25, critChance: 0.08, range: 115, hpPerLevel: 26, damagePerLevel: 2.2, armorPerLevel: 0.8 },
    skill: { key: "whirlwind", name: "Whirlwind", description: "Spin and hit every enemy around you.", cooldownMs: 6_000, effects: [{ type: "aoe", radius: 180, damageMult: 1.6 }] },
    ultimate: { key: "berserk", name: "Berserk", description: "+40% damage, +30% attack speed and 10% lifesteal for 6s.", cooldownMs: 40_000, effects: [{ type: "buff", durationMs: 6_000, damageMult: 1.4, attackSpeedMult: 1.3, lifesteal: 0.1 }] },
    isStarter: true,
    color: 0xf97316,
  },
  {
    key: "assassin",
    name: "Assassin",
    class: "ASSASSIN",
    rarity: "RARE",
    description: "Fragile, fast and deadly. Lives for critical strikes.",
    attack: "melee",
    projectileSpeed: 0,
    base: { hp: 440, damage: 56, armor: 10, speed: 350, attackSpeed: 1.7, critChance: 0.22, range: 95, hpPerLevel: 18, damagePerLevel: 2.6, armorPerLevel: 0.4 },
    skill: { key: "shadow_step", name: "Shadow Step", description: "Blink forward and strike enemies where you land.", cooldownMs: 7_000, effects: [{ type: "blink", distance: 340, damageMult: 1.8, radius: 110 }] },
    ultimate: { key: "vanish", name: "Vanish", description: "Turn invisible, +35% speed and +60% damage for 5s.", cooldownMs: 45_000, effects: [{ type: "buff", durationMs: 5_000, speedMult: 1.35, damageMult: 1.6, invisible: true }] },
    isStarter: false,
    color: 0xa855f7,
  },
  {
    key: "tank",
    name: "Tank",
    class: "TANK",
    rarity: "UNCOMMON",
    description: "A walking fortress that shrugs off damage.",
    attack: "melee",
    projectileSpeed: 0,
    base: { hp: 900, damage: 38, armor: 40, speed: 265, attackSpeed: 0.95, critChance: 0.05, range: 120, hpPerLevel: 38, damagePerLevel: 1.6, armorPerLevel: 1.4 },
    skill: { key: "ground_slam", name: "Ground Slam", description: "Slam the ground damaging nearby enemies.", cooldownMs: 7_000, effects: [{ type: "aoe", radius: 220, damageMult: 1.3 }] },
    ultimate: { key: "fortress", name: "Fortress", description: "Double armor and heal 30% HP.", cooldownMs: 45_000, effects: [{ type: "buff", durationMs: 7_000, armorMult: 2 }, { type: "heal", fraction: 0.3 }] },
    isStarter: true,
    color: 0x22c55e,
  },
  {
    key: "ranger",
    name: "Ranger",
    class: "RANGER",
    rarity: "COMMON",
    description: "Keeps enemies at bay with long range arrows.",
    attack: "projectile",
    projectileSpeed: 980,
    base: { hp: 480, damage: 42, armor: 12, speed: 315, attackSpeed: 1.45, critChance: 0.12, range: 720, hpPerLevel: 20, damagePerLevel: 2.0, armorPerLevel: 0.5 },
    skill: { key: "multishot", name: "Multishot", description: "Fire a fan of five arrows.", cooldownMs: 6_500, effects: [{ type: "multishot", count: 5, spread: 0.55, damageMult: 0.9, speed: 1_050 }] },
    ultimate: { key: "hawk_eye", name: "Hawk Eye", description: "+50% attack speed and +20% crit for 6s.", cooldownMs: 40_000, effects: [{ type: "buff", durationMs: 6_000, attackSpeedMult: 1.5, damageMult: 1.2 }] },
    isStarter: true,
    color: 0x38bdf8,
  },
  {
    key: "mage",
    name: "Mage",
    class: "MAGE",
    rarity: "EPIC",
    description: "Commands arcane fire. Huge burst from afar.",
    attack: "projectile",
    projectileSpeed: 760,
    base: { hp: 430, damage: 62, armor: 8, speed: 300, attackSpeed: 1.0, critChance: 0.1, range: 640, hpPerLevel: 17, damagePerLevel: 3.0, armorPerLevel: 0.35 },
    skill: { key: "nova", name: "Frost Nova", description: "Blast of arcane energy around you.", cooldownMs: 6_000, effects: [{ type: "aoe", radius: 200, damageMult: 1.7 }] },
    ultimate: { key: "meteor", name: "Meteor", description: "Call down a meteor at your aim point.", cooldownMs: 38_000, effects: [{ type: "meteor", radius: 260, damageMult: 4.5, delayMs: 700, range: 650 }] },
    isStarter: false,
    color: 0xe879f9,
  },
];

export function getCharacterDef(key: string): CharacterDef {
  const def = CHARACTERS.find((c) => c.key === key);
  if (!def) throw new Error(`Unknown character ${key}`);
  return def;
}
