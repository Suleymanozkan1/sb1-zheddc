import { withTransaction } from "@cryptoarena/database";
import { applyMultipliers, claimQuest, getUserBalances, grantReward, purchaseProduct, recordQuestProgress, refundPurchase } from "@cryptoarena/economy";
import { describe, expect, it } from "vitest";
import { creditGems, ctx, makeUser } from "./helpers";

const k = () => `k${Math.random().toString(36).slice(2)}`;

describe("reward engine", () => {
  const c = ctx();

  it("applies multipliers with integer math and caps them at 3x", () => {
    expect(applyMultipliers(1_000n, 10_000, 10_000, 10_000)).toBe(1_000n);
    expect(applyMultipliers(1_000n, 15_000, 10_000, 20_000)).toBe(3_000n);
  });

  it("never grants the same reward twice (double reward)", async () => {
    const { user } = await makeUser(c);
    const input = { userId: user.id, source: "KILL" as const, asset: "CRYPTO" as const, baseAmount: 200_000n, idempotencyKey: `kill:test:${user.id}` };
    const [a, b] = await Promise.all([
      withTransaction(c.prisma, (tx) => grantReward(tx, c.config, c.logger, input)).catch((e: unknown) => e),
      withTransaction(c.prisma, (tx) => grantReward(tx, c.config, c.logger, input)).catch((e: unknown) => e),
    ]);
    const ok = [a, b].filter((r) => !(r instanceof Error));
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const again = await withTransaction(c.prisma, (tx) => grantReward(tx, c.config, c.logger, input));
    expect(again.duplicate).toBe(true);
    expect((await getUserBalances(c.prisma, user.id)).cryptoReward).toBe(200_000n);
  });

  it("caps crypto rewards by the per-user daily budget", async () => {
    const cc = ctx({ USER_DAILY_REWARD_CAP: "300000" });
    const { user } = await makeUser(cc);
    const r1 = await withTransaction(cc.prisma, (tx) => grantReward(tx, cc.config, cc.logger, { userId: user.id, source: "QUEST", asset: "CRYPTO", baseAmount: 200_000n, idempotencyKey: k() }));
    const r2 = await withTransaction(cc.prisma, (tx) => grantReward(tx, cc.config, cc.logger, { userId: user.id, source: "QUEST", asset: "CRYPTO", baseAmount: 200_000n, idempotencyKey: k() }));
    const r3 = await withTransaction(cc.prisma, (tx) => grantReward(tx, cc.config, cc.logger, { userId: user.id, source: "QUEST", asset: "CRYPTO", baseAmount: 200_000n, idempotencyKey: k() }));
    expect([r1.status, r2.status, r3.status]).toEqual(["GRANTED", "CAPPED", "REJECTED"]);
    expect((await getUserBalances(cc.prisma, user.id)).cryptoReward).toBe(300_000n);
    ctx({});
  });

  it("guests never earn crypto", async () => {
    const { user } = await makeUser(c, { guest: true, wallet: false });
    const r = await withTransaction(c.prisma, (tx) => grantReward(tx, c.config, c.logger, { userId: user.id, source: "KILL", asset: "CRYPTO", baseAmount: 100n, idempotencyKey: k() }));
    expect(r.status).toBe("REJECTED");
  });
});

