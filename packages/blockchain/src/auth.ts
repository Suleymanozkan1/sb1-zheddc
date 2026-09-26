// Wallet ownership proof: the user signs a server-issued nonce message (ed25519).

import { getBase58Encoder, getPublicKeyFromAddress, getUtf8Encoder, isAddress, signatureBytes, verifySignature, address } from "@solana/kit";

export function isValidSolanaAddress(value: string): boolean {
  return typeof value === "string" && value.length >= 32 && value.length <= 44 && isAddress(value);
}

export function buildSignInMessage(input: { domain: string; address: string; nonce: string; issuedAt: Date; expiresAt: Date; purpose: string }): string {
  return [
    `${input.domain} wants you to sign in with your Solana account:`,
    input.address,
    "",
    "Sign this message to prove you own this wallet. This does not send a transaction or cost any fees.",
    "",
    `Purpose: ${input.purpose}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

/** Verifies a base58 ed25519 signature of `message` by `walletAddress`. Never throws. */
export async function verifyWalletSignature(walletAddress: string, message: string, signatureBase58: string): Promise<boolean> {
  try {
    if (!isValidSolanaAddress(walletAddress)) return false;
    const sig = Uint8Array.from(getBase58Encoder().encode(signatureBase58));
    if (sig.length !== 64) return false;
    const key = await getPublicKeyFromAddress(address(walletAddress));
    return await verifySignature(key, signatureBytes(sig), getUtf8Encoder().encode(message));
  } catch {
    return false;
  }
}
