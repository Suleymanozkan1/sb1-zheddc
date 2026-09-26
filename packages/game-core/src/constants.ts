export const WORLD_SIZE = 10_000;
export const PLAYER_RADIUS = 26;
export const MAX_LEVEL = 50;
export const STAT_POINTS_PER_LEVEL = 2;
export const MAX_STAT_POINTS_PER_STAT = 30;
export const MAX_ITEM_UPGRADE = 20;

export const DASH_DISTANCE = 260;
export const DASH_DURATION_MS = 140;
export const DASH_COOLDOWN_MS = 2_500;

export const RESPAWN_DELAY_MS = 4_000;
export const SPAWN_PROTECTION_MS = 2_500;
export const PICKUP_RADIUS = 90;
export const MERCHANT_RADIUS = 220;
export const PROJECTILE_RADIUS = 10;
export const PROJECTILE_LIFETIME_MS = 1_600;

/** Radius (world units) around a player inside which entities are replicated to that client. */
export const VIEW_RADIUS_X = 1_300;
export const VIEW_RADIUS_Y = 900;

/** Anti-cheat: max inputs accepted per second per client (client sends one per 60 Hz frame). */
export const MAX_INPUTS_PER_SECOND = 75;
export const MAX_INPUT_QUEUE = 12;

/** Hard caps so no item/upgrade combination can produce absurd values. */
export const STAT_CAPS = {
  speed: 520,
  attackSpeed: 4,
  critChance: 0.75,
  critDamage: 3.5,
  lifesteal: 0.3,
  range: 900,
} as const;
