-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "PremiumTier" AS ENUM ('FREE', 'VIP', 'ELITE');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NoncePurpose" AS ENUM ('LOGIN', 'LINK_WALLET');

-- CreateEnum
CREATE TYPE "CharacterClass" AS ENUM ('WARRIOR', 'ASSASSIN', 'TANK', 'RANGER', 'MAGE');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "StatKey" AS ENUM ('HP', 'DAMAGE', 'ARMOR', 'SPEED', 'ATTACK_SPEED', 'CRIT_CHANCE');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('WEAPON', 'ARMOR', 'HELMET', 'BOOTS', 'RING', 'AMULET', 'SKIN', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "ItemSource" AS ENUM ('LOOT', 'SHOP', 'QUEST', 'ADMIN', 'STARTER', 'REWARD');

-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('CASUAL', 'RANKED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('WAITING', 'RUNNING', 'ENDED');

-- CreateEnum
CREATE TYPE "QuestPeriod" AS ENUM ('DAILY', 'WEEKLY', 'SEASONAL', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "QuestObjective" AS ENUM ('KILL_NPC', 'KILL_PLAYER', 'COLLECT_RESOURCE', 'OPEN_CHEST', 'PLAY_MATCH', 'WIN_MATCH', 'REACH_LEVEL', 'DEAL_DAMAGE');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "LeaderboardScope" AS ENUM ('GLOBAL', 'DAILY', 'WEEKLY', 'SEASON');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('CHARACTER', 'SKIN', 'WEAPON', 'EQUIPMENT', 'BOOST', 'PREMIUM_PASS', 'COSMETIC', 'GEMS', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "Asset" AS ENUM ('GOLD', 'GEMS', 'CRYPTO');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('COMPLETED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AccountOwner" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('GOLD', 'GEMS', 'CRYPTO_SPENDABLE', 'CRYPTO_REWARD', 'SYSTEM_ISSUANCE', 'SYSTEM_REVENUE', 'SYSTEM_EXTERNAL', 'SYSTEM_REWARD_POOL', 'SYSTEM_WITHDRAWAL_CLEARING', 'SYSTEM_FEES');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'GAME_REWARD', 'PURCHASE', 'ITEM_UPGRADE', 'CHARACTER_UPGRADE', 'WITHDRAWAL', 'WITHDRAWAL_FEE', 'REFUND', 'ADMIN_ADJUSTMENT', 'POOL_FUNDING');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('POSTED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('AWAITING_SIGNATURE', 'SUBMITTED', 'CREDITED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChainTxKind" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "ChainTxStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'FINALIZED', 'FAILED');

-- CreateEnum
CREATE TYPE "RewardSource" AS ENUM ('KILL', 'QUEST', 'LEADERBOARD', 'DAILY', 'SEASONAL', 'TOURNAMENT', 'ACHIEVEMENT', 'EVENT');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('GRANTED', 'CAPPED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClaimKind" AS ENUM ('QUEST', 'DAILY_LOGIN', 'LEADERBOARD', 'SEASON');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SUPPORT');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('ADMIN', 'SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "ComplianceFeature" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'CRYPTO_REWARDS', 'PURCHASE', 'PLAY');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "banReason" TEXT,
    "premiumTier" "PremiumTier" NOT NULL DEFAULT 'FREE',
    "premiumUntil" TIMESTAMP(3),
    "withdrawalsSuspended" BOOLEAN NOT NULL DEFAULT false,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "countryCode" VARCHAR(2),
    "ageVerified" BOOLEAN NOT NULL DEFAULT false,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'NONE',
    "inventorySlots" INTEGER NOT NULL DEFAULT 60,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletNonce" (
    "id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "purpose" "NoncePurpose" NOT NULL,
    "userId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "walletId" UUID,
    "signature" TEXT NOT NULL,
    "kind" "ChainTxKind" NOT NULL,
    "network" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "slot" BIGINT,
    "status" "ChainTxStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" "CharacterClass" NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "description" TEXT NOT NULL,
    "skill" JSONB NOT NULL,
    "ultimate" JSONB NOT NULL,
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterStats" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "baseHp" INTEGER NOT NULL,
    "baseDamage" INTEGER NOT NULL,
    "baseArmor" INTEGER NOT NULL,
    "baseSpeed" INTEGER NOT NULL,
    "baseAttackSpeed" DOUBLE PRECISION NOT NULL,
    "baseCritChance" DOUBLE PRECISION NOT NULL,
    "baseRange" INTEGER NOT NULL,
    "hpPerLevel" INTEGER NOT NULL,
    "damagePerLevel" DOUBLE PRECISION NOT NULL,
    "armorPerLevel" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CharacterStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCharacter" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "statPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterUpgrade" (
    "id" UUID NOT NULL,
    "userCharacterId" UUID NOT NULL,
    "stat" "StatKey" NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterUpgrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ItemType" NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "stats" JSONB NOT NULL,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "maxStack" INTEGER NOT NULL DEFAULT 1,
    "maxUpgrade" INTEGER NOT NULL DEFAULT 20,
    "levelRequirement" INTEGER NOT NULL DEFAULT 1,
    "dropWeight" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "upgradeLevel" INTEGER NOT NULL DEFAULT 0,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "equippedSlot" TEXT,
    "source" "ItemSource" NOT NULL,
    "sourceRef" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMatch" (
    "id" UUID NOT NULL,
    "roomId" TEXT NOT NULL,
    "mode" "MatchMode" NOT NULL,
    "mapKey" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'WAITING',
    "seasonId" UUID,
    "maxPlayers" INTEGER NOT NULL,
    "tickRate" INTEGER NOT NULL,
    "winnerUserId" UUID,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMatchPlayer" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "userCharacterId" UUID NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "npcKills" INTEGER NOT NULL DEFAULT 0,
    "damageDealt" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "goldEarned" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "placement" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GameMatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quest" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "period" "QuestPeriod" NOT NULL,
    "objective" "QuestObjective" NOT NULL,
    "target" INTEGER NOT NULL,
    "rewardGold" BIGINT NOT NULL DEFAULT 0,
    "rewardGems" BIGINT NOT NULL DEFAULT 0,
    "rewardXp" INTEGER NOT NULL DEFAULT 0,
    "rewardCrypto" BIGINT NOT NULL DEFAULT 0,
    "requiredTier" "PremiumTier" NOT NULL DEFAULT 'FREE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "questId" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'UPCOMING',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "rewardPool" BIGINT NOT NULL,
    "dailyRewardBudget" BIGINT NOT NULL,
    "multiplierBps" INTEGER NOT NULL DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leaderboard" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" "LeaderboardScope" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "seasonId" UUID,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "rewardsDistributedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Leaderboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" UUID NOT NULL,
    "leaderboardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "npcKills" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "arenaScore" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopProduct" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "price" BIGINT NOT NULL,
    "currency" "Asset" NOT NULL,
    "rarity" "Rarity" NOT NULL DEFAULT 'COMMON',
    "metadata" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "perUserLimit" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL,
    "totalPrice" BIGINT NOT NULL,
    "currency" "Asset" NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'COMPLETED',
    "idempotencyKey" TEXT NOT NULL,
    "journalId" UUID NOT NULL,
    "refundJournalId" UUID,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceAccount" (
    "id" UUID NOT NULL,
    "ownerType" "AccountOwner" NOT NULL,
    "userId" UUID,
    "systemKey" TEXT,
    "asset" "Asset" NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerJournal" (
    "id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "adminUserId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceLedger" (
    "id" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "userId" UUID,
    "type" "TransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "asset" "Asset" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "reference" TEXT,
    "status" "LedgerStatus" NOT NULL DEFAULT 'POSTED',
    "balanceAfter" BIGINT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "network" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "recipient" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "signature" TEXT,
    "status" "DepositStatus" NOT NULL DEFAULT 'AWAITING_SIGNATURE',
    "failureReason" TEXT,
    "slot" BIGINT,
    "journalId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "reviewedByAdminId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "signature" TEXT,
    "lastValidBlockHeight" BIGINT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "holdJournalId" UUID NOT NULL,
    "settleJournalId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "source" "RewardSource" NOT NULL,
    "asset" "Asset" NOT NULL,
    "baseAmount" BIGINT NOT NULL,
    "performanceBps" INTEGER NOT NULL,
    "eventBps" INTEGER NOT NULL,
    "seasonBps" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "RewardStatus" NOT NULL,
    "reason" TEXT,
    "seasonId" UUID,
    "matchId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "journalId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardClaim" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "ClaimKind" NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "rewardId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "AdminRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "adminUserId" UUID,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntiCheatFlag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "matchId" UUID,
    "kind" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AntiCheatFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" UUID NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "feature" "ComplianceFeature" NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "requiresKyc" BOOLEAN NOT NULL DEFAULT false,
    "minAge" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletNonce_nonce_key" ON "WalletNonce"("nonce");

-- CreateIndex
CREATE INDEX "WalletNonce_address_createdAt_idx" ON "WalletNonce"("address", "createdAt");

-- CreateIndex
CREATE INDEX "WalletNonce_expiresAt_idx" ON "WalletNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_signature_key" ON "WalletTransaction"("signature");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Character_key_key" ON "Character"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterStats_characterId_key" ON "CharacterStats"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCharacter_userId_characterId_key" ON "UserCharacter"("userId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterUpgrade_userCharacterId_stat_key" ON "CharacterUpgrade"("userCharacterId", "stat");

-- CreateIndex
CREATE UNIQUE INDEX "Item_key_key" ON "Item"("key");

-- CreateIndex
CREATE INDEX "Item_type_rarity_idx" ON "Item"("type", "rarity");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sourceRef_key" ON "InventoryItem"("sourceRef");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_equipped_idx" ON "InventoryItem"("userId", "equipped");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_itemId_idx" ON "InventoryItem"("userId", "itemId");

-- CreateIndex
CREATE INDEX "GameMatch_status_idx" ON "GameMatch"("status");

-- CreateIndex
CREATE INDEX "GameMatch_createdAt_idx" ON "GameMatch"("createdAt");

-- CreateIndex
CREATE INDEX "GameMatchPlayer_userId_joinedAt_idx" ON "GameMatchPlayer"("userId", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameMatchPlayer_matchId_userId_key" ON "GameMatchPlayer"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Quest_key_key" ON "Quest"("key");

-- CreateIndex
CREATE INDEX "UserQuest_userId_periodKey_idx" ON "UserQuest"("userId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserQuest_userId_questId_periodKey_key" ON "UserQuest"("userId", "questId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "Season_key_key" ON "Season"("key");

-- CreateIndex
CREATE INDEX "Season_status_idx" ON "Season"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Leaderboard_key_key" ON "Leaderboard"("key");

-- CreateIndex
CREATE INDEX "Leaderboard_scope_periodKey_idx" ON "Leaderboard"("scope", "periodKey");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_leaderboardId_score_idx" ON "LeaderboardEntry"("leaderboardId", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_leaderboardId_userId_key" ON "LeaderboardEntry"("leaderboardId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopProduct_sku_key" ON "ShopProduct"("sku");

-- CreateIndex
CREATE INDEX "ShopProduct_active_category_idx" ON "ShopProduct"("active", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_idempotencyKey_key" ON "Purchase"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Purchase_userId_createdAt_idx" ON "Purchase"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_userId_productId_idx" ON "Purchase"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceAccount_systemKey_key" ON "BalanceAccount"("systemKey");

-- CreateIndex
CREATE INDEX "BalanceAccount_kind_idx" ON "BalanceAccount"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceAccount_userId_kind_key" ON "BalanceAccount"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerJournal_idempotencyKey_key" ON "LedgerJournal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerJournal_type_createdAt_idx" ON "LedgerJournal"("type", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerJournal_reference_idx" ON "LedgerJournal"("reference");

-- CreateIndex
CREATE INDEX "BalanceLedger_accountId_createdAt_idx" ON "BalanceLedger"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "BalanceLedger_userId_createdAt_idx" ON "BalanceLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BalanceLedger_journalId_idx" ON "BalanceLedger"("journalId");

-- CreateIndex
CREATE INDEX "BalanceLedger_type_createdAt_idx" ON "BalanceLedger"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_reference_key" ON "Deposit"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_signature_key" ON "Deposit"("signature");

-- CreateIndex
CREATE INDEX "Deposit_userId_createdAt_idx" ON "Deposit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Deposit_status_idx" ON "Deposit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_signature_key" ON "Withdrawal"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_idempotencyKey_key" ON "Withdrawal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Withdrawal_status_nextAttemptAt_idx" ON "Withdrawal"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_idempotencyKey_key" ON "Reward"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Reward_userId_createdAt_idx" ON "Reward"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Reward_asset_status_createdAt_idx" ON "Reward"("asset", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_userId_kind_referenceKey_key" ON "RewardClaim"("userId", "kind", "referenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_userId_key" ON "AdminUser"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AntiCheatFlag_userId_createdAt_idx" ON "AntiCheatFlag"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AntiCheatFlag_kind_createdAt_idx" ON "AntiCheatFlag"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRule_countryCode_feature_key" ON "ComplianceRule"("countryCode", "feature");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterStats" ADD CONSTRAINT "CharacterStats_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCharacter" ADD CONSTRAINT "UserCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCharacter" ADD CONSTRAINT "UserCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterUpgrade" ADD CONSTRAINT "CharacterUpgrade_userCharacterId_fkey" FOREIGN KEY ("userCharacterId") REFERENCES "UserCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMatch" ADD CONSTRAINT "GameMatch_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMatchPlayer" ADD CONSTRAINT "GameMatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "GameMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMatchPlayer" ADD CONSTRAINT "GameMatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMatchPlayer" ADD CONSTRAINT "GameMatchPlayer_userCharacterId_fkey" FOREIGN KEY ("userCharacterId") REFERENCES "UserCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuest" ADD CONSTRAINT "UserQuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuest" ADD CONSTRAINT "UserQuest_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leaderboard" ADD CONSTRAINT "Leaderboard_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_leaderboardId_fkey" FOREIGN KEY ("leaderboardId") REFERENCES "Leaderboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAccount" ADD CONSTRAINT "BalanceAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceLedger" ADD CONSTRAINT "BalanceLedger_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "LedgerJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceLedger" ADD CONSTRAINT "BalanceLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BalanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntiCheatFlag" ADD CONSTRAINT "AntiCheatFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Hand-written integrity guarantees (not expressible in Prisma schema)
-- ─────────────────────────────────────────────────────────────

-- Ledger rows and audit logs are append-only: corrections must be new compensating journals.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER balance_ledger_immutable
  BEFORE UPDATE OR DELETE ON "BalanceLedger"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER ledger_journal_immutable
  BEFORE UPDATE OR DELETE ON "LedgerJournal"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- TRUNCATE bypasses row triggers; block it too (test databases use migrate reset instead).
CREATE TRIGGER balance_ledger_no_truncate
  BEFORE TRUNCATE ON "BalanceLedger"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

ALTER TABLE "BalanceLedger" ADD CONSTRAINT balance_ledger_amount_positive CHECK (amount > 0);

-- User balances can never go negative; only designated system accounts may.
ALTER TABLE "BalanceAccount" ADD CONSTRAINT balance_account_non_negative
  CHECK ("allowNegative" OR balance >= 0);

ALTER TABLE "BalanceAccount" ADD CONSTRAINT balance_account_owner_shape
  CHECK (("ownerType" = 'USER' AND "userId" IS NOT NULL AND "systemKey" IS NULL)
      OR ("ownerType" = 'SYSTEM' AND "userId" IS NULL AND "systemKey" IS NOT NULL));

ALTER TABLE "Withdrawal" ADD CONSTRAINT withdrawal_amount_positive CHECK (amount > 0 AND fee >= 0);
ALTER TABLE "Deposit" ADD CONSTRAINT deposit_amount_positive CHECK (amount > 0);
ALTER TABLE "Purchase" ADD CONSTRAINT purchase_price_non_negative CHECK ("totalPrice" >= 0 AND quantity > 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT inventory_quantity_positive CHECK (quantity > 0 AND "upgradeLevel" >= 0);
ALTER TABLE "UserCharacter" ADD CONSTRAINT user_character_ranges CHECK (level BETWEEN 1 AND 50 AND xp >= 0 AND "statPoints" >= 0);

-- One equipped item per slot per user.
CREATE UNIQUE INDEX inventory_one_equipped_per_slot
  ON "InventoryItem" ("userId", "equippedSlot") WHERE equipped = true;

-- Only one active season at a time.
CREATE UNIQUE INDEX season_single_active ON "Season" ((status)) WHERE status = 'ACTIVE';
