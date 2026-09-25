// In-memory SolanaGateway used by tests and by local development with SOLANA_MOCK=true.
// It never touches a real network; production configuration refuses to enable it.

import type { Commitment, ObservedTransaction, SignatureStatus, SolanaGateway, SolanaNetwork } from "./types";
import { GENESIS_HASHES } from "./types";

export class MockSolanaGateway implements SolanaGateway {
  readonly network: SolanaNetwork;
  readonly transactions = new Map<string, ObservedTransaction>();
  readonly sent: string[] = [];
  blockHeight = 1_000n;
  /** When set, sendTransaction throws this error (simulates RPC failures). */
  failNextSend: Error | null = null;
  /** When false, sent transactions never land (simulates dropped transactions). */
  landSentTransactions = true;
  private counter = 0;
  private readonly balances = new Map<string, bigint>();

  constructor(network: SolanaNetwork = "devnet") {
    this.network = network;
  }

  async getGenesisHash(): Promise<string> {
    return this.network === "localnet" ? "localnet-genesis" : GENESIS_HASHES[this.network];
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }> {
    this.counter++;
    return { blockhash: `MockBlockhash${this.counter.toString().padStart(30, "1")}`.slice(0, 44), lastValidBlockHeight: this.blockHeight + 150n };
  }

  async getBlockHeight(): Promise<bigint> {
    return this.blockHeight;
  }

  async getTransaction(signature: string, _commitment: Commitment): Promise<ObservedTransaction | null> {
    return this.transactions.get(signature) ?? null;
  }

  async getSignatureStatus(signature: string): Promise<SignatureStatus | null> {
    const tx = this.transactions.get(signature);
    if (!tx) return null;
    return { confirmationStatus: tx.confirmationStatus, err: tx.err, slot: tx.slot };
  }

  /** The mock accepts an opaque payload "mock:<signature>:<json>" produced by the withdrawal worker in mock mode. */
  async sendTransaction(base64WireTx: string): Promise<string> {
    if (this.failNextSend) {
      const err = this.failNextSend;
      this.failNextSend = null;
      throw err;
    }
    const decoded = Buffer.from(base64WireTx, "base64").toString("utf8");
    const match = /^mock:([^:]+):(.*)$/s.exec(decoded);
    if (!match) throw new Error("MockSolanaGateway only accepts mock transactions");
    const signature = match[1]!;
    const payload = JSON.parse(match[2]!) as { from: string; to: string; mint: string; amount: string };
    this.sent.push(signature);
    if (this.landSentTransactions && !this.transactions.has(signature)) {
      this.transactions.set(signature, {
        signature,
        slot: this.blockHeight,
        blockTime: Math.floor(Date.now() / 1000),
        err: null,
        confirmationStatus: "finalized",
        feePayer: payload.from,
        signers: [payload.from],
        accountKeys: [payload.from, payload.to],
        tokenBalanceChanges: [
          { account: `${payload.from}-ata`, owner: payload.from, mint: payload.mint, delta: -BigInt(payload.amount) },
          { account: `${payload.to}-ata`, owner: payload.to, mint: payload.mint, delta: BigInt(payload.amount) },
        ],
      });
    }
    return signature;
  }

  async getTokenBalance(owner: string, mint: string): Promise<bigint> {
    return this.balances.get(`${owner}:${mint}`) ?? 0n;
  }

  setTokenBalance(owner: string, mint: string, amount: bigint): void {
    this.balances.set(`${owner}:${mint}`, amount);
  }

  /** Test/dev helper: records a landed deposit transfer. */
  recordTransfer(input: {
    signature: string;
    payer: string;
    mint: string;
    amount: bigint;
    recipientTokenAccount: string;
    recipientOwner: string;
    reference: string;
    confirmationStatus?: ObservedTransaction["confirmationStatus"];
    err?: unknown;
  }): ObservedTransaction {
    const tx: ObservedTransaction = {
      signature: input.signature,
      slot: this.blockHeight,
      blockTime: Math.floor(Date.now() / 1000),
      err: input.err ?? null,
      confirmationStatus: input.confirmationStatus ?? "finalized",
      feePayer: input.payer,
      signers: [input.payer],
      accountKeys: [input.payer, `${input.payer}-ata`, input.recipientTokenAccount, input.mint, input.reference],
      tokenBalanceChanges: [
        { account: `${input.payer}-ata`, owner: input.payer, mint: input.mint, delta: -input.amount },
        { account: input.recipientTokenAccount, owner: input.recipientOwner, mint: input.mint, delta: input.amount },
      ],
    };
    this.transactions.set(input.signature, tx);
    return tx;
  }
}

/** Encodes a withdrawal for the mock gateway (never a real Solana transaction). */
export function encodeMockTransfer(signature: string, from: string, to: string, mint: string, amount: bigint): string {
  return Buffer.from(`mock:${signature}:${JSON.stringify({ from, to, mint, amount: amount.toString() })}`, "utf8").toString("base64");
}
