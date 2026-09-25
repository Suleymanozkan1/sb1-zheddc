// Type-safe realtime protocol between the Phaser client and the Colyseus game server.
// The client only ever sends INTENT (inputs); every outcome is decided by the server.

import type { MatchMode, Rarity } from "./enums";
import type { CombatStats } from "./stats";

export const ROOM_NAMES = {
  CASUAL: "arena_casual",
  RANKED: "arena_ranked",
} as const satisfies Record<MatchMode, string>;

/** Input button bitmask carried by `player_move`. */
export const Buttons = {
  ATTACK: 1,
  DASH: 2,
  SKILL: 4,
  ULTIMATE: 8,
} as const;

// ───────────── client → server ─────────────

export interface PlayerMoveInput {
  /** Monotonic input sequence number used for server acknowledgement / reconciliation. */
  seq: number;
  /** Desired movement direction; the server normalises it (|v| <= 1). */
  mx: number;
  my: number;
  /** Aim angle in radians. */
  aim: number;
  /** Bitmask of Buttons. */
  buttons: number;
}

export interface ClientMessages {
  player_move: PlayerMoveInput;
  pickup: { targetId?: string };
  buy_item: { sku: string };
  use_item: { inventoryItemId: string };
  equip_item: { inventoryItemId: string };
  ping: { t: number };
}
export type ClientMessageType = keyof ClientMessages;

// ───────────── server → client ─────────────

export interface KillFeedEntry {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  victimIsNpc: boolean;
}

export interface SelfStatsMessage {
  stats: CombatStats;
  /** Server timestamps (ms since room start) when each ability becomes ready. */
  cooldowns: { attack: number; dash: number; skill: number; ultimate: number };
  skillName: string;
  ultimateName: string;
  gold: number;
  potions: number;
  xp: number;
  xpForNext: number;
  xpIntoLevel: number;
}

export interface ServerMessages {
  welcome: { sessionId: string; userId: string; matchId: string; mode: MatchMode; serverTime: number; tickRate: number };
  pong: { t: number; serverTime: number };
  player_join: { id: string; name: string };
  player_leave: { id: string; name: string };
  player_attack: { id: string; aim: number; kind: "melee" | "projectile" | "skill" | "ultimate"; range: number };
  player_damage: { targetId: string; sourceId: string; amount: number; crit: boolean; hp: number };
  player_death: KillFeedEntry & { respawnAt: number };
  player_respawn: { id: string; x: number; y: number };
  player_level_up: { id: string; level: number };
  item_drop: { id: string; x: number; y: number; itemKey: string; rarity: Rarity };
  item_pickup: { id: string; itemKey: string; name: string; rarity: Rarity; quantity: number; gold?: number };
  quest_complete: { questKey: string; name: string };
  reward_granted: { source: string; asset: "GOLD" | "GEMS" | "CRYPTO"; amount: string; reason?: string };
  self_stats: SelfStatsMessage;
  match_start: { mode: MatchMode; endsAt: number | null };
  match_end: { mode: MatchMode; standings: MatchStanding[] };
  notice: { level: "info" | "warn" | "error"; message: string };
}
export type ServerMessageType = keyof ServerMessages;

export interface MatchStanding {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  score: number;
  placement: number;
}

/** Options passed to joinOrCreate. The ticket is a short-lived JWT issued by the API. */
export interface JoinOptions {
  ticket: string;
}

/** Claims of the game ticket JWT (API → game server). */
export interface GameTicketClaims {
  sub: string; // userId
  uc: string; // userCharacterId
  mode: MatchMode;
  name: string;
}
