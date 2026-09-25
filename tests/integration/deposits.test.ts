import { MockSolanaGateway } from "@cryptoarena/blockchain";
import { AppError, getUserBalances, prepareDeposit, verifyDeposit } from "@cryptoarena/economy";
import { describe, expect, it } from "vitest";
import { ctx, makeUser, randomAddress } from "./helpers";

describe("deposits", () => {
  const c = ctx();
  const gw = new MockSolanaGateway("devnet");

  async function prepared() {
    const { user, wallet } = await makeUser(c);
    const { deposit } = await prepareDeposit(c, gw, user.id, 5_000_000n);
    return { user, wallet: wallet!, deposit };
  }

  function land(d: { reference: string; recipient: string; amount: bigint; mint: string }, payer: string, signature: string, over: Partial<Parameters<MockSolanaGateway["recordTransfer"]>[0]> = {}) {
    gw.recordTransfer({ signature, payer, mint: d.mint, amount: d.amount, recipientTokenAccount: d.recipient, recipientOwner: c.config.TREASURY_PUBLIC_KEY, reference: d.reference, ...over });
  }

  it("credits a verified deposit exactly once (duplicate deposit)", async () => {
    const { user, wallet, deposit } = await prepared();
    const sig = `mock${randomAddress()}`;
    land(deposit, wallet.address, sig);
    const first = await verifyDeposit(c, gw, user.id, deposit.id, sig);
    const second = await verifyDeposit(c, gw, user.id, deposit.id, sig);
    expect(first.status).toBe("CREDITED");
    expect(second.status).toBe("CREDITED");
    expect((await getUserBalances(c.prisma, user.id)).cryptoSpendable).toBe(5_000_000n);
    const journals = await c.prisma.ledgerJournal.count({ where: { idempotencyKey: `deposit:${sig}` } });
    expect(journals).toBe(1);
  });

  it("rejects replaying one transaction for a second deposit (transaction replay)", async () => {
    const a = await prepared();
    const sig = `mock${randomAddress()}`;
    land(a.deposit, a.wallet.address, sig);
    await verifyDeposit(c, gw, a.user.id, a.deposit.id, sig);
    const { deposit: another } = await prepareDeposit(c, gw, a.user.id, 5_000_000n);
    await expect(verifyDeposit(c, gw, a.user.id, another.id, sig)).rejects.toMatchObject({ code: "DUPLICATE_TRANSACTION" });
  });

  it("fails deposits with the wrong amount or mint and never credits them", async () => {
    const { user, wallet, deposit } = await prepared();
    const sig = `mock${randomAddress()}`;
    land(deposit, wallet.address, sig, { amount: 1n });
    const res = await verifyDeposit(c, gw, user.id, deposit.id, sig);
    expect(res.status).toBe("FAILED");
    expect((await getUserBalances(c.prisma, user.id)).cryptoSpendable).toBe(0n);
  });

  it("waits for finality before crediting", async () => {
    const { user, wallet, deposit } = await prepared();
    const sig = `mock${randomAddress()}`;
    land(deposit, wallet.address, sig, { confirmationStatus: "confirmed" });
    expect((await verifyDeposit(c, gw, user.id, deposit.id, sig)).status).toBe("SUBMITTED");
    land(deposit, wallet.address, sig);
    expect((await verifyDeposit(c, gw, user.id, deposit.id, sig)).status).toBe("CREDITED");
  });

  it("does not let another user verify someone else's deposit", async () => {
    const { deposit, wallet } = await prepared();
    const { user: other } = await makeUser(c);
    const sig = `mock${randomAddress()}`;
    land(deposit, wallet.address, sig);
    await expect(verifyDeposit(c, gw, other.id, deposit.id, sig)).rejects.toBeInstanceOf(AppError);
  });

  it("enforces deposit limits and requires a verified wallet", async () => {
    const { user } = await makeUser(c);
    await expect(prepareDeposit(c, gw, user.id, 1n)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    const { user: noWallet } = await makeUser(c, { wallet: false });
    await expect(prepareDeposit(c, gw, noWallet.id, 5_000_000n)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
