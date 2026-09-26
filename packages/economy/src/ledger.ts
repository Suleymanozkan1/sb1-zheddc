// Double-entry, append-only ledger.
//
// Every financial change is a LedgerJournal with >= 2 BalanceLedger rows whose debits and
// credits balance per asset. Rows are immutable (DB trigger); corrections are new journals.
// Account rows are locked in a deterministic order (FOR UPDATE) so concurrent postings on the
// same accounts serialise, and the non-negative CHECK constraint is a last line of defence.

import type { Asset, Prisma, TransactionType, Tx } from "@cryptoarena/database";
import { resolveAccount, type AccountRef } from "./accounts";
import { AppError } from "./errors";

export interface LedgerLeg {
  account: AccountRef;
  direction: "DEBIT" | "CREDIT";
  amount: bigint;
  metadata?: Record<string, unknown>;
}

export interface JournalInput {
  type: TransactionType;
  idempotencyKey: string;
  reference?: string | null;
  description?: string;
  adminUserId?: string | null;
  metadata?: Record<string, unknown>;
  legs: LedgerLeg[];
}

export interface PostedJournal {
  journalId: string;
  duplicate: boolean;
}

interface LockedAccount {
  id: string;
  balance: bigint;
  allowNegative: boolean;
  asset: Asset;
  userId: string | null;
}

export async function postJournal(tx: Tx, input: JournalInput): Promise<PostedJournal> {
  const existing = await tx.ledgerJournal.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, type: true } });
  if (existing) {
    if (existing.type !== input.type) {
      throw new AppError("CONFLICT", "Idempotency key reused for a different transaction type");
    }
    return { journalId: existing.id, duplicate: true };
  }

  if (input.legs.length < 2) throw new AppError("INTERNAL", "A journal needs at least two legs");
  for (const leg of input.legs) {
    if (typeof leg.amount !== "bigint" || leg.amount <= 0n) throw new AppError("INTERNAL", "Ledger amounts must be positive bigints");
  }

  const resolved = await Promise.all(input.legs.map(async (leg) => ({ leg, acc: await resolveAccount(tx, leg.account) })));

  // Balanced per asset.
  const net = new Map<Asset, bigint>();
  for (const { leg, acc } of resolved) {
    const signed = leg.direction === "CREDIT" ? leg.amount : -leg.amount;
    net.set(acc.asset, (net.get(acc.asset) ?? 0n) + signed);
  }
  for (const [asset, sum] of net) {
    if (sum !== 0n) throw new AppError("INTERNAL", `Unbalanced journal for ${asset}: ${sum}`);
  }

  // Insert the journal first: a concurrent duplicate blocks here on the unique index.
  const journal = await tx.ledgerJournal.create({
    data: {
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      reference: input.reference ?? null,
      description: input.description ?? null,
      adminUserId: input.adminUserId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  const ids = [...new Set(resolved.map((r) => r.acc.id))].sort();
  const locked = await tx.$queryRaw<LockedAccount[]>`
    SELECT id, balance, "allowNegative", asset, "userId"
    FROM "BalanceAccount"
    WHERE id = ANY(CAST(${ids} AS uuid[]))
    ORDER BY id
    FOR UPDATE`;
  const balances = new Map(locked.map((a) => [a.id, { ...a, balance: BigInt(a.balance) }]));

  const rows: Prisma.BalanceLedgerCreateManyInput[] = [];
  for (const { leg, acc } of resolved) {
    const state = balances.get(acc.id);
    if (!state) throw new AppError("INTERNAL", "Account disappeared while posting");
    state.balance += leg.direction === "CREDIT" ? leg.amount : -leg.amount;
    if (!state.allowNegative && state.balance < 0n) {
      throw new AppError("INSUFFICIENT_FUNDS", `Insufficient ${acc.asset.toLowerCase()} balance`);
    }
    rows.push({
      journalId: journal.id,
      accountId: acc.id,
      userId: acc.userId,
      type: input.type,
      amount: leg.amount,
      asset: acc.asset,
      direction: leg.direction,
      reference: input.reference ?? null,
      balanceAfter: state.balance,
      metadata: (leg.metadata ?? {}) as Prisma.InputJsonValue,
    });
  }

  await tx.balanceLedger.createMany({ data: rows });
  for (const [id, state] of balances) {
    await tx.balanceAccount.update({ where: { id }, data: { balance: state.balance } });
  }
  return { journalId: journal.id, duplicate: false };
}

/** Convenience for the common 2-leg case: move `amount` from `from` to `to`. */
export function transfer(from: AccountRef, to: AccountRef, amount: bigint): LedgerLeg[] {
  return [
    { account: from, direction: "DEBIT", amount },
    { account: to, direction: "CREDIT", amount },
  ];
}

/** Recomputes an account balance from its ledger rows (used by reconciliation and tests). */
export async function recomputeBalance(tx: Tx, accountId: string): Promise<bigint> {
  const rows = await tx.$queryRaw<{ total: bigint | null }[]>`
    SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) AS total
    FROM "BalanceLedger" WHERE "accountId" = CAST(${accountId} AS uuid)`;
  return BigInt(rows[0]?.total ?? 0);
}

/** Global invariant: the sum of all balances of an asset is zero (double entry). */
export async function assetImbalance(tx: Tx): Promise<Record<string, bigint>> {
  const rows = await tx.$queryRaw<{ asset: string; total: bigint }[]>`
    SELECT asset::text AS asset, SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) AS total
    FROM "BalanceLedger" GROUP BY asset`;
  return Object.fromEntries(rows.map((r) => [r.asset, BigInt(r.total)]));
}
