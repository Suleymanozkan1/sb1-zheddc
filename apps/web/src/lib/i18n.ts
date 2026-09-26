// Tiny i18n layer. English source strings are the keys (so untranslated text still reads well);
// `TR_UI` holds the Turkish copy. Game content (heroes, abilities, creatures, items, quests,
// products) is translated by its stable key, falling back to the server-provided English text.
import { useCallback } from "react";
import { useApp } from "./store";
import { TR_CONTENT, TR_UI } from "./i18n.tr";

export type Lang = "en" | "tr";
export const LANGS: readonly { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
];

export type Params = Record<string, string | number>;
export type TFunction = (text: string, params?: Params) => string;

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function translate(lang: Lang, text: string, params?: Params): string {
  return fill(lang === "tr" ? (TR_UI[text] ?? text) : text, params);
}

/** Outside React (Phaser scene, demo arena): uses the current language. */
export function t(text: string, params?: Params): string {
  return translate(useApp.getState().lang, text, params);
}

export function useT(): TFunction {
  const lang = useApp((s) => s.lang);
  return useCallback((text: string, params?: Params) => translate(lang, text, params), [lang]);
}

export type ContentKind = "char" | "charDesc" | "skill" | "skillDesc" | "npc" | "region" | "resource" | "item" | "itemDesc" | "product" | "productDesc" | "quest" | "questDesc" | "rarity" | "itemType" | "category" | "scope" | "period";

/** Game content by stable key, e.g. tc("skill", "whirlwind", "Whirlwind"). */
export function contentText(lang: Lang, kind: ContentKind, key: string, fallback: string): string {
  if (lang !== "tr") return fallback;
  return TR_CONTENT[`${kind}:${key}`] ?? itemName(kind, key) ?? fallback;
}

export function tc(kind: ContentKind, key: string, fallback: string): string {
  return contentText(useApp.getState().lang, kind, key, fallback);
}

export function useTc(): (kind: ContentKind, key: string, fallback: string) => string {
  const lang = useApp((s) => s.lang);
  return useCallback((kind: ContentKind, key: string, fallback: string) => contentText(lang, kind, key, fallback), [lang]);
}

/** Generated equipment names and descriptions ("blade_rare" → "Neon Kılıç"). */
function itemName(kind: ContentKind, key: string): string | undefined {
  const [noun, rarity] = key.split("_");
  if (kind === "itemDesc") return noun ? TR_CONTENT[`itemDesc:${noun}`] : undefined;
  if (kind !== "item") return undefined;
  const n = noun ? TR_CONTENT[`noun:${noun}`] : undefined;
  const r = rarity ? TR_CONTENT[`prefix:${rarity.toUpperCase()}`] : undefined;
  return n && r ? `${r} ${n}` : undefined;
}
