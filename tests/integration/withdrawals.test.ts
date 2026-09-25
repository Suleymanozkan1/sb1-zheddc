import { MockSolanaGateway } from "@cryptoarena/blockchain";
import { cancelWithdrawal, getUserBalances, requestWithdrawal } from "@cryptoarena/economy";
import { describe, expect, it } from "vitest";
import { WithdrawalWorker } from "../../apps/blockchain-service/src/worker";
import { creditReward, ctx, makeUser, randomAddress } from "./helpers";

const key = () => `k${Math.random().toString(36).slice(2)}${Date.now()}`;

describe("withdrawals", () => {
  const c = ctx({ WITHDRAWAL_COOLDOWN_SECONDS: "0", WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS: "0", WITHDRAWAL_MAX_ATTEMPTS: "3" });

  async function funded(amount = 50_000_000n) {
    const u = await makeUser(c);
    await creditReward(c, u.user.id, amount);
    return u;
  }

  it("rejects insufficient balance", async () => {
    const { user, wallet } = await makeUser(c);
    await expect(requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: key() })).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("only pays out to the user's verified wallets", async () => {
    const { user } = await funded();
    await expect(requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: randomAddress(), idempotencyKey: key() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces min / max / daily limits", async () => {
    const { user, wallet } = await funded(2_000_000_000n);
    const addr = wallet!.address;
    await expect(requestWithdrawal(c, { userId: user.id, amount: 1n, walletAddress: addr, idempotencyKey: key() })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await expect(requestWithdrawal(c, { userId: user.id, amount: c.config.MAX_WITHDRAWAL + 1n, walletAddress: addr, idempotencyKey: key() })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await requestWithdrawal(c, { userId: user.id, amount: c.config.MAX_WITHDRAWAL, walletAddress: addr, idempotencyKey: key() });
    await requestWithdrawal(c, { userId: user.id, amount: c.config.MAX_WITHDRAWAL, walletAddress: addr, idempotencyKey: key() });
    await expect(requestWithdrawal(c, { userId: user.id, amount: c.config.MIN_WITHDRAWAL, walletAddress: addr, idempotencyKey: key() })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("enforces the cooldown", async () => {
    const cc = ctx({ WITHDRAWAL_COOLDOWN_SECONDS: "3600", WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS: "0" });
    const { user, wallet } = await funded();
    await requestWithdrawal(cc, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: key() });
    await expect(requestWithdrawal(cc, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: key() })).rejects.toMatchObject({ code: "COOLDOWN" });
    ctx({ WITHDRAWAL_COOLDOWN_SECONDS: "0", WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS: "0", WITHDRAWAL_MAX_ATTEMPTS: "3" });
  });

  it("is idempotent for the same request key (duplicate withdrawal)", async () => {
    const { user, wallet } = await funded();
    const k = key();
    const a = await requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: k });
    const b = await requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: k });
    expect(b.duplicate).toBe(true);
    expect(b.withdrawal.id).toBe(a.withdrawal.id);
    expect((await getUserBalances(c.prisma, user.id)).cryptoReward).toBe(50_000_000n - 10_000_000n - c.config.WITHDRAWAL_FEE);
  });

  it("serialises concurrent requests so the balance can't be spent twice (race condition)", async () => {
    const { user, wallet } = await funded(12_000_000n);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: key() })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getUserBalances(c.prisma, user.id)).cryptoReward).toBe(12_000_000n - 10_000_000n - c.config.WITHDRAWAL_FEE);
  });

  it("worker pays exactly once and marks COMPLETED only after finality", async () => {
    const { user, wallet } = await funded();
    const { withdrawal } = await requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: key() });
    const gw = new MockSolanaGateway("devnet");
    const worker = new WithdrawalWorker({ ctx: c, gateway: gw, signer: null });
    // Only process this test's withdrawal.
    await c.prisma.withdrawal.updateMany({ where: { id: { not: withdrawal.id }, status: { in: ["PENDING", "PROCESSING"] } }, data: { nextAttemptAt: new Date(Date.now() + 3_600_000) } });

    const w1 = await c.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(await worker.process(w1)).toBe("sent");
    const w2 = await c.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(w2.status).toBe("PENDING"); // not claimed in this direct call; still not COMPLETED
    expect(w2.signature).toBeTruthy();
    expect(await worker.process(w2)).toBe("completed");
    const w3 = await c.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(w3.status).toBe("COMPLETED");
    expect(gw.sent).toHaveLength(1);
    // Re-processing a completed withdrawal never sends again.
    expect(await worker.process(w3)).toBe("completed");
    expect(gw.sent).toHaveLength(1);
  });

  it("keeps the signature when broadcasting fails and never double-sends", async () => {
    const { user, wallet } = await funded();
    const { withdrawal } = await requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: key() });
    const gw = new MockSolanaGateway("devnet");
    gw.failNextSend = new Error("RPC timeout");
    const worker = new WithdrawalWorker({ ctx: c, gateway: gw, signer: null });
    const w = await c.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(await worker.process(w)).toBe("waiting");
    const after = await c.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(after.signature).toBeTruthy();
    expect(after.status).not.toBe("COMPLETED");
    // Blockhash still valid → the SAME signed transaction is re-broadcast, not a new one.
    expect(await worker.process(after)).toBe("waiting");
    const again = await c.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(again.signature).toBe(after.signature);
    expect(await worker.process(again)).toBe("completed");
    expect(new Set(gw.sent).size).toBe(1);
  });

  it("refunds after max attempts once no transaction can land", async () => {
    const { user, wallet } = await funded();
    const before = (await getUserBalances(c.prisma, user.id)).cryptoReward;
    const { withdrawal } = await requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: key() });
    const gw = new MockSolanaGateway("devnet");
    gw.landSentTransactions = false;
    const worker = new WithdrawalWorker({ ctx: c, gateway: gw, signer: null });
    for (let i = 0; i < 10; i++) {
      const w = await c.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
      if (w.status === "FAILED") break;
      gw.blockHeight += 1000n; // every previous blockhash expires
      await worker.process(w);
    }
    const final = await c.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(final.status).toBe("FAILED");
    expect((await getUserBalances(c.prisma, user.id)).cryptoReward).toBe(before);
  });

  it("allows cancelling only PENDING withdrawals and refunds the hold", async () => {
    const { user, wallet } = await funded();
    const before = (await getUserBalances(c.prisma, user.id)).cryptoReward;
    const { withdrawal } = await requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: key() });
    await cancelWithdrawal(c, withdrawal.id, { userId: user.id });
    expect((await getUserBalances(c.prisma, user.id)).cryptoReward).toBe(before);
    await expect(cancelWithdrawal(c, withdrawal.id, { userId: user.id })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("guests and suspended accounts cannot withdraw", async () => {
    const { user, wallet } = await funded();
    await c.prisma.user.update({ where: { id: user.id }, data: { withdrawalsSuspended: true } });
    await expect(requestWithdrawal(c, { userId: user.id, amount: 10_000_000n, walletAddress: wallet!.address, idempotencyKey: key() })).rejects.toMatchObject({ code: "ACCOUNT_RESTRICTED" });
  });
});
