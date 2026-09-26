import type { ProductGrant, ProductMetadata } from "@cryptoarena/shared";
import { AppError } from "./errors";

const TIERS = new Set(["VIP", "ELITE"]);

function isPositiveInt(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max;
}

/** Validates ShopProduct.metadata JSON coming from the database/admin panel. */
export function parseProductMetadata(json: unknown): ProductMetadata {
  if (!json || typeof json !== "object") throw new AppError("INTERNAL", "Product metadata missing");
  const raw = json as { grants?: unknown; icon?: unknown; highlight?: unknown };
  if (!Array.isArray(raw.grants) || raw.grants.length === 0) throw new AppError("INTERNAL", "Product has no grants");
  const grants: ProductGrant[] = raw.grants.map((g: unknown) => {
    const x = g as Record<string, unknown>;
    switch (x.kind) {
      case "ITEM":
        if (typeof x.itemKey !== "string" || !isPositiveInt(x.quantity, 1000)) break;
        return { kind: "ITEM", itemKey: x.itemKey, quantity: x.quantity };
      case "CHARACTER":
        if (typeof x.characterKey !== "string") break;
        return { kind: "CHARACTER", characterKey: x.characterKey };
      case "GEMS":
      case "GOLD":
      case "INVENTORY_SLOTS":
      case "STASH_SLOTS":
        if (!isPositiveInt(x.amount, 10_000_000)) break;
        return { kind: x.kind, amount: x.amount };
      case "PREMIUM":
        if (typeof x.tier !== "string" || !TIERS.has(x.tier) || !isPositiveInt(x.days, 366)) break;
        return { kind: "PREMIUM", tier: x.tier as "VIP" | "ELITE", days: x.days };
    }
    throw new AppError("INTERNAL", `Invalid product grant: ${JSON.stringify(g)}`);
  });
  return {
    grants,
    icon: typeof raw.icon === "string" ? raw.icon : undefined,
    highlight: raw.highlight === true,
  };
}
