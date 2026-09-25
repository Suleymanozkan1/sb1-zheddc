// Deposit flow: prepare (server builds the exact transfer) → wallet signs & sends →
// verify (server re-checks everything on-chain) → credit ledger exactly once.

import { randomBytes } from "node:crypto";
import {
  buildDepositTransaction,
  verifyDepositTransaction,
  type SolanaGateway,
} from "@cryptoarena/blockchain";
import { explorerTxUrl } from "@cryptoarena/config";
import type { DepositDto } from "@cryptoarena/shared";
import { withTransaction, isUniqueViolation, type Deposit, type Tx } from "@cryptoarena/database";
import { LogEvent } from "@cryptoarena/observability";
import { getBase58Decoder } from "@solana/kit";
import { requireFeature } from "./compliance";
import type { EconomyContext } from "./context";
import { AppError } from "./errors";
import { postJournal, transfer } from "./ledger";

export function depositToDto(d: Deposit, network: string): DepositDto {
  return {
    id: d.id,
    amount: d.amount.toString(),
    status: d.status,
    signature: d.signature,
    failureReason: d.failureReason,
    createdAt: d.createdAt.toISOString(),
    explorerUrl: d.signature && !d.signature.startsWith("mock") ? explorerTxUrl(d.signature, network) : null,
  };
}

/** A fresh random 32-byte public key used purely as a correlation reference (no private key needed). */
export function randomReference(): string {
  return getBase58Decoder().decode(randomBytes(32));
}

export function assertDepositsConfigured(ctx: EconomyContext): { mint: string; treasury: string } {
  const { REWARD_TOKEN_MINT: mint, TREASURY_PUBLIC_KEY: treasury } = ctx.config;
  if (!mint || !treasury) throw new AppError("NOT_CONFIGURED", "Deposits are not configured (REWARD_TOKEN_MINT / TREASURY_PUBLIC_KEY)");
  return { mint, treasury };
}

export async function prepareDeposit(ctx: EconomyContext, gateway: SolanaGateway, userId: string, amount: bigint) {
  const { mint, treasury } = assertDepositsConfigured(ctx);
  const { config } = ctx;
  if (amount < config.MIN_DEPOSIT || amount > config.MAX_DEPOSIT) {
    throw new AppError("LIMIT_EXCEEDED", `Deposit must be between ${config.MIN_DEPOSIT} and ${config.MAX_DEPOSIT} base units`);
  }
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { wallets: true } });
  await requireFeature(ctx.prisma, config, user, "DEPOSIT");
  const wallet = user.wallets.find((w) => w.isPrimary) ?? user.wallets[0];
  if (!wallet) throw new AppError("FORBIDDEN", "Connect and verify a wallet before depositing");

  const open = await ctx.prisma.deposit.count({ where: { userId, status: "AWAITING_SIGNATURE", expiresAt: { gt: new Date() } } });
  if (open >= 5) throw new AppError("RATE_LIMITED", "Too many open deposit requests");

  const reference = randomReference();
  const expiresAt = new Date(Date.now() + config.DEPOSIT_EXPIRY_MINUTES * 60_000);
  let transaction: string | null = null;
  let recipient: string;
  if (config.SOLANA_MOCK) {
    recipient = `${treasury}-ata`;
  } else {
    const { blockhash, lastValidBlockHeight } = await gateway.getLatestBlockhash();
    const built = await buildDepositTransaction({
      payer: wallet.address,
      mint,
      decimals: config.REWARD_TOKEN_DECIMALS,
      amount,
      treasuryOwner: treasury,
      reference,
      blockhash,
      lastValidBlockHeight,
    });
    transaction = built.transaction;
    recipient = built.recipientTokenAccount;
  }

  const deposit = await ctx.prisma.deposit.create({
    data: { userId, walletId: wallet.id, network: config.SOLANA_NETWORK, mint, amount, recipient, reference, expiresAt },
  });
  ctx.logger.info({ event: LogEvent.DEPOSIT_PREPARED, userId, depositId: deposit.id, amount: amount.toString() }, "deposit prepared");
  return { deposit, transaction, wallet: wallet.address, mock: config.SOLANA_MOCK };
}

