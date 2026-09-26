import { withTransaction } from "@cryptoarena/database";
import { AppError, assetImbalance, getUserBalances, postJournal, recomputeBalance, resolveAccount, transfer } from "@cryptoarena/economy";
import { describe, expect, it } from "vitest";
import { ctx, makeUser } from "./helpers";

describe("double-entry ledger", () => {
  const c = ctx();

  it("keeps every asset balanced (sum of all balances is zero)", async () => {
    const imbalance = await assetImbalance(c.prisma);
    for (const v of Object.values(imbalance)) expect(v).toBe(0n);
  });

  it("is append-only: UPDATE and DELETE are rejected by the database", async () => {
    const row = await c.prisma.balanceLedger.findFirstOrThrow();
    await expect(c.prisma.$executeRawUnsafe(`UPDATE "BalanceLedger" SET amount = amount + 1 WHERE id = '${row.id}'`)).rejects.toThrow(/append-only/);
    await expect(c.prisma.$executeRawUnsafe(`DELETE FROM "BalanceLedger" WHERE id = '${row.id}'`)).rejects.toThrow(/append-only/);
    await expect(c.prisma.$executeRawUnsafe(`TRUNCATE "BalanceLedger" CASCADE`)).rejects.toThrow(/append-only/);
  });

  it("rejects unbalanced journals and non-positive amounts", async () => {
    const { user } = await makeUser(c);
    await expect(
      withTransaction(c.prisma, (tx) =>
        postJournal(tx, {
          type: "ADMIN_ADJUSTMENT",
          idempotencyKey: `unbalanced-${user.id}`,
          legs: [
            { account: { system: "GOLD_ISSUANCE" }, direction: "DEBIT", amount: 10n },
            { account: { userId: user.id, kind: "GOLD" }, direction: "CREDIT", amount: 9n },
          ],
        }),
      ),
    ).rejects.toThrow(/Unbalanced/);
    await expect(withTransaction(c.prisma, (tx) => postJournal(tx, { type: "ADMIN_ADJUSTMENT", idempotencyKey: `zero-${user.id}`, legs: transfer({ system: "GOLD_ISSUANCE" }, { userId: user.id, kind: "GOLD" }, 0n) }))).rejects.toThrow();
  });

  it("never lets a user balance go negative (insufficient balance)", async () => {
    const { user } = await makeUser(c);
    await expect(
      withTransaction(c.prisma, (tx) => postJournal(tx, { type: "PURCHASE", idempotencyKey: `overdraw-${user.id}`, legs: transfer({ userId: user.id, kind: "GOLD" }, { system: "GOLD_SINK" }, 1_000_000n) })),
    ).rejects.toBeInstanceOf(AppError);
    expect((await getUserBalances(c.prisma, user.id)).gold).toBe(500n);
  });

  it("is idempotent per key", async () => {
    const { user } = await makeUser(c);
    const input = { type: "GAME_REWARD" as const, idempotencyKey: `idem-${user.id}`, legs: transfer({ system: "GOLD_ISSUANCE" }, { userId: user.id, kind: "GOLD" }, 25n) };
    const a = await withTransaction(c.prisma, (tx) => postJournal(tx, input));
    const b = await withTransaction(c.prisma, (tx) => postJournal(tx, input));
    expect(b.duplicate).toBe(true);
    expect(b.journalId).toBe(a.journalId);
    expect((await getUserBalances(c.prisma, user.id)).gold).toBe(525n);
  });

  it("serialises concurrent debits (race condition): no overdraft, cache == ledger", async () => {
    const { user } = await makeUser(c); // 500 welcome gold
    const attempts = Array.from({ length: 12 }, (_, i) =>
      withTransaction(c.prisma, (tx) => postJournal(tx, { type: "PURCHASE", idempotencyKey: `race-${user.id}-${i}`, legs: transfer({ userId: user.id, kind: "GOLD" }, { system: "GOLD_SINK" }, 100n) })).then(
        () => "ok",
        () => "fail",
      ),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === "ok")).toHaveLength(5);
    const account = await withTransaction(c.prisma, (tx) => resolveAccount(tx, { userId: user.id, kind: "GOLD" }));
    const cached = (await getUserBalances(c.prisma, user.id)).gold;
    expect(cached).toBe(0n);
    expect(await recomputeBalance(c.prisma, account.id)).toBe(cached);
  });
});
