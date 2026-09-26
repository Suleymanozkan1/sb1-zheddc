// Response shapes of /api/admin/*. These are raw Prisma rows serialized to JSON:
// BigInt → decimal string, DateTime → ISO string, Json → unknown.
import type {
  AdminRole,
  Asset,
  CharacterClass,
  DepositStatus,
  ItemType,
  LeaderboardScope,
  MatchMode,
  ProductCategory,
  Rarity,
  TransactionType,
  WithdrawalStatus,
} from "@cryptoarena/shared";

export type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";
export type AdjustAccount = "GOLD" | "GEMS" | "CRYPTO_REWARD";
export type RewardStatus = "GRANTED" | "CAPPED" | "REJECTED";
export type MatchStatus = "WAITING" | "RUNNING" | "ENDED";
export type PurchaseStatus = "COMPLETED" | "REFUNDED";

export interface ListParams {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface Overview {
  users: number;
  activeMatches: number;
  pendingWithdrawals: number;
  reviewWithdrawals: number;
  deposits24h: { count: number; amount: string };
  cryptoRewards24h: { count: number; amount: string };
  antiCheatFlags24h: number;
  rewardPoolBalance: string;
  ledgerImbalance: Record<string, string>;
  network: string;
  decimals: number;
  symbol: string;
}

export interface AdminUserRow {
  id: string;
  userId: string;
  role: AdminRole;
  active: boolean;
  createdById: string | null;
  createdAt: string;
}

export interface WalletBase {
  id: string;
  userId: string;
  address: string;
  chain: string;
  isPrimary: boolean;
  verifiedAt: string;
  createdAt: string;
}

export interface UserBase {
  id: string;
  username: string;
  isGuest: boolean;
  status: UserStatus;
  banReason: string | null;
  premiumTier: string;
  premiumUntil: string | null;
  withdrawalsSuspended: boolean;
  riskScore: number;
  countryCode: string | null;
  ageVerified: boolean;
  kycStatus: string;
  inventorySlots: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserListRow extends UserBase {
  wallets: WalletBase[];
  admin: AdminUserRow | null;
}

type UserRef = { user: { username: string } };
type UserRiskRef = { user: { username: string; riskScore: number } };

export interface WalletRow extends WalletBase, UserRef {}

export interface DepositBase {
  id: string;
  userId: string;
  walletId: string;
  network: string;
  mint: string;
  amount: string;
  recipient: string;
  reference: string;
  signature: string | null;
  status: DepositStatus;
  failureReason: string | null;
  slot: string | null;
  journalId: string | null;
  expiresAt: string;
  creditedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface DepositRow extends DepositBase, UserRef {}

export interface WithdrawalBase {
  id: string;
  userId: string;
  walletAddress: string;
  network: string;
  mint: string;
  amount: string;
  fee: string;
  status: WithdrawalStatus;
  requiresReview: boolean;
  reviewNote: string | null;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  signature: string | null;
  attempts: number;
  lastError: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface WithdrawalRow extends WithdrawalBase, UserRiskRef {}

export interface RewardRow extends UserRef {
  id: string;
  userId: string;
  source: string;
  asset: Asset;
  baseAmount: string;
  performanceBps: number;
  eventBps: number;
  seasonBps: number;
  amount: string;
  status: RewardStatus;
  reason: string | null;
  seasonId: string | null;
  matchId: string | null;
  createdAt: string;
}

export interface ItemRow {
  id: string;
  key: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: Rarity;
  stats: unknown;
  stackable: boolean;
  maxStack: number;
  maxUpgrade: number;
  levelRequirement: number;
  dropWeight: number;
  active: boolean;
  createdAt: string;
}

export interface CharacterBase {
  id: string;
  key: string;
  name: string;
  class: CharacterClass;
  rarity: Rarity;
  description: string;
  isStarter: boolean;
  active: boolean;
  createdAt: string;
}
export interface CharacterRow extends CharacterBase {
  stats: {
    baseHp: number;
    baseDamage: number;
    baseArmor: number;
    baseSpeed: number;
    baseAttackSpeed: number;
    baseCritChance: number;
    baseRange: number;
  } | null;
  _count: { userCharacters: number };
}

export interface ProductBase {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: ProductCategory;
  price: string;
  currency: Asset;
  rarity: Rarity;
  metadata: unknown;
  active: boolean;
  perUserLimit: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface ProductRow extends ProductBase {
  _count?: { purchases: number };
}

export interface PurchaseBase {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  currency: Asset;
  status: PurchaseStatus;
  journalId: string;
  refundJournalId: string | null;
  refundedAt: string | null;
  createdAt: string;
  product: ProductBase;
}
export interface PurchaseRow extends PurchaseBase, UserRef {}

export interface SeasonRow {
  id: string;
  key: string;
  name: string;
  status: "UPCOMING" | "ACTIVE" | "ENDED";
  startsAt: string;
  endsAt: string;
  rewardPool: string;
  dailyRewardBudget: string;
  multiplierBps: number;
  createdAt: string;
}

export interface LeaderboardRow {
  id: string;
  key: string;
  scope: LeaderboardScope;
  periodKey: string;
  seasonId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  finalizedAt: string | null;
  rewardsDistributedAt: string | null;
  createdAt: string;
  _count: { entries: number };
}

export interface RoomRow {
  id: string;
  roomId: string;
  mode: MatchMode;
  mapKey: string;
  status: MatchStatus;
  seasonId: string | null;
  maxPlayers: number;
  tickRate: number;
  winnerUserId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  _count: { players: number };
}

export interface LedgerRow {
  id: string;
  journalId: string;
  accountId: string;
  userId: string | null;
  type: TransactionType;
  amount: string;
  asset: Asset;
  direction: "DEBIT" | "CREDIT";
  reference: string | null;
  status: string;
  balanceAfter: string;
  metadata: unknown;
  createdAt: string;
  account: { kind: string; systemKey: string | null };
}

export interface AuditRow {
  id: string;
  actorType: "ADMIN" | "SYSTEM" | "USER";
  adminUserId: string | null;
  userId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AntiCheatBase {
  id: string;
  userId: string;
  matchId: string | null;
  kind: string;
  severity: number;
  details: unknown;
  createdAt: string;
}
export interface AntiCheatRow extends AntiCheatBase, UserRiskRef {}

export interface UserDetail {
  user: UserBase & {
    wallets: WalletBase[];
    admin: AdminUserRow | null;
    characters: {
      id: string;
      characterId: string;
      level: number;
      xp: number;
      statPoints: number;
      createdAt: string;
      character: CharacterBase;
    }[];
    antiCheatFlags: AntiCheatBase[];
    purchases: PurchaseBase[];
    withdrawals: WithdrawalBase[];
    deposits: DepositBase[];
    inventory: {
      id: string;
      itemId: string;
      quantity: number;
      upgradeLevel: number;
      equipped: boolean;
      equippedSlot: string | null;
      source: string;
      acquiredAt: string;
      item: ItemRow;
    }[];
  };
  /** Base units as decimal strings (no decimals/symbol — use the overview's). */
  balances: { gold: string; gems: string; cryptoSpendable: string; cryptoReward: string };
}
