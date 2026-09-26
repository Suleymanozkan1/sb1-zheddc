import { address, createSolanaRpc, signature as toSignature, type Base64EncodedWireTransaction } from "@solana/kit";
import { getAssociatedTokenAddress } from "./transactions";
import type { Commitment, ObservedTransaction, SignatureStatus, SolanaGateway, SolanaNetwork, TokenBalanceChange } from "./types";

type RpcObserver = (method: string, ms: number, ok: boolean) => void;

interface ParsedAccountKey {
  pubkey: string;
  signer: boolean;
  writable: boolean;
}

interface ParsedTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

interface ParsedTxResponse {
  slot: bigint;
  blockTime: bigint | number | null;
  meta: { err: unknown; preTokenBalances?: readonly ParsedTokenBalance[] | null; postTokenBalances?: readonly ParsedTokenBalance[] | null } | null;
  transaction: { signatures: readonly string[]; message: { accountKeys: readonly ParsedAccountKey[] } };
}

/** SolanaGateway backed by a real RPC endpoint via @solana/kit. */
export class KitSolanaGateway implements SolanaGateway {
  readonly network: SolanaNetwork;
  private readonly rpc: ReturnType<typeof createSolanaRpc>;
  private readonly observe: RpcObserver;

  constructor(network: SolanaNetwork, rpcUrl: string, observe: RpcObserver = () => {}) {
    this.network = network;
    this.rpc = createSolanaRpc(rpcUrl);
    this.observe = observe;
  }

  private async call<T>(method: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const out = await fn();
      this.observe(method, performance.now() - start, true);
      return out;
    } catch (err) {
      this.observe(method, performance.now() - start, false);
      throw err;
    }
  }

  getGenesisHash(): Promise<string> {
    return this.call("getGenesisHash", () => this.rpc.getGenesisHash().send());
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }> {
    const res = await this.call("getLatestBlockhash", () => this.rpc.getLatestBlockhash({ commitment: "confirmed" }).send());
    return { blockhash: res.value.blockhash, lastValidBlockHeight: res.value.lastValidBlockHeight };
  }

  getBlockHeight(): Promise<bigint> {
    return this.call("getBlockHeight", () => this.rpc.getBlockHeight({ commitment: "confirmed" }).send());
  }

  async getSignatureStatus(sig: string): Promise<SignatureStatus | null> {
    const res = await this.call("getSignatureStatuses", () =>
      this.rpc.getSignatureStatuses([toSignature(sig)], { searchTransactionHistory: true }).send(),
    );
    const s = res.value[0];
    if (!s) return null;
    return { confirmationStatus: s.confirmationStatus ?? null, err: s.err, slot: s.slot };
  }

  async getTransaction(sig: string, commitment: Commitment): Promise<ObservedTransaction | null> {
    const res = (await this.call("getTransaction", () =>
      this.rpc
        .getTransaction(toSignature(sig), { encoding: "jsonParsed", commitment, maxSupportedTransactionVersion: 0 })
        .send(),
    )) as unknown as ParsedTxResponse | null;
    if (!res) return null;
    const status = await this.getSignatureStatus(sig);
    const keys = res.transaction.message.accountKeys;
    const pre = res.meta?.preTokenBalances ?? [];
    const post = res.meta?.postTokenBalances ?? [];
    const changes = new Map<string, TokenBalanceChange>();
    const touch = (b: ParsedTokenBalance, sign: 1n | -1n): void => {
      const account = keys[b.accountIndex]?.pubkey;
      if (!account) return;
      const key = `${account}:${b.mint}`;
      const existing = changes.get(key) ?? { account, owner: b.owner ?? null, mint: b.mint, delta: 0n };
      existing.delta += sign * BigInt(b.uiTokenAmount.amount);
      if (!existing.owner && b.owner) existing.owner = b.owner;
      changes.set(key, existing);
    };
    for (const b of pre) touch(b, -1n);
    for (const b of post) touch(b, 1n);

    return {
      signature: res.transaction.signatures[0] ?? sig,
      slot: BigInt(res.slot),
      blockTime: res.blockTime === null ? null : Number(res.blockTime),
      err: res.meta?.err ?? null,
      confirmationStatus: status?.confirmationStatus ?? commitment,
      feePayer: keys[0]?.pubkey ?? "",
      signers: keys.filter((k) => k.signer).map((k) => k.pubkey),
      accountKeys: keys.map((k) => k.pubkey),
      tokenBalanceChanges: [...changes.values()],
    };
  }

  sendTransaction(base64WireTx: string): Promise<string> {
    return this.call("sendTransaction", () =>
      this.rpc
        .sendTransaction(base64WireTx as Base64EncodedWireTransaction, { encoding: "base64", preflightCommitment: "confirmed", maxRetries: 0n })
        .send(),
    );
  }

  async getTokenBalance(owner: string, mint: string): Promise<bigint> {
    const ata = await getAssociatedTokenAddress(owner, mint);
    try {
      const res = await this.call("getTokenAccountBalance", () => this.rpc.getTokenAccountBalance(address(ata)).send());
      return BigInt(res.value.amount);
    } catch {
      return 0n;
    }
  }
}
