import type { Tx } from "@cryptoarena/database";
import { AppError } from "./errors";

/**
 * Serialises every state-changing economy transaction of one user (slot limits, purchase limits,
 * stat upgrades, XP). Take it FIRST in the transaction, before any ledger or row lock, so all
 * paths acquire locks in the same order. Advisory xact locks are re-entrant and released on commit.
 */
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user:${userId}`}))`;
}

/** `lockUser` plus a status check: suspended or banned accounts cannot change their economy state. */
export async function lockActiveUser(tx: Tx, userId: string): Promise<void> {
  await lockUser(tx, userId);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  if (user.status !== "ACTIVE") throw new AppError("ACCOUNT_RESTRICTED", `Account is ${user.status.toLowerCase()}`);
}
