// Withdrawal worker. The ONLY component holding the treasury signer.
//
// Double-payment protection:
//   1. a withdrawal row is claimed with FOR UPDATE SKIP LOCKED (one worker at a time);
//   2. the signed transaction's signature is persisted BEFORE broadcasting;
//   3. a recorded signature is only abandoned once it has definitely failed on-chain or its
//      blockhash expired without the signature ever being seen — only then is a new
//      transaction built. A withdrawal therefore has at most one transaction that can land.

import { randomBytes } from "node:crypto";
import { buildSignedWithdrawalTransaction, encodeMockTransfer, type SolanaGateway, type TreasurySigner } from "@cryptoarena/blockchain";
import {
  claimNextWithdrawal,
  completeWithdrawal,
  failWithdrawal,
  recordWithdrawalSignature,
  rescheduleWithdrawal,
  updateWithdrawalQueueMetrics,
  type EconomyContext,
} from "@cryptoarena/economy";
import type { Withdrawal } from "@cryptoarena/database";
import { LogEvent } from "@cryptoarena/observability";
import { getBase58Decoder } from "@solana/kit";

export interface WorkerDeps {
  ctx: EconomyContext;
  gateway: SolanaGateway;
  /** null in SOLANA_MOCK mode. */
  signer: TreasurySigner | null;
  mockTreasuryAddress?: string;
}

export type ProcessOutcome = "completed" | "sent" | "waiting" | "failed" | "deferred";

const CONFIRM_POLL_MS = 3_000;

function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 2_000 * 2 ** Math.max(0, attempts - 1));
}

export class WithdrawalWorker {
  private readonly deps: WorkerDeps;
  /** Signed wire transactions kept in memory so they can be re-broadcast while still valid. */
  private readonly wire = new Map<string, string>();
  private stopped = false;

  constructor(deps: WorkerDeps) {
    this.deps = deps;
  }

  get treasuryAddress(): string {
    return this.deps.signer?.address ?? this.deps.mockTreasuryAddress ?? "mock-treasury";
  }

  async process(w: Withdrawal): Promise<ProcessOutcome> {
    const { ctx, gateway } = this.deps;
    const log = ctx.logger.child({ withdrawalId: w.id, userId: w.userId });

    // 1. Resolve the fate of a previously recorded transaction first.
    if (w.signature) {
      const status = await gateway.getSignatureStatus(w.signature);
      if (status && (status.err === null || status.err === undefined)) {
        if (status.confirmationStatus === "finalized") {
          await completeWithdrawal(ctx, w.id, w.signature, status.slot);
          this.wire.delete(w.signature);
          return "completed";
        }
        await rescheduleWithdrawal(ctx, w.id, CONFIRM_POLL_MS, null);
        return "waiting";
      }
      if (!status) {
        const height = await gateway.getBlockHeight();
        if (w.lastValidBlockHeight !== null && height <= w.lastValidBlockHeight) {
          // Still valid and not yet seen: re-broadcast the SAME signed transaction (idempotent on-chain).
          const wire = this.wire.get(w.signature);
          if (wire) await gateway.sendTransaction(wire).catch((err: unknown) => log.warn({ err: (err as Error).message }, "re-broadcast failed"));
          await rescheduleWithdrawal(ctx, w.id, CONFIRM_POLL_MS, null);
          return "waiting";
        }
        log.warn({ signature: w.signature }, "previous withdrawal transaction expired without landing; rebuilding");
      } else {
        log.warn({ signature: w.signature, err: status.err }, "previous withdrawal transaction failed on-chain; rebuilding");
      }
      this.wire.delete(w.signature);
    }

    // 2. Out of attempts → refund (safe: no recorded transaction can still land at this point).
    if (w.attempts >= ctx.config.WITHDRAWAL_MAX_ATTEMPTS) {
      await failWithdrawal(ctx, w.id, w.lastError ?? "max attempts reached");
      return "failed";
    }

    // 3. Treasury must hold enough tokens (never overdraw; alert instead).
    const balance = await gateway.getTokenBalance(this.treasuryAddress, w.mint);
    if (!ctx.config.SOLANA_MOCK && balance < w.amount) {
      log.error({ balance: balance.toString(), amount: w.amount.toString() }, "treasury balance too low for withdrawal");
      await rescheduleWithdrawal(ctx, w.id, 5 * 60_000, "treasury temporarily unable to pay; will retry");
      return "deferred";
    }

    // 4. Build + sign, persist the signature, then broadcast.
    const { blockhash, lastValidBlockHeight } = await gateway.getLatestBlockhash();
    let signature: string;
    let wireTx: string;
    if (this.deps.signer) {
      const built = await buildSignedWithdrawalTransaction({
        signer: this.deps.signer.signer,
        recipient: w.walletAddress,
        mint: w.mint,
        decimals: ctx.config.REWARD_TOKEN_DECIMALS,
        amount: w.amount,
        blockhash,
        lastValidBlockHeight,
      });
      signature = built.signature;
      wireTx = built.wireTransaction;
    } else {
      signature = `mock${getBase58Decoder().decode(randomBytes(32))}`;
      wireTx = encodeMockTransfer(signature, this.treasuryAddress, w.walletAddress, w.mint, w.amount);
    }
    await recordWithdrawalSignature(ctx, w.id, signature, lastValidBlockHeight);
    this.wire.set(signature, wireTx);

    try {
      await gateway.sendTransaction(wireTx);
      log.info({ event: LogEvent.WITHDRAWAL_SENT, signature, amount: w.amount.toString() }, "withdrawal sent");
      await rescheduleWithdrawal(ctx, w.id, CONFIRM_POLL_MS, null);
      return "sent";
    } catch (err) {
      // The transaction may or may not have reached the cluster: keep the signature and let step 1 decide.
      const message = (err as Error).message.slice(0, 500);
      log.warn({ err: message, signature }, "broadcast failed; will re-check signature status");
      await rescheduleWithdrawal(ctx, w.id, backoffMs(w.attempts + 1), message);
      return "waiting";
    }
  }

  /** Processes due withdrawals until the queue is empty (or `max` were handled). */
  async runOnce(max = 20): Promise<number> {
    let handled = 0;
    while (handled < max && !this.stopped) {
      const w = await claimNextWithdrawal(this.deps.ctx);
      if (!w) break;
      handled++;
      try {
        await this.process(w);
      } catch (err) {
        this.deps.ctx.logger.error({ err, withdrawalId: w.id }, "withdrawal processing error");
        await rescheduleWithdrawal(this.deps.ctx, w.id, backoffMs(w.attempts + 1), (err as Error).message.slice(0, 500)).catch(() => undefined);
      }
    }
    await updateWithdrawalQueueMetrics(this.deps.ctx).catch(() => undefined);
    return handled;
  }

  start(intervalMs = 2_000): () => void {
    let running = false;
    const timer = setInterval(() => {
      if (running || this.stopped) return;
      running = true;
      void this.runOnce().finally(() => {
        running = false;
      });
    }, intervalMs);
    return () => {
      this.stopped = true;
      clearInterval(timer);
    };
  }
}