export type VerifyOutcome = { status: "CREDITED" | "SUBMITTED" | "FAILED"; deposit: Deposit; reason?: string };

export async function verifyDeposit(ctx: EconomyContext, gateway: SolanaGateway, userId: string, depositId: string, signature: string): Promise<VerifyOutcome> {
  const deposit = await ctx.prisma.deposit.findFirst({ where: { id: depositId, userId }, include: { wallet: true } });
  if (!deposit) throw new AppError("NOT_FOUND", "Deposit not found");
  if (deposit.status === "CREDITED") {
    if (deposit.signature === signature) return { status: "CREDITED", deposit };
    throw new AppError("CONFLICT", "Deposit already credited with a different transaction");
  }
  if (deposit.status === "FAILED") throw new AppError("VERIFICATION_FAILED", deposit.failureReason ?? "Deposit failed");
  if (deposit.signature && deposit.signature !== signature) throw new AppError("CONFLICT", "A different transaction was already submitted for this deposit");

  // If the transaction is already visible, make sure it belongs to THIS deposit before binding it,
  // so nobody can squat someone else's (public) signature on their own deposit.
  const visible = await gateway.getTransaction(signature, "confirmed");
  if (visible && (!visible.accountKeys.includes(deposit.reference) || !visible.signers.includes(deposit.wallet.address))) {
    throw new AppError("VERIFICATION_FAILED", "This transaction does not belong to this deposit");
  }

  // Bind the signature to this deposit. The unique index prevents replaying one transaction for two deposits.
  if (!deposit.signature) {
    try {
      await ctx.prisma.deposit.update({ where: { id: deposit.id }, data: { signature, status: "SUBMITTED" } });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("DUPLICATE_TRANSACTION", "This transaction was already used for another deposit");
      throw err;
    }
  }
  ctx.logger.info({ event: LogEvent.DEPOSIT_DETECTED, userId, depositId, signature }, "deposit submitted");
  return settleDeposit(ctx, gateway, deposit.id);
}

