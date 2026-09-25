import type { DepositExpectation, DepositVerification, ObservedTransaction } from "./types";

const RANK = { processed: 0, confirmed: 1, finalized: 2 } as const;

/**
 * Validates that an observed transaction is exactly the expected deposit.
 * Pure function: no I/O, so every rule is unit-testable.
 */
export function verifyDepositTransaction(tx: ObservedTransaction | null, exp: DepositExpectation): DepositVerification {
  if (exp.network !== exp.expectedNetwork) {
    return { ok: false, retryable: false, reason: `wrong network: ${exp.network} (expected ${exp.expectedNetwork})` };
  }
  if (!tx) return { ok: false, retryable: true, reason: "transaction not found yet" };
  if (tx.signature !== exp.signature) return { ok: false, retryable: false, reason: "signature mismatch" };
  if (tx.err !== null && tx.err !== undefined) return { ok: false, retryable: false, reason: "transaction failed on-chain" };

  const status = tx.confirmationStatus;
  if (status === null || RANK[status] < RANK[exp.requiredCommitment]) {
    return { ok: false, retryable: true, reason: `insufficient confirmation (${status ?? "unknown"}, need ${exp.requiredCommitment})` };
  }

  if (!tx.signers.includes(exp.payer)) {
    return { ok: false, retryable: false, reason: "deposit was not signed by the linked wallet" };
  }
  if (!tx.accountKeys.includes(exp.reference)) {
    return { ok: false, retryable: false, reason: "deposit reference missing from transaction" };
  }

  const credited = tx.tokenBalanceChanges.find((c) => c.account === exp.recipientTokenAccount && c.mint === exp.mint);
  if (!credited) return { ok: false, retryable: false, reason: "treasury token account was not credited with the expected mint" };
  if (credited.delta !== exp.amount) {
    return { ok: false, retryable: false, reason: `amount mismatch: received ${credited.delta}, expected ${exp.amount}` };
  }

  const debited = tx.tokenBalanceChanges.find((c) => c.owner === exp.payer && c.mint === exp.mint && c.delta < 0n);
  if (!debited || -debited.delta !== exp.amount) {
    return { ok: false, retryable: false, reason: "funds did not originate from the linked wallet" };
  }

  return { ok: true, slot: tx.slot };
}
