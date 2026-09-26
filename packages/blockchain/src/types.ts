export type SolanaNetwork = "devnet" | "testnet" | "mainnet-beta" | "localnet";
export type Commitment = "confirmed" | "finalized";

export const GENESIS_HASHES: Record<Exclude<SolanaNetwork, "localnet">, string> = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
};

export interface TokenBalanceChange {
  /** Token account address. */
  account: string;
  owner: string | null;
  mint: string;
  /** post - pre, in base units. */
  delta: bigint;
}

/** Chain-agnostic view of a landed transaction, produced by a SolanaGateway. */
export interface ObservedTransaction {
  signature: string;
  slot: bigint;
  blockTime: number | null;
  /** null when the transaction succeeded. */
  err: unknown;
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
  feePayer: string;
  signers: string[];
  accountKeys: string[];
  tokenBalanceChanges: TokenBalanceChange[];
}

export interface SignatureStatus {
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
  err: unknown;
  slot: bigint;
}

/** Everything the backend needs from the chain. Implemented by KitSolanaGateway and MockSolanaGateway. */
export interface SolanaGateway {
  readonly network: SolanaNetwork;
  getGenesisHash(): Promise<string>;
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
  getBlockHeight(): Promise<bigint>;
  getTransaction(signature: string, commitment: Commitment): Promise<ObservedTransaction | null>;
  getSignatureStatus(signature: string): Promise<SignatureStatus | null>;
  /** Sends an already-signed base64 wire transaction. Returns the signature. */
  sendTransaction(base64WireTx: string): Promise<string>;
  getTokenBalance(owner: string, mint: string): Promise<bigint>;
}

export interface DepositExpectation {
  network: SolanaNetwork;
  expectedNetwork: SolanaNetwork;
  signature: string;
  payer: string;
  mint: string;
  amount: bigint;
  /** Treasury associated token account. */
  recipientTokenAccount: string;
  /** Unique reference key embedded in the deposit transaction. */
  reference: string;
  requiredCommitment: Commitment;
}

export type DepositVerification =
  | { ok: true; slot: bigint }
  | { ok: false; retryable: boolean; reason: string };
