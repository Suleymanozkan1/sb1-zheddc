// Admin operations. Every mutation writes an AuditLog row in the same transaction;
// financial changes are ADMIN_ADJUSTMENT journals (never edits of existing ledger rows).

import type { AdminRole, Tx } from "@cryptoarena/database";
import { LogEvent, type Logger } from "@cryptoarena/observability";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { grantItem } from "./inventory";
import { postJournal, transfer } from "./ledger";
import { fundRewardPool } from "./rewards";

export const ROLE_RANK: Record<AdminRole, number> = { SUPPORT: 1, MODERATOR: 2, ADMIN: 3, SUPER_ADMIN: 4 };

export function hasRole(role: AdminRole, min: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface AdminActor {
  adminUserId: string;
  role: AdminRole;
  ip: string | null;
}

function requireRole(actor: AdminActor, min: AdminRole): void {
  if (!hasRole(actor.role, min)) throw new AppError("FORBIDDEN", `Requires ${min} role`);
}

export async function setUserStatus(tx: Tx, logger: Logger, actor: AdminActor, userId: string, status: "ACTIVE" | "SUSPENDED" | "BANNED", reason: string) {
  requireRole(actor, "MODERATOR");
  const before = await tx.user.findUnique({ where: { id: userId } });
  if (!before) throw new AppError("NOT_FOUND", "User not found");
  const target = await tx.adminUser.findUnique({ where: { userId } });
  if (target && ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) throw new AppError("FORBIDDEN", "Cannot change the status of an equal or higher admin");
  const after = await tx.user.update({ where: { id: userId }, data: { status, banReason: status === "ACTIVE" ? null : reason } });
  if (status !== "ACTIVE") await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit(tx, { actorType: "ADMIN", adminUserId: actor.adminUserId, userId, action: `USER_${status}`, targetType: "User", targetId: userId, before: { status: before.status }, after: { status }, reason, ip: actor.ip });
  logger.warn({ event: LogEvent.ADMIN_ACTION, action: `USER_${status}`, userId, adminUserId: actor.adminUserId }, "user status changed");
  return after;
}

export async function setWithdrawalsSuspended(tx: Tx, logger: Logger, actor: AdminActor, userId: string, suspended: boolean, reason: string) {
  requireRole(actor, "MODERATOR");
  const before = await tx.user.findUnique({ where: { id: userId } });
  if (!before) throw new AppError("NOT_FOUND", "User not found");
  const after = await tx.user.update({ where: { id: userId }, data: { withdrawalsSuspended: suspended } });
  await writeAudit(tx, { actorType: "ADMIN", adminUserId: actor.adminUserId, userId, action: suspended ? "WITHDRAWALS_SUSPEND" : "WITHDRAWALS_RESUME", targetType: "User", targetId: userId, before: { withdrawalsSuspended: before.withdrawalsSuspended }, after: { withdrawalsSuspended: suspended }, reason, ip: actor.ip });
  logger.warn({ event: LogEvent.ADMIN_ACTION, action: "WITHDRAWALS_SUSPEND", userId, suspended }, "withdrawal suspension changed");
  return after;
}

export async function adminGrantItem(tx: Tx, logger: Logger, actor: AdminActor, userId: string, itemKey: string, quantity: number, reason: string, requestId: string) {
  requireRole(actor, "ADMIN");
  const { row, duplicate } = await grantItem(tx, { userId, itemKey, quantity, source: "ADMIN", sourceRef: `admin:${actor.adminUserId}:${requestId}`, ignoreCapacity: true });
  if (!duplicate) {
    await writeAudit(tx, { actorType: "ADMIN", adminUserId: actor.adminUserId, userId, action: "ITEM_GRANT", targetType: "InventoryItem", targetId: row.id, after: { itemKey, quantity }, reason, ip: actor.ip });
    logger.info({ event: LogEvent.ADMIN_ACTION, action: "ITEM_GRANT", userId, itemKey }, "item granted by admin");
  }
  return row;
}

export type AdjustableAccount = "GOLD" | "GEMS" | "CRYPTO_REWARD";

/** Credits (positive) or debits (negative) a user account through a compensating journal. */
export async function adjustBalance(
  tx: Tx,
  logger: Logger,
  actor: AdminActor,
  userId: string,
  account: AdjustableAccount,
  delta: bigint,
  reason: string,
  requestId: string,
) {
  requireRole(actor, account === "CRYPTO_REWARD" ? "SUPER_ADMIN" : "ADMIN");
  if (delta === 0n) throw new AppError("BAD_REQUEST", "Adjustment must be non-zero");
  if (!reason || reason.trim().length < 5) throw new AppError("BAD_REQUEST", "A reason is required for financial adjustments");
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("NOT_FOUND", "User not found");

  const system = account === "GOLD" ? "GOLD_ISSUANCE" : account === "GEMS" ? "GEMS_ISSUANCE" : "CRYPTO_REWARD_POOL";
  const userRef = { userId, kind: account } as const;
  const amount = delta > 0n ? delta : -delta;
  const legs = delta > 0n ? transfer({ system }, userRef, amount) : transfer(userRef, { system }, amount);
  const posted = await postJournal(tx, {
    type: "ADMIN_ADJUSTMENT",
    idempotencyKey: `admin_adjust:${actor.adminUserId}:${requestId}`,
    reference: userId,
    adminUserId: actor.adminUserId,
    description: reason,
    metadata: { account, delta: delta.toString() },
    legs,
  });
  if (!posted.duplicate) {
    await writeAudit(tx, { actorType: "ADMIN", adminUserId: actor.adminUserId, userId, action: "BALANCE_ADJUST", targetType: "BalanceAccount", targetId: `${userId}:${account}`, after: { account, delta: delta.toString(), journalId: posted.journalId }, reason, ip: actor.ip });
    logger.warn({ event: LogEvent.ADMIN_ACTION, action: "BALANCE_ADJUST", userId, account, delta: delta.toString() }, "balance adjusted");
  }
  return posted;
}

export async function adminFundRewardPool(tx: Tx, logger: Logger, actor: AdminActor, amount: bigint, reason: string, requestId: string) {
  requireRole(actor, "SUPER_ADMIN");
  if (amount <= 0n) throw new AppError("BAD_REQUEST", "Amount must be positive");
  await fundRewardPool(tx, amount, `admin:${actor.adminUserId}:${requestId}`, actor.adminUserId, reason);
  await writeAudit(tx, { actorType: "ADMIN", adminUserId: actor.adminUserId, action: "REWARD_POOL_FUND", targetType: "BalanceAccount", targetId: "CRYPTO_REWARD_POOL", after: { amount: amount.toString() }, reason, ip: actor.ip });
  logger.warn({ event: LogEvent.ADMIN_ACTION, action: "REWARD_POOL_FUND", amount: amount.toString() }, "reward pool funded");
}
