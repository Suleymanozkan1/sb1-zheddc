// Synchronised room state (Colyseus schema v5 builder API, no decorators).
// Entity maps are `.view()`-tagged: each client only receives entities its StateView
// contains (interest management), so a 10,000×10,000 world stays cheap to replicate.

import { schema, t, type SchemaType } from "@colyseus/schema";

export const PlayerState = schema(
  {
    id: t.string(),
    name: t.string(),
    cls: t.string(),
    x: t.float32(),
    y: t.float32(),
    aim: t.angle(),
    hp: t.uint32(),
    maxHp: t.uint32(),
    level: t.uint8(),
    kills: t.uint16(),
    deaths: t.uint16(),
    score: t.uint32(),
    alive: t.boolean(),
    /** Last input sequence processed by the server (for client reconciliation). */
    ack: t.uint32(),
    /** Bitmask: 1 = invisible, 2 = buffed, 4 = spawn protected, 8 = dashing. */
    flags: t.uint8(),
    tint: t.uint32(),
    isBot: t.boolean(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const NpcState = schema(
  {
    kind: t.string(),
    x: t.float32(),
    y: t.float32(),
    aim: t.angle({ bits: 8 }),
    hp: t.uint32(),
    maxHp: t.uint32(),
  },
  "NpcState",
);
export type NpcState = SchemaType<typeof NpcState>;

/** Projectiles are sent once; clients extrapolate from (x, y, vx, vy, t0). */
export const ProjectileState = schema(
  {
    kind: t.string(),
    owner: t.string(),
    x: t.float32(),
    y: t.float32(),
    vx: t.float32(),
    vy: t.float32(),
    t0: t.float64(),
    ttl: t.uint16(),
  },
  "ProjectileState",
);
export type ProjectileState = SchemaType<typeof ProjectileState>;

export const LootState = schema(
  {
    itemKey: t.string(),
    name: t.string(),
    rarity: t.string(),
    x: t.float32(),
    y: t.float32(),
  },
  "LootState",
);
export type LootState = SchemaType<typeof LootState>;

export const ResourceState = schema(
  {
    kind: t.string(),
    x: t.float32(),
    y: t.float32(),
  },
  "ResourceState",
);
export type ResourceState = SchemaType<typeof ResourceState>;

export const ArenaState = schema(
  {
    mode: t.string(),
    phase: t.string(),
    phaseEndsAt: t.float64(),
    serverTime: t.float64(),
    worldSize: t.uint16(),
    mapSeed: t.uint32(),
    tickRate: t.uint8(),
    playerCount: t.uint8(),
    players: t.map(PlayerState).view(),
    npcs: t.map(NpcState).view(),
    projectiles: t.map(ProjectileState).view(),
    loot: t.map(LootState).view(),
    resources: t.map(ResourceState).view(),
  },
  "ArenaState",
);
export type ArenaState = SchemaType<typeof ArenaState>;
