/** Additive stat bonuses carried by items (all optional). */
export interface ItemStats {
  damage?: number;
  armor?: number;
  hp?: number;
  speed?: number;
  critChance?: number;
  critDamage?: number;
  attackSpeed?: number;
  lifesteal?: number;
  range?: number;
}

export const ITEM_STAT_KEYS = [
  "damage",
  "armor",
  "hp",
  "speed",
  "critChance",
  "critDamage",
  "attackSpeed",
  "lifesteal",
  "range",
] as const satisfies readonly (keyof ItemStats)[];

/** Fully resolved combat stats of an in-arena entity. */
export interface CombatStats {
  maxHp: number;
  damage: number;
  armor: number;
  /** World units per second. */
  speed: number;
  /** Attacks per second. */
  attackSpeed: number;
  /** 0..1 */
  critChance: number;
  /** Crit multiplier, e.g. 1.5 */
  critDamage: number;
  /** 0..1 fraction of damage healed. */
  lifesteal: number;
  /** Attack range in world units. */
  range: number;
}
