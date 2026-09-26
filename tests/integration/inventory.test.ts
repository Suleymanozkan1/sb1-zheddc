import { randomBytes } from "node:crypto";
import { withTransaction } from "@cryptoarena/database";
import { getUserBalances, grantItem, listInventory, moveItem, sellItems, sellRatesOf, setItemLocked, equipItem, consumeItem, AppError } from "@cryptoarena/economy";
import { afterAll, describe, expect, it } from "vitest";
import { ctx, makeUser } from "./helpers";

const c = ctx();
const key = (): string => randomBytes(8).toString("hex");

afterAll(async () => {
  await c.prisma.$disconnect();
});

async function give(userId: string, itemKey: string, quantity = 1) {
  return withTransaction(c.prisma, (tx) => grantItem(tx, { userId, itemKey, quantity, source: "ADMIN", sourceRef: `test:${key()}` }));
}

/** A user without the starter potions, so slot and item counts start at zero. */
async function freshUser() {
  const { user } = await makeUser(c);
  await c.prisma.inventoryItem.deleteMany({ where: { userId: user.id } });
  return { user };
}

const gold = async (userId: string) => (await getUserBalances(c.prisma, userId)).gold;
const sell = (userId: string, ids: string[], idempotencyKey = key()) => withTransaction(c.prisma, (tx) => sellItems(tx, c.config, { userId, inventoryItemIds: ids, idempotencyKey }));

describe("inventory: selling, locks and the stash", () => {
  it("sells items for config-priced gold through an idempotent ledger journal", async () => {
    const { user } = await freshUser();
    const before = await gold(user.id);
    const a = await give(user.id, "blade_common");
    const b = await give(user.id, "vest_rare");
    const idem = key();
    const res = await sell(user.id, [a.row.id, b.row.id], idem);
    const expected = BigInt(c.config.SELL_GOLD_COMMON + c.config.SELL_GOLD_RARE);
    expect(res).toMatchObject({ sold: 2, gold: expected, duplicate: false });
    expect(await gold(user.id)).toBe(before + expected);
    expect(await c.prisma.inventoryItem.count({ where: { userId: user.id } })).toBe(0);
    // A retry with the same key pays nothing twice.
    expect((await sell(user.id, [a.row.id], idem)).duplicate).toBe(true);
    expect(await gold(user.id)).toBe(before + expected);
    const journal = await c.prisma.ledgerJournal.findUniqueOrThrow({ where: { idempotencyKey: `item_sale:${user.id}:${idem}` } });
    expect(journal.type).toBe("ITEM_SALE");
  });

  it("sells a whole consumable stack at the consumable rate", async () => {
    const { user } = await freshUser();
    const first = await give(user.id, "potion_health", 5);
    await give(user.id, "potion_health", 3);
    const list = await listInventory(c.prisma, user.id, sellRatesOf(c.config));
    const stack = list.find((i) => i.item.key === "potion_health")!;
    expect(stack.quantity).toBe(8);
    const expected = BigInt(Math.floor((c.config.SELL_GOLD_COMMON * c.config.SELL_CONSUMABLE_BPS * 8) / 10_000));
    expect(stack.sellValue).toBe(expected.toString());
    expect((await sell(user.id, [first.row.id])).gold).toBe(expected);
    expect(await c.prisma.inventoryItem.count({ where: { userId: user.id } })).toBe(0);
  });

  it("refuses locked, equipped and skin items, and leaves everything untouched", async () => {
    const { user } = await freshUser();
    const before = await gold(user.id);
    const locked = await give(user.id, "blade_uncommon");
    const worn = await give(user.id, "visor_common");
    const skin = await give(user.id, "skin_tank_titanium");
    const free = await give(user.id, "loop_common");
    await withTransaction(c.prisma, (tx) => setItemLocked(tx, user.id, locked.row.id, true));
    await withTransaction(c.prisma, (tx) => equipItem(tx, user.id, worn.row.id));
    for (const id of [locked.row.id, worn.row.id, skin.row.id]) {
      await expect(sell(user.id, [free.row.id, id])).rejects.toBeInstanceOf(AppError);
    }
    expect(await c.prisma.inventoryItem.count({ where: { userId: user.id } })).toBe(4);
    expect(await gold(user.id)).toBe(before);
    // Unlocking makes it sellable again.
    await withTransaction(c.prisma, (tx) => setItemLocked(tx, user.id, locked.row.id, false));
    expect((await sell(user.id, [locked.row.id])).sold).toBe(1);
  });

  it("pays back part of the upgrade gold", async () => {
    const { user } = await freshUser();
    const it = await give(user.id, "blade_common");
    await c.prisma.inventoryItem.update({ where: { id: it.row.id }, data: { upgradeLevel: 2 } });
    const res = await sell(user.id, [it.row.id]);
    // itemUpgradeCost(COMMON, 0) + (COMMON, 1) = 50 + 68, refunded at SELL_UPGRADE_REFUND_BPS.
    const refund = (118n * BigInt(c.config.SELL_UPGRADE_REFUND_BPS)) / 10_000n;
    expect(res.gold).toBe(BigInt(c.config.SELL_GOLD_COMMON) + refund);
  });

  it("stash items free inventory slots, respect stash capacity and cannot be equipped or consumed", async () => {
    const { user } = await freshUser();
    await c.prisma.user.update({ where: { id: user.id }, data: { inventorySlots: 1, stashSlots: 1 } });
    const a = await give(user.id, "striders_common");
    await expect(give(user.id, "core_common")).rejects.toMatchObject({ code: "INVENTORY_FULL" });
    await withTransaction(c.prisma, (tx) => moveItem(tx, user.id, a.row.id, true));
    const b = await give(user.id, "core_common"); // the freed slot is usable again
    await expect(withTransaction(c.prisma, (tx) => moveItem(tx, user.id, b.row.id, true))).rejects.toMatchObject({ code: "STASH_FULL" });
    await expect(withTransaction(c.prisma, (tx) => equipItem(tx, user.id, a.row.id))).rejects.toBeInstanceOf(AppError);
    // Taking it out needs a free inventory slot.
    await expect(withTransaction(c.prisma, (tx) => moveItem(tx, user.id, a.row.id, false))).rejects.toMatchObject({ code: "INVENTORY_FULL" });

    // Stashed potions are not consumed in the arena.
    await c.prisma.user.update({ where: { id: user.id }, data: { inventorySlots: 10, stashSlots: 10 } });
    const potion = await give(user.id, "potion_health", 2);
    await withTransaction(c.prisma, (tx) => moveItem(tx, user.id, potion.row.id, true));
    await expect(withTransaction(c.prisma, (tx) => consumeItem(tx, user.id, "potion_health"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cannot stash equipped items", async () => {
    const { user } = await freshUser();
    const it = await give(user.id, "blade_common");
    await withTransaction(c.prisma, (tx) => equipItem(tx, user.id, it.row.id));
    await expect(withTransaction(c.prisma, (tx) => moveItem(tx, user.id, it.row.id, true))).rejects.toBeInstanceOf(AppError);
  });
});
