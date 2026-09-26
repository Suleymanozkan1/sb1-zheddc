import type { Rarity } from "@cryptoarena/shared";
import { RarityBadge } from "@cryptoarena/ui";
import { useTc } from "../lib/i18n";

/** Rarity badge with a translated label. */
export function RarityTag({ rarity }: { rarity: Rarity }) {
  const tc = useTc();
  return <RarityBadge rarity={rarity} label={tc("rarity", rarity, rarity)} />;
}
