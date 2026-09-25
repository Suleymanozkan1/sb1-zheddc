import type { BalancesDto, MatchMode, MeDto } from "@cryptoarena/shared";
import { create } from "zustand";

export type Screen = "landing" | "dashboard" | "game" | "characters" | "inventory" | "shop" | "wallet" | "leaderboard" | "quests" | "settings";

export interface Toast {
  id: number;
  kind: "info" | "success" | "error" | "reward";
  text: string;
}

export interface Settings {
  showFps: boolean;
  screenShake: boolean;
  showDamageNumbers: boolean;
  /** Bloom, vignette and dense particles. */
  highQuality: boolean;
}

interface AppState {
  me: MeDto | null;
  screen: Screen;
  selectedCharacterId: string | null;
  mode: MatchMode;
  toasts: Toast[];
  settings: Settings;
  setMe: (me: MeDto | null) => void;
  setBalances: (b: BalancesDto) => void;
  go: (s: Screen) => void;
  selectCharacter: (id: string) => void;
  setMode: (m: MatchMode) => void;
  toast: (kind: Toast["kind"], text: string) => void;
  dismiss: (id: number) => void;
  updateSettings: (s: Partial<Settings>) => void;
}

function loadSettings(): Settings {
  const fallback: Settings = { showFps: false, screenShake: true, showDamageNumbers: true, highQuality: true };
  try {
    const raw = localStorage.getItem("ca.settings");
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Settings>) } : fallback;
  } catch {
    return fallback;
  }
}

let toastId = 0;

export const useApp = create<AppState>((set, get) => ({
  me: null,
  screen: "landing",
  selectedCharacterId: (() => {
    try {
      return localStorage.getItem("ca.character");
    } catch {
      return null;
    }
  })(),
  mode: "CASUAL",
  toasts: [],
  settings: loadSettings(),
  setMe: (me) => set({ me }),
  setBalances: (balances) => {
    const me = get().me;
    if (me) set({ me: { ...me, balances } });
  },
  go: (screen) => set({ screen }),
  selectCharacter: (id) => {
    try {
      localStorage.setItem("ca.character", id);
    } catch {
      /* storage unavailable */
    }
    set({ selectedCharacterId: id });
  },
  setMode: (mode) => set({ mode }),
  toast: (kind, text) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-4), { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === "error" ? 6000 : 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  updateSettings: (s) => {
    const settings = { ...get().settings, ...s };
    try {
      localStorage.setItem("ca.settings", JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
    set({ settings });
  },
}));

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}
