import { formatInt, formatToken } from "@cryptoarena/ui";
import type { Asset, BalancesDto } from "@cryptoarena/shared";
import { t } from "./i18n";

export function price(amount: string, currency: Asset, b: Pick<BalancesDto, "cryptoDecimals" | "cryptoSymbol"> | undefined): string {
  if (currency === "CRYPTO") return `${formatToken(amount, b?.cryptoDecimals ?? 6)} ${b?.cryptoSymbol ?? "ARENA"}`;
  return `${formatInt(amount)} ${currency === "GOLD" ? t("Gold") : t("Gems")}`;
}

export const CURRENCY_ICON: Record<Asset, string> = { GOLD: "🪙", GEMS: "💎", CRYPTO: "◎" };