/** Re-checks a SUBMITTED deposit on-chain and credits it once finalized. Safe to call repeatedly. */
export async function settleDeposit(ctx: EconomyContext, gateway: SolanaGateway, depositId: string): Promise<VerifyOutcome> {
  const { config } = ctx;
  const deposit = await ctx.prisma.deposit.findUniqueOrThrow({ where: { id: depositId }, include: { wallet: true } });
  if (deposit.status === "CREDITED") return { status: "CREDITED", deposit };
  if (!deposit.signature) throw new AppError("BAD_REQUEST", "No transaction submitted");

  const tx = await gateway.getTransaction(deposit.signature, config.SOLANA_COMMITMENT);
  const result = verifyDepositTransaction(tx, {
    network: gateway.network,
    expectedNetwork: config.SOLANA_NETWORK,
    signature: deposit.signature,
    payer: deposit.wallet.address,
    mint: deposit.mint,
    amount: deposit.amount,
    recipientTokenAccount: deposit.recipient,
    reference: deposit.reference,
    requiredCommitment: config.SOLANA_COMMITMENT,
  });

  if (!result.ok) {
    if (result.retryable) return { status: "SUBMITTED", deposit, reason: result.reason };
    if (tx && (!tx.accountKeys.includes(deposit.reference) || !tx.signers.includes(deposit.wallet.address))) {
      // Foreign transaction: release the signature so its real owner can still use it.
      const released = await ctx.prisma.deposit.update({ where: { id: deposit.id }, data: { signature: null, status: "AWAITING_SIGNATURE", failureReason: result.reason } });
      ctx.logger.warn({ event: LogEvent.DEPOSIT_REJECTED, depositId, reason: result.reason }, "foreign transaction released");
      return { status: "FAILED", deposit: released, reason: result.reason };
    }
    const failed = await ctx.prisma.deposit.update({ where: { id: deposit.id }, data: { status: "FAILED", failureReason: result.reason } });
    ctx.logger.warn({ event: LogEvent.DEPOSIT_REJECTED, depositId, reason: result.reason }, "deposit rejected");
    return { status: "FAILED", deposit: failed, reason: result.reason };
  }

  const credited = await withTransaction(ctx.prisma, async (t: Tx) => {
    const [row] = await t.$queryRaw<{ status: string }[]>`SELECT status FROM "Deposit" WHERE id = CAST(${deposit.id} AS uuid) FOR UPDATE`;
    if (row?.status === "CREDITED") return t.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
    const posted = await postJournal(t, {
      type: "DEPOSIT",
      idempotencyKey: `deposit:${deposit.signature}`,
      reference: deposit.signature,
      metadata: { depositId: deposit.id, mint: deposit.mint, slot: result.slot.toString() },
      legs: transfer({ system: "CRYPTO_EXTERNAL" }, { userId: deposit.userId, kind: "CRYPTO_SPENDABLE" }, deposit.amount),
    });
    await t.walletTransaction.upsert({
      where: { signature: deposit.signature! },
      update: { status: "FINALIZED", slot: result.slot },
      create: {
        userId: deposit.userId,
        walletId: deposit.walletId,
        signature: deposit.signature!,
        kind: "DEPOSIT",
        network: deposit.network,
        mint: deposit.mint,
        amount: deposit.amount,
        slot: result.slot,
        status: "FINALIZED",
      },
    });
    return t.deposit.update({
      where: { id: deposit.id },
      data: { status: "CREDITED", journalId: posted.journalId, slot: result.slot, creditedAt: new Date(), failureReason: null },
    });
  });
  ctx.logger.info({ event: LogEvent.DEPOSIT_CONFIRMED, userId: deposit.userId, depositId, amount: deposit.amount.toString() }, "deposit credited");
  return { status: "CREDITED", deposit: credited };
}

/** Background job: settle submitted deposits, expire unsigned ones. */
export async function processPendingDeposits(ctx: EconomyContext, gateway: SolanaGateway): Promise<{ settled: number; expired: number }> {
  const expired = await ctx.prisma.deposit.updateMany({
    where: { status: "AWAITING_SIGNATURE", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  const submitted = await ctx.prisma.deposit.findMany({ where: { status: "SUBMITTED" }, take: 50, orderBy: { updatedAt: "asc" } });
  let settled = 0;
  for (const d of submitted) {
    try {
      const r = await settleDeposit(ctx, gateway, d.id);
      if (r.status === "CREDITED") settled++;
    } catch (err) {
      ctx.logger.error({ err, depositId: d.id }, "deposit settlement failed");
    }
  }
  return { settled, expired: expired.count };
}

/** DEV ONLY (SOLANA_MOCK=true): simulates the wallet broadcasting the prepared transfer. */
export async function simulateMockDepositTransfer(ctx: EconomyContext, gateway: SolanaGateway, userId: string, depositId: string): Promise<string> {
  if (!ctx.config.SOLANA_MOCK || ctx.config.isProduction) throw new AppError("FORBIDDEN", "Mock deposits are disabled");
  const deposit = await ctx.prisma.deposit.findFirst({ where: { id: depositId, userId }, include: { wallet: true } });
  if (!deposit) throw new AppError("NOT_FOUND", "Deposit not found");
  const mock = gateway as unknown as { recordTransfer?: (i: Record<string, unknown>) => unknown };
  if (typeof mock.recordTransfer !== "function") throw new AppError("NOT_CONFIGURED", "Mock gateway unavailable");
  const signature = `mock${randomReference()}`;
  mock.recordTransfer({
    signature,
    payer: deposit.wallet.address,
    mint: deposit.mint,
    amount: deposit.amount,
    recipientTokenAccount: deposit.recipient,
    recipientOwner: ctx.config.TREASURY_PUBLIC_KEY,
    reference: deposit.reference,
  });
  return signature;
}

