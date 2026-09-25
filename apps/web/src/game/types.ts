// Client-side view of the synchronised Colyseus state (decoded via reflection).
export interface MapLike<T> {
  get(key: string): T | undefined;
  forEach(cb: (value: T, key: string) => void): void;
  readonly size: number;
}

export interface PlayerView {
  id: string;
  name: string;
  cls: string;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
  level: number;
  kills: number;
  deaths: number;
  score: number;
  alive: boolean;
  ack: number;
  flags: number;
  tint: number;
  isBot: boolean;
}

export interface NpcView {
  kind: string;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
}

export interface ProjectileView {
  kind: string;
  owner: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  ttl: number;
}

export interface LootView {
  itemKey: string;
  name: string;
  rarity: string;
  x: number;
  y: number;
}

export interface ResourceView {
  kind: string;
  x: number;
  y: number;
}

export interface ArenaStateView {
  mode: string;
  phase: string;
  phaseEndsAt: number;
  serverTime: number;
  worldSize: number;
  mapSeed: number;
  tickRate: number;
  playerCount: number;
  players: MapLike<PlayerView>;
  npcs: MapLike<NpcView>;
  projectiles: MapLike<ProjectileView>;
  loot: MapLike<LootView>;
  resources: MapLike<ResourceView>;
}