describe("shop", () => {
  const c = ctx();

  it("rejects unknown products and insufficient funds (invalid purchase)", async () => {
    const { user } = await makeUser(c);
    await expect(withTransaction(c.prisma, (tx) => purchaseProduct(tx, c.config, c.logger, { userId: user.id, sku: "does_not_exist", quantity: 1, idempotencyKey: k() }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(withTransaction(c.prisma, (tx) => purchaseProduct(tx, c.config, c.logger, { userId: user.id, sku: "char_mage_gems", quantity: 1, idempotencyKey: k() }))).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("unlocks a character once and refuses to sell it twice", async () => {
    const { user } = await makeUser(c);
    await creditGems(c, user.id, 5_000n);
    await withTransaction(c.prisma, (tx) => purchaseProduct(tx, c.config, c.logger, { userId: user.id, sku: "char_mage_gems", quantity: 1, idempotencyKey: k() }));
    expect(await c.prisma.userCharacter.count({ where: { userId: user.id, character: { key: "mage" } } })).toBe(1);
    await expect(withTransaction(c.prisma, (tx) => purchaseProduct(tx, c.config, c.logger, { userId: user.id, sku: "char_mage_gems", quantity: 1, idempotencyKey: k() }))).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    expect((await getUserBalances(c.prisma, user.id)).gems).toBe(3_800n);
  });

  it("is idempotent per purchase key", async () => {
    const { user } = await makeUser(c);
    const key = k();
    await withTransaction(c.prisma, (tx) => purchaseProduct(tx, c.config, c.logger, { userId: user.id, sku: "potion_pack_5", quantity: 1, idempotencyKey: key }));
    const again = await withTransaction(c.prisma, (tx) => purchaseProduct(tx, c.config, c.logger, { userId: user.id, sku: "potion_pack_5", quantity: 1, idempotencyKey: key }));
    expect(again.duplicate).toBe(true);
    expect((await getUserBalances(c.prisma, user.id)).gold).toBe(350n);
  });
});

describe("quests", () => {
  const c = ctx();
  it("can only be claimed once", async () => {
    const { user } = await makeUser(c);
    await withTransaction(c.prisma, (tx) => recordQuestProgress(tx, user.id, "KILL_PLAYER", 1));
    await withTransaction(c.prisma, (tx) => claimQuest(tx, c.config, c.logger, user.id, "ach_first_blood"));
    await expect(withTransaction(c.prisma, (tx) => claimQuest(tx, c.config, c.logger, user.id, "ach_first_blood"))).rejects.toThrow();
    await expect(withTransaction(c.prisma, (tx) => claimQuest(tx, c.config, c.logger, user.id, "daily_duelist"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("refunds", () => {
  const c = ctx();

  async function admin() {
    const { user } = await makeUser(c);
    return c.prisma.adminUser.create({ data: { userId: user.id, role: "SUPER_ADMIN" } });
  }

  it("revokes premium time and inventory slots together with the payment", async () => {
    const a = await admin();
    const { user } = await makeUser(c);
    await creditGems(c, user.id, 1_000n);
    const { purchase } = await withTransaction(c.prisma, (tx) => purchaseProduct(tx, c.config, c.logger, { userId: user.id, sku: "premium_vip_30", quantity: 1, idempotencyKey: k() }));
    const bought = await c.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(bought.premiumTier).toBe("VIP");
    expect(bought.inventorySlots).toBe(80);
    await withTransaction(c.prisma, (tx) => refundPurchase(tx, c.logger, purchase.id, a.id, "test refund", null));
    const refunded = await c.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refunded.premiumTier).toBe("FREE");
    expect(refunded.premiumUntil).toBeNull();
    expect(refunded.inventorySlots).toBe(60);
    expect((await getUserBalances(c.prisma, user.id)).gems).toBe(1_000n);
  });

  it("refuses to refund a character that already has match history", async () => {
    const a = await admin();
    const { user } = await makeUser(c);
    await creditGems(c, user.id, 5_000n);
    const { purchase } = await withTransaction(c.prisma, (tx) => purchaseProduct(tx, c.config, c.logger, { userId: user.id, sku: "char_mage_gems", quantity: 1, idempotencyKey: k() }));
    const uc = await c.prisma.userCharacter.findFirstOrThrow({ where: { userId: user.id, character: { key: "mage" } } });
    const match = await c.prisma.gameMatch.create({ data: { roomId: "r", mode: "CASUAL", mapKey: "m", maxPlayers: 2, tickRate: 60 } });
    await c.prisma.gameMatchPlayer.create({ data: { matchId: match.id, userId: user.id, userCharacterId: uc.id } });
    await expect(withTransaction(c.prisma, (tx) => refundPurchase(tx, c.logger, purchase.id, a.id, "test refund", null))).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await c.prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } })).status).toBe("COMPLETED");
  });
});
