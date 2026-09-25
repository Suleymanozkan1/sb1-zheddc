export * from "./types";
export * from "./verify";
export * from "./transactions";
export * from "./signer";
export * from "./auth";
export * from "./kit-gateway";
export * from "./mock-gateway";

import { KitSolanaGateway } from "./kit-gateway";
import { MockSolanaGateway } from "./mock-gateway";
import { GENESIS_HASHES, type SolanaGateway, type SolanaNetwork } from "./types";

export function createSolanaGateway(opts: {
  network: SolanaNetwork;
  rpcUrl: string;
  mock: boolean;
  observe?: (method: string, ms: number, ok: boolean) => void;
}): SolanaGateway {
  return opts.mock ? new MockSolanaGateway(opts.network) : new KitSolanaGateway(opts.network, opts.rpcUrl, opts.observe);
}

/** Refuses to run against an RPC whose genesis hash does not match the configured network. */
export async function assertNetwork(gateway: SolanaGateway): Promise<void> {
  if (gateway.network === "localnet") return;
  const genesis = await gateway.getGenesisHash();
  const expected = GENESIS_HASHES[gateway.network];
  if (genesis !== expected) {
    throw new Error(`RPC genesis hash ${genesis} does not match ${gateway.network} (${expected})`);
  }
}
