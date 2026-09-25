// String-literal "enums" shared by browser and server code.
// They mirror the Prisma enums in prisma/schema.prisma (kept erasable: no TS `enum`).

export const Rarity = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"] as const;
export type Rarity = (typeof Rarity)[number];

export const ItemType = ["WEAPON", "ARMOR", "HELMET", "BOOTS", "RING", "AMULET", "SKIN", "CONSUMABLE"] as const;
export type ItemType = (typeof ItemType)[number];

export const EquipSlots = ["WEAPON", "ARMOR", "HELMET", "BOOTS", "RING", "AMULET"] as const;
export type EquipSlot = (typeof EquipSlots)[number];

export const CharacterClass = ["WARRIOR", "ASSASSIN", "TANK", "RANGER", "MAGE"] as const;
export type CharacterClass = (typeof CharacterClass)[number];

export const StatKey = ["HP", "DAMAGE", "ARMOR", "SPEED", "ATTACK_SPEED", "CRIT_CHANCE"] as const;
export type StatKey = (typeof StatKey)[number];

export const Asset = ["GOLD", "GEMS", "CRYPTO"] as const;
export type Asset = (typeof Asset)[number];

export const MatchMode = ["CASUAL", "RANKED"] as const;
export type MatchMode = (typeof MatchMode)[number];

export const PremiumTier = ["FREE", "VIP", "ELITE"] as const;
export type PremiumTier = (typeof PremiumTier)[number];

export const ProductCategory = [
  "CHARACTER",
  "SKIN",
  "WEAPON",
  "EQUIPMENT",
  "BOOST",
  "PREMIUM_PASS",
  "COSMETIC",
  "GEMS",
  "CONSUMABLE",
] as const;
export type ProductCategory = (typeof ProductCategory)[number];

export const TransactionType = [
  "DEPOSIT",
  "GAME_REWARD",
  "PURCHASE",
  "ITEM_UPGRADE",
  "CHARACTER_UPGRADE",
  "WITHDRAWAL",
  "WITHDRAWAL_FEE",
  "REFUND",
  "ADMIN_ADJUSTMENT",
  "POOL_FUNDING",
] as const;
export type TransactionType = (typeof TransactionType)[number];

export const WithdrawalStatus = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type WithdrawalStatus = (typeof WithdrawalStatus)[number];

export const DepositStatus = ["AWAITING_SIGNATURE", "SUBMITTED", "CREDITED", "FAILED", "EXPIRED"] as const;
export type DepositStatus = (typeof DepositStatus)[number];

export const LeaderboardScope = ["GLOBAL", "DAILY", "WEEKLY", "SEASON"] as const;
export type LeaderboardScope = (typeof LeaderboardScope)[number];

export const AdminRole = ["SUPER_ADMIN", "ADMIN", "MODERATOR", "SUPPORT"] as const;
export type AdminRole = (typeof AdminRole)[number];

export const QuestObjective = [
  "KILL_NPC",
  "KILL_PLAYER",
  "COLLECT_RESOURCE",
  "OPEN_CHEST",
  "PLAY_MATCH",
  "WIN_MATCH",
  "REACH_LEVEL",
  "DEAL_DAMAGE",
] as const;
export type QuestObjective = (typeof QuestObjective)[number];

export const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: "#9ca3af",
  UNCOMMON: "#4ade80",
  RARE: "#38bdf8",
  EPIC: "#c084fc",
  LEGENDARY: "#fbbf24",
  MYTHIC: "#f43f5e",
};
