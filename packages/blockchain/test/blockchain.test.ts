import { describe, expect, it } from "vitest";
import {
  address,
  generateKeyPairSigner,
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getUtf8Encoder,
  signBytes,
  type KeyPairSigner,
} from "@solana/kit";
import {
  MockSolanaGateway,
  buildDepositTransaction,
  buildSignInMessage,
  buildSignedWithdrawalTransaction,
  getAssociatedTokenAddress,
  parseSecretKey,
  verifyDepositTransaction,
  verifyWalletSignature,
  type DepositExpectation,
} from "../src";

const MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const TREASURY = "At82QkohDgCcjT5BHhJrZhxpS2FEUdBVtH5F1WDMvgSr";
const PAYER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const REF = "Ref1111111111111111111111111111111111111111";

function expectation(over: Partial<DepositExpectation> = {}): DepositExpectation {
  return {
    network: "devnet",
    expectedNetwork: "devnet",
    signature: "sig1",
    payer: PAYER,
    mint: MINT,
    amount: 5_000_000n,
    recipientTokenAccount: "TreasuryAta",
    reference: REF,
    requiredCommitment: "finalized",
    ...over,
  };
}

function landed(over: Partial<Parameters<MockSolanaGateway["recordTransfer"]>[0]> = {}) {
  const gw = new MockSolanaGateway("devnet");
  return gw.recordTransfer({ signature: "sig1", payer: PAYER, mint: MINT, amount: 5_000_000n, recipientTokenAccount: "TreasuryAta", recipientOwner: TREASURY, reference: REF, ...over });
}

describe("deposit verification", () => {
  it("accepts an exact, finalized transfer", () => {
    expect(verifyDepositTransaction(landed(), expectation())).toMatchObject({ ok: true });
  });
  it("rejects the wrong network", () => {
    expect(verifyDepositTransaction(landed(), expectation({ network: "testnet" }))).toMatchObject({ ok: false, retryable: false });
  });
  it("rejects the wrong mint", () => {
    expect(verifyDepositTransaction(landed({ mint: "So11111111111111111111111111111111111111112" }), expectation())).toMatchObject({ ok: false, retryable: false });
  });
  it("rejects the wrong amount", () => {
    expect(verifyDepositTransaction(landed({ amount: 4_999_999n }), expectation())).toMatchObject({ ok: false, reason: expect.stringMatching(/amount/) });
  });
  it("rejects the wrong recipient", () => {
    expect(verifyDepositTransaction(landed({ recipientTokenAccount: "AttackerAta" }), expectation())).toMatchObject({ ok: false });
  });
  it("waits (retryable) until finalized", () => {
    expect(verifyDepositTransaction(landed({ confirmationStatus: "confirmed" }), expectation())).toMatchObject({ ok: false, retryable: true });
    expect(verifyDepositTransaction(null, expectation())).toMatchObject({ ok: false, retryable: true });
  });
  it("rejects failed transactions, foreign signers and missing references", () => {
    expect(verifyDepositTransaction(landed({ err: { InstructionError: [0, "Custom"] } }), expectation())).toMatchObject({ ok: false, retryable: false });
    expect(verifyDepositTransaction(landed({ payer: "Someone1111111111111111111111111111111111111" }), expectation())).toMatchObject({ ok: false });
    expect(verifyDepositTransaction(landed({ reference: "Other111111111111111111111111111111111111111" }), expectation())).toMatchObject({ ok: false });
  });
});

describe("wallet signature authentication", () => {
  it("verifies a genuine signature and rejects tampering / wrong keys", async () => {
    const signer: KeyPairSigner = await generateKeyPairSigner();
    const message = buildSignInMessage({ domain: "localhost", address: signer.address, nonce: "abc", issuedAt: new Date(0), expiresAt: new Date(1), purpose: "test" });
    const sig = await signBytes(signer.keyPair.privateKey, getUtf8Encoder().encode(message));
    const b58 = getBase58Decoder().decode(sig);
    expect(await verifyWalletSignature(signer.address, message, b58)).toBe(true);
    expect(await verifyWalletSignature(signer.address, `${message}!`, b58)).toBe(false);
    const other = await generateKeyPairSigner();
    expect(await verifyWalletSignature(other.address, message, b58)).toBe(false);
    expect(await verifyWalletSignature("not-an-address", message, b58)).toBe(false);
    expect(await verifyWalletSignature(signer.address, message, "1111")).toBe(false);
  });
});

describe("transaction builders", () => {
  it("builds an unsigned deposit transfer that carries the reference key", async () => {
    const { transaction, recipientTokenAccount } = await buildDepositTransaction({
      payer: PAYER,
      mint: MINT,
      decimals: 6,
      amount: 5_000_000n,
      treasuryOwner: TREASURY,
      reference: REF,
      blockhash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
      lastValidBlockHeight: 100n,
    });
    expect(recipientTokenAccount).toBe(await getAssociatedTokenAddress(TREASURY, MINT));
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
    const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    const keys = msg.staticAccounts.map(String);
    expect(keys[0]).toBe(PAYER);
    expect(keys).toContain(REF);
    expect(keys).toContain(recipientTokenAccount);
    expect(Object.values(tx.signatures).every((s) => s === null)).toBe(true);
  });

  it("signs a withdrawal transfer from the treasury", async () => {
    const treasury = await generateKeyPairSigner();
    const { signature, wireTransaction } = await buildSignedWithdrawalTransaction({
      signer: treasury,
      recipient: PAYER,
      mint: MINT,
      decimals: 6,
      amount: 1_000_000n,
      blockhash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
      lastValidBlockHeight: 100n,
    });
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wireTransaction));
    expect(tx.signatures[address(treasury.address)]).not.toBeNull();
    expect(signature.length).toBeGreaterThan(80);
  });

  it("parses solana-keygen and base58 secret keys", () => {
    const bytes = Array.from({ length: 64 }, (_, i) => i);
    expect(parseSecretKey(JSON.stringify(bytes))).toHaveLength(64);
    expect(parseSecretKey(getBase58Decoder().decode(Uint8Array.from(bytes)))).toHaveLength(64);
    expect(() => parseSecretKey("[1,2,3]")).toThrow();
  });
});
