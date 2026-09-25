// HUD state bridge between the Phaser scene (writer) and React overlay (reader).
import type { KillFeedEntry, MatchStanding, SelfStatsMessage } from "@cryptoarena/shared";
import { create } from "zustand";

export interface FloatingNotice {
  id: number;
  text: string;
  color: string;
}

export interface MinimapDot {
  x: number;
  y: number;
  kind: "self" | "player" | "npc" | "boss";
}

export interface HudState {
  connected: boolean;
  error: string | null;
  hp: number;
  maxHp: number;
  level: number;
  alive: boolean;
  respawnAt: number;
  serverNow: number;
  self: SelfStatsMessage | null;
  kills: number;
  deaths: number;
  score: number;
  phase: string;
  phaseEndsAt: number;
  mode: string;
  killFeed: (KillFeedEntry & { id: number })[];
  notices: FloatingNotice[];
  standings: MatchStanding[] | null;
  scoreboard: { id: string; name: string; kills: number; deaths: number; score: number; level: number; isBot: boolean }[];
  minimap: MinimapDot[];
  worldSize: number;
  mapSeed: number;
  ping: number;
  fps: number;
  nearMerchant: boolean;
  region: string;
  regionKey: string;
  nearLoot: boolean;
  selfName: string;
  selfClass: string;
  selfColor: number;
  killedBy: string | null;
  /** Data URL of the local hero sprite for the HUD portrait. */
  portrait: string;
  set: (p: Partial<HudState>) => void;
  pushKill: (k: KillFeedEntry) => void;
  pushNotice: (text: string, color?: string) => void;
  reset: () => void;
}

let seq = 0;

const initial = {
  connected: false,
  error: null,
  hp: 0,
  maxHp: 1,
  level: 1,
  alive: true,
  respawnAt: 0,
  serverNow: 0,
  self: null,
  kills: 0,
  deaths: 0,
  score: 0,
  phase: "running",
  phaseEndsAt: 0,
  mode: "CASUAL",
  killFeed: [],
  notices: [],
  standings: null,
  scoreboard: [],
  minimap: [],
  worldSize: 10_000,
  mapSeed: 0,
  ping: 0,
  fps: 0,
  nearMerchant: false,
  region: "",
  regionKey: "",
  nearLoot: false,
  selfName: "",
  selfClass: "",
  selfColor: 0x22d3ee,
  killedBy: null,
  portrait: "",
} satisfies Omit<HudState, "set" | "pushKill" | "pushNotice" | "reset">;

export const useHud = create<HudState>((set, get) => ({
  ...initial,
  set: (p) => set(p),
  pushKill: (k) => {
    const id = ++seq;
    set({ killFeed: [...get().killFeed.slice(-5), { ...k, id }] });
    setTimeout(() => set({ killFeed: get().killFeed.filter((e) => e.id !== id) }), 7000);
  },
  pushNotice: (text, color = "#22d3ee") => {
    const id = ++seq;
    set({ notices: [...get().notices.slice(-4), { id, text, color }] });
    setTimeout(() => set({ notices: get().notices.filter((n) => n.id !== id) }), 3500);
  },
  reset: () => set({ ...initial }),
}));
