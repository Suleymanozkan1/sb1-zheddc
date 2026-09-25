// Treasury signing abstraction. Only the blockchain-service constructs a TreasurySigner.
// MVP: secret from environment. Production: implement TreasurySigner against a KMS/HSM
// (e.g. a remote signer that exposes `signTransactions`) — the rest of the code is unchanged.

import { createKeyPairSignerFromBytes, getBase58Encoder, type TransactionSigner } from "@solana/kit";

export interface TreasurySigner {
  readonly address: string;
  /** kit-compatible signer used by transaction builders. */
  readonly signer: TransactionSigner;
}

/** Parses a 64-byte secret key given as base58 or as a JSON byte array (solana-keygen format). */
export function parseSecretKey(secret: string): Uint8Array {
  const trimmed = secret.trim();
  let bytes: Uint8Array;
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(arr) || !arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      throw new Error("TREASURY_SECRET JSON must be an array of bytes");
    }
    bytes = Uint8Array.from(arr as number[]);
  } else {
    bytes = Uint8Array.from(getBase58Encoder().encode(trimmed));
  }
  if (bytes.length !== 64) throw new Error(`TREASURY_SECRET must decode to 64 bytes, got ${bytes.length}`);
  return bytes;
}

export async function createEnvTreasurySigner(secret: string, expectedPublicKey?: string): Promise<TreasurySigner> {
  if (!secret) throw new Error("TREASURY_SECRET is not configured");
  const bytes = parseSecretKey(secret);
  const signer = await createKeyPairSignerFromBytes(bytes);
  bytes.fill(0);
  if (expectedPublicKey && signer.address !== expectedPublicKey) {
    throw new Error("TREASURY_SECRET does not match TREASURY_PUBLIC_KEY");
  }
  return { address: signer.address, signer };
}
