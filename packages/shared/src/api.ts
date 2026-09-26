// DTOs returned by the REST API. BigInt values are serialised as decimal strings.
import type {
  AdminRole,
  Asset,
  CharacterClass,
  DepositStatus,
  ItemType,
  PremiumTier,
  ProductCategory,
  Rarity,
  StatKey,
  TransactionType,
  WithdrawalStatus,
} from "./enums";
import type { CombatStats, ItemStats } from "./stats";
import type { ProductMetadata } from "./products";

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface MeDto {
  id: string;
  username: string;
  isGuest: boolean;
  premiumTier: PremiumTier;
  premiumUntil: string | null;
  wallets: { address: string; isPrimary: boolean }[];
  adminRole: AdminRole | null;
  balances: BalancesDto;
  createdAt: string;
}

export interface BalancesDto {
  gold: string;
  gems: string;
  cryptoSpendable: string;
  cryptoReward: string;
  /** Token decimals for formatting crypto balances. */
  cryptoDecimals: number;
  cryptoSymbol: string;
}

export interface SkillDto {
  key: string;
  name: string;
  description: string;
  cooldownMs: number;
}

export interface CharacterDto {
  key: string;
  name: string;
  class: CharacterClass;
  rarity: Rarity;
  description: string;
  skill: SkillDto;
  ultimate: SkillDto;
  base: CombatStats;
  owned: boolean;
  isStarter: boolean;
  unlockProduct: { sku: string; price: string; currency: Asset } | null;
  progress: {
    userCharacterId: string;
    level: number;
    xp: number;
    xpIntoLevel: number;
    xpForNext: number;
    statPoints: number;
    upgrades: Record<StatKey, number>;
    upgradeCosts: Record<StatKey, string>;
    stats: CombatStats;
  } | null;
}

export interface ItemDto {
  key: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: Rarity;
  stats: ItemStats;
  stackable: boolean;
  maxUpgrade: number;
  levelRequirement: number;
}

export interface InventoryItemDto {
  id: string;
  item: ItemDto;
  quantity: number;
  upgradeLevel: number;
  equipped: boolean;
  equippedSlot: string | null;
  effectiveStats: ItemStats;
  nextUpgradeCost: string | null;
  acquiredAt: string;
}

export interface ShopProductDto {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: ProductCategory;
  price: string;
  currency: Asset;
  rarity: Rarity;
  metadata: ProductMetadata;
  owned?: boolean;
}

export interface LedgerEntryDto {
  id: string;
  type: TransactionType;
  asset: Asset;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  balanceAfter: string;
  reference: string | null;
  account: string;
  createdAt: string;
}

export interface DepositDto {
  id: string;
  amount: string;
  status: DepositStatus;
  signature: string | null;
  failureReason: string | null;
  createdAt: string;
  explorerUrl: string | null;
}

export interface WithdrawalDto {
  id: string;
  amount: string;
  fee: string;
  walletAddress: string;
  status: WithdrawalStatus;
  requiresReview: boolean;
  signature: string | null;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
  explorerUrl: string | null;
}

export interface WalletInfoDto {
  network: string;
  mint: string | null;
  symbol: string;
  decimals: number;
  treasury: string | null;
  wallets: { address: string; isPrimary: boolean; verifiedAt: string }[];
  balances: BalancesDto;
  limits: {
    minWithdrawal: string;
    maxWithdrawal: string;
    dailyLimit: string;
    withdrawnToday: string;
    fee: string;
    cooldownSeconds: number;
    nextWithdrawalAt: string | null;
    minAccountAgeHours: number;
  };
  deposits: DepositDto[];
  withdrawals: WithdrawalDto[];
}

export interface LeaderboardRowDto {
  rank: number;
  userId: string;
  username: string;
  kills: number;
  xp: number;
  wins: number;
  arenaScore: number;
  score: number;
}

export interface LeaderboardDto {
  scope: string;
  periodKey: string;
  rows: LeaderboardRowDto[];
  me: LeaderboardRowDto | null;
}

export interface QuestDto {
  key: string;
  name: string;
  description: string;
  period: string;
  objective: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  locked: boolean;
  rewards: { gold: string; gems: string; xp: number; crypto: string };
}
