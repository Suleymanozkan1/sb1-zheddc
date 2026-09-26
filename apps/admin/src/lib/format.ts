import type { Asset } from "@cryptoarena/shared";
import { formatInt, formatToken } from "@cryptoarena/ui";
import type { TokenMeta } from "./session";

export function money(amount: string | null | undefined, asset: Asset | "CRYPTO_REWARD" | "CRYPTO_SPENDABLE", t: TokenMeta): string {
  const v = amount ?? "0";
  if (asset === "GOLD") return `${formatInt(v)} Gold`;
  if (asset === "GEMS") return `${formatInt(v)} Gems`;
  return `${formatToken(v, t.decimals)} ${t.symbol}`;
}

export function dt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
}

export function json(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** Is a string a canonical UUID (the server only matches uuid searches on some endpoints)? */
export const isUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
