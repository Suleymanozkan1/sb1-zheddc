import type { PremiumTier } from "./enums";

/**
 * What a shop product grants. Stored in ShopProduct.metadata and validated server-side.
 * Prices never live in code: they come from the ShopProduct table.
 */
export type ProductGrant =
  | { kind: "ITEM"; itemKey: string; quantity: number }
  | { kind: "CHARACTER"; characterKey: string }
  | { kind: "GEMS"; amount: number }
  | { kind: "GOLD"; amount: number }
  | { kind: "PREMIUM"; tier: Exclude<PremiumTier, "FREE">; days: number }
  | { kind: "INVENTORY_SLOTS"; amount: number };

export interface ProductMetadata {
  grants: ProductGrant[];
  /** Optional display hints for the UI. */
  icon?: string;
  highlight?: boolean;
}
