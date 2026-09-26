import type { CharacterBase, CharacterDef, EquippedItemInput, MoverState, NpcDef, ResourceDef } from "@cryptoarena/game-core";
import type { CombatStats, PlayerMoveInput, Rarity, StatKey } from "@cryptoarena/shared";

export interface Buff {
  until: number;
  damageMult: number;
  armorMult: number;
  speedMult: number;
  attackSpeedMult: number;
  lifesteal: number;
  invisible: boolean;
}

export interface SimPlayer {
  id: string;
  userId: string;
  userCharacterId: string | null;
  isBot: boolean;
  name: string;
  characterKey: string;
  def: CharacterDef;
  base: CharacterBase;
  upgrades: Partial<Record<StatKey, number>>;
  equipped: EquippedItemInput[];
  stats: CombatStats;
  level: number;
  /** Total character XP (DB value at join + earned in this session). */
  xp: number;
  x: number;
  y: number;
  mover: MoverState;
  aim: number;
  hp: number;
  alive: boolean;
  respawnAt: number;
  spawnProtectedUntil: number;
  lastSeq: number;
  /** Sequence number of the last input actually simulated (acknowledged to the client). */
  ackSeq: number;
  inputQueue: PlayerMoveInput[];
  /** Simulation-time budget (ms): a player can never process more input steps than real time allows. */
  stepBudgetMs: number;
  moveX: number;
  moveY: number;
  buttons: number;
  nextAttackAt: number;
  nextDashAt: number;
  nextSkillAt: number;
  nextUltAt: number;
  buffs: Buff[];
  lastHitBy: string | null;
  lastHitAt: number;
  kills: number;
  deaths: number;
  npcKills: number;
  damageDealt: number;
  score: number;
  xpBoostUntil: number;
  tint: number;
  /** Consecutive fixed steps without a queued input (used to detect stalled clients). */
  idleSteps: number;
}

export interface SimNpc {
  id: string;
  def: NpcDef;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  aim: number;
  hp: number;
  maxHp: number;
  state: "idle" | "wander" | "chase" | "flee" | "return";
  stateUntil: number;
  targetId: string | null;
  wanderX: number;
  wanderY: number;
  nextAttackAt: number;
  awake: boolean;
  /** Damage dealt by each player (for boss rewards). */
  damageBy: Map<string, number>;
}

export interface SimProjectile {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damageMult: number;
  expiresAt: number;
  bornAt: number;
  kind: "arrow" | "bolt";
  hit: Set<string>;
  pierce: boolean;
}

export interface SimLoot {
  id: string;
  itemKey: string;
  rarity: Rarity;
  name: string;
  x: number;
  y: number;
  ownerUserId: string | null;
  ownerUntil: number;
  expiresAt: number;
  /** Set while the pickup is being persisted, so it cannot be picked up twice. */
  claimedBy: string | null;
}

export interface SimResource {
  id: string;
  def: ResourceDef;
  x: number;
  y: number;
}

export interface PendingMeteor {
  ownerId: string;
  x: number;
  y: number;
  at: number;
  radius: number;
  damageMult: number;
}

export type Killer = { kind: "player"; player: SimPlayer } | { kind: "npc"; npc: SimNpc } | { kind: "none" };

/** Callbacks from the simulation to the room (network + persistence). */
export interface SimEvents {
  attack(p: SimPlayer, kind: "melee" | "projectile" | "skill" | "ultimate", range: number): void;
  damage(targetId: string, x: number, y: number, sourceId: string, amount: number, crit: boolean, hp: number): void;
  playerKilled(victim: SimPlayer, killer: Killer): void;
  npcKilled(npc: SimNpc, killer: SimPlayer): void;
  respawn(p: SimPlayer): void;
  levelUp(p: SimPlayer): void;
  xpGained(p: SimPlayer, amount: number): void;
  goldGained(p: SimPlayer, amount: number): void;
  resourceCollected(p: SimPlayer, r: SimResource): void;
  entityAdded(kind: EntityKind, id: string): void;
  entityRemoved(kind: EntityKind, id: string): void;
  lootSpawned(loot: SimLoot): void;
  statsChanged(p: SimPlayer): void;
  suspicious(p: SimPlayer, kind: string, severity: number, details: Record<string, unknown>): void;
}

export type EntityKind = "player" | "npc" | "projectile" | "loot" | "resource";
