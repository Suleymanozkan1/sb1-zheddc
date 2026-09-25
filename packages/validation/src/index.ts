// Zod schemas for every REST input. The API rejects anything that does not parse.
import { AdminRole, LeaderboardScope, MatchMode, StatKey } from "@cryptoarena/shared";
import { z } from "zod";

const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export const solanaAddress = z.string().trim().min(32).max(44).regex(base58, "invalid base58 address");
export const txSignature = z
  .string()
  .trim()
  .min(64)
  .max(120)
  .regex(/^(mock)?[1-9A-HJ-NP-Za-km-z]+$/, "invalid transaction signature");
export const walletSignature = z.string().trim().min(64).max(100).regex(base58, "invalid signature encoding");
export const uuid = z.string().uuid();
export const idempotencyKey = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/);
/** Human decimal token amount, e.g. "12.5". Converted to base units server-side. */
export const decimalAmount = z.string().trim().regex(/^\d{1,12}(\.\d{1,12})?$/, "invalid amount");
export const slug = z.string().trim().min(1).max(64).regex(/^[a-z0-9_]+$/);

export const nonceRequest = z.object({ address: solanaAddress, purpose: z.enum(["LOGIN", "LINK_WALLET"]).default("LOGIN") });
export const verifyRequest = z.object({ address: solanaAddress, nonce: z.string().min(16).max(64), signature: walletSignature });
export const walletConnectRequest = verifyRequest;

export const depositPrepareRequest = z.object({ amount: decimalAmount });
export const depositVerifyRequest = z.object({ depositId: uuid, signature: txSignature });
export const depositMockSendRequest = z.object({ depositId: uuid });
export const withdrawRequest = z.object({ amount: decimalAmount, walletAddress: solanaAddress, idempotencyKey });
export const withdrawCancelRequest = z.object({ withdrawalId: uuid });

export const inventoryItemRequest = z.object({ inventoryItemId: uuid });
export const itemUpgradeRequest = z.object({ inventoryItemId: uuid, idempotencyKey });
export const purchaseRequest = z.object({ sku: z.string().trim().min(1).max(64).regex(/^[a-z0-9_]+$/), quantity: z.number().int().min(1).max(100).default(1), idempotencyKey });
export const characterUnlockRequest = z.object({ characterKey: slug, sku: z.string().trim().max(64).regex(/^[a-z0-9_]+$/).optional(), idempotencyKey });
export const characterUpgradeRequest = z.object({ userCharacterId: uuid, stat: z.enum(StatKey), idempotencyKey });
export const questClaimRequest = z.object({ questKey: slug });
export const leaderboardQuery = z.object({ scope: z.enum(LeaderboardScope).default("GLOBAL"), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const gameTicketRequest = z.object({ userCharacterId: uuid, mode: z.enum(MatchMode).default("CASUAL") });

// Admin
export const adminListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export const adminReason = z.string().trim().min(5).max(500);
export const adminUserStatusRequest = z.object({ userId: uuid, status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]), reason: adminReason });
export const adminWithdrawalSuspendRequest = z.object({ userId: uuid, suspended: z.boolean(), reason: adminReason });
export const adminWithdrawalActionRequest = z.object({ withdrawalId: uuid, reason: adminReason });
export const adminRefundRequest = z.object({ purchaseId: uuid, reason: adminReason });
export const adminGrantItemRequest = z.object({ userId: uuid, itemKey: slug, quantity: z.number().int().min(1).max(100).default(1), reason: adminReason, requestId: idempotencyKey });
export const adminAdjustRequest = z.object({
  userId: uuid,
  account: z.enum(["GOLD", "GEMS", "CRYPTO_REWARD"]),
  /** Signed integer in base units, e.g. "-500". */
  delta: z.string().trim().regex(/^-?\d{1,20}$/),
  reason: adminReason,
  requestId: idempotencyKey,
});
export const adminFundPoolRequest = z.object({ amount: decimalAmount, reason: adminReason, requestId: idempotencyKey });
export const adminProductUpdateRequest = z.object({
  sku: z.string().trim().min(1).max(64),
  price: z.string().regex(/^\d{1,20}$/).optional(),
  active: z.boolean().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(500).optional(),
});
export const adminRoleRequest = z.object({ userId: uuid, role: z.enum(AdminRole).nullable(), reason: z.string().trim().max(500).optional() });
export const adminLeaderboardDistributeRequest = z.object({ key: z.string().min(3).max(64), totalReward: decimalAmount, reason: z.string().trim().max(500).optional() });
export const adminSeasonRequest = z.object({
  key: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(80),
  days: z.number().int().min(1).max(365),
  rewardPool: decimalAmount,
  dailyRewardBudget: decimalAmount,
  multiplierBps: z.number().int().min(0).max(30_000).default(10_000),
  reason: z.string().trim().max(500).optional(),
});

export type Infer<T extends z.ZodType> = z.infer<T>;
export { z };
