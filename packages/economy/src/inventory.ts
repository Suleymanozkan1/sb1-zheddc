import { EquipSlots, type EquipSlot, type InventoryItemDto, type ItemDto } from "@cryptoarena/shared";
import { itemSellValue, itemUpgradeCost, scaleItemStats, type EquippedItemInput, type SellRates } from "@cryptoarena/game-core";
import type { AppConfig } from "@cryptoarena/config";
import type { Item, InventoryItem, ItemSource, Tx } from "@cryptoarena/database";
import { parseItemStats } from "./catalog";
import { AppError } from "./errors";
import { postJournal, transfer } from "./ledger";

export function itemToDto(item: Item): ItemDto {
  return {
    key: item.key,
    name: item.name,
    description: item.description,
    type: item.type,
    rarity: item.rarity,
    stats: parseItemStats(item.stats),
    stackable: item.stackable,
    maxUpgrade: item.maxUpgrade,
    levelRequirement: item.levelRequirement,
  };
}

/** Sell prices come from config (never hard-coded). */
export function sellRatesOf(config: AppConfig): SellRates {
  return {
    gold: {
      COMMON: config.SELL_GOLD_COMMON,
      UNCOMMON: config.SELL_GOLD_UNCOMMON,
      RARE: config.SELL_GOLD_RARE,
      EPIC: config.SELL_GOLD_EPIC,
      LEGENDARY: config.SELL_GOLD_LEGENDARY,
      MYTHIC: config.SELL_GOLD_MYTHIC,
    },
    consumableBps: config.SELL_CONSUMABLE_BPS,
    upgradeRefundBps: config.SELL_UPGRADE_REFUND_BPS,
  };
}

/** Skins are bought with gems and bound to a character; they cannot be turned into gold. */
function sellable(item: Item): boolean {
  return item.type !== "SKIN";
}

function sellValueOf(rates: SellRates | null, row: InventoryItem & { item: Item }, quantity: number): bigint | null {
  if (!rates || !sellable(row.item) || row.equipped) return null;
  return itemSellValue(rates, row.item.rarity, row.item.type === "CONSUMABLE", row.upgradeLevel, quantity);
}

export function inventoryToDto(row: InventoryItem & { item: Item }, quantity = row.quantity, rates: SellRates | null = null): InventoryItemDto {
  const cost = row.item.maxUpgrade > row.upgradeLevel ? itemUpgradeCost(row.item.rarity, row.upgradeLevel) : null;
  const sell = sellValueOf(rates, row, quantity);
  return {
    id: row.id,
    item: itemToDto(row.item),
    quantity,
    upgradeLevel: row.upgradeLevel,
    equipped: row.equipped,
    equippedSlot: row.equippedSlot,
    locked: row.locked,
    inStash: row.inStash,
    sellValue: sell === null ? null : sell.toString(),
    effectiveStats: scaleItemStats(parseItemStats(row.item.stats), row.upgradeLevel),
    nextUpgradeCost: cost === null ? null : cost.toString(),
    acquiredAt: row.acquiredAt.toISOString(),
  };
}

/** Slot key for an item. Skins are equipped per character: "SKIN:<characterKey>". */
export function slotFor(item: Item): string | null {
  if ((EquipSlots as readonly string[]).includes(item.type)) return item.type as EquipSlot;
  if (item.type === "SKIN") {
    const ck = (item.metadata as { characterKey?: unknown } | null)?.characterKey;
    return typeof ck === "string" ? `SKIN:${ck}` : null;
  }
  return null;
}

/**
 * Slots used in the inventory (or the stash): each non-stackable row, plus one per distinct
 * stackable item.
 */
export async function usedSlots(tx: Tx, userId: string, inStash = false): Promise<number> {
  const rows = await tx.inventoryItem.findMany({ where: { userId, inStash }, select: { itemId: true, item: { select: { stackable: true } } } });
  const stackables = new Set<string>();
  let used = 0;
  for (const r of rows) {
    if (r.item.stackable) stackables.add(r.itemId);
    else used++;
  }
  return used + stackables.size;
}

export interface GrantItemInput {
  userId: string;
  itemKey: string;
  quantity: number;
  source: ItemSource;
  /** Idempotency key: the same sourceRef can only ever produce one inventory row. */
  sourceRef: string;
  /** Skip the capacity check (purchases/admin grants must not silently fail). */
  ignoreCapacity?: boolean;
}

export async function grantItem(tx: Tx, input: GrantItemInput): Promise<{ row: InventoryItem & { item: Item }; duplicate: boolean }> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000) throw new AppError("BAD_REQUEST", "Invalid quantity");
  const existing = await tx.inventoryItem.findUnique({ where: { sourceRef: input.sourceRef }, include: { item: true } });
  if (existing) return { row: existing, duplicate: true };

  const item = await tx.item.findUnique({ where: { key: input.itemKey } });
  if (!item || !item.active) throw new AppError("NOT_FOUND", `Unknown item ${input.itemKey}`);
  if (!item.stackable && input.quantity !== 1) throw new AppError("BAD_REQUEST", "Non-stackable items are granted one at a time");

  if (!input.ignoreCapacity) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { inventorySlots: true } });
    const hasStack = item.stackable && (await tx.inventoryItem.count({ where: { userId: input.userId, itemId: item.id, inStash: false } })) > 0;
    if (!hasStack && (await usedSlots(tx, input.userId)) >= user.inventorySlots) {
      throw new AppError("INVENTORY_FULL", "Inventory is full");
    }
  }

  const row = await tx.inventoryItem.create({
    data: { userId: input.userId, itemId: item.id, quantity: input.quantity, source: input.source, sourceRef: input.sourceRef },
    include: { item: true },
  });
  return { row, duplicate: false };
}

/** Inventory and stash items; stackable rows are merged per item and location. */
export async function listInventory(tx: Tx, userId: string, rates: SellRates | null = null): Promise<InventoryItemDto[]> {
  const rows = await tx.inventoryItem.findMany({ where: { userId }, include: { item: true }, orderBy: { acquiredAt: "desc" } });
  const out: InventoryItemDto[] = [];
  const stacks = new Map<string, { dto: InventoryItemDto; row: InventoryItem & { item: Item } }>();
  for (const row of rows) {
    if (row.item.stackable) {
      const key = `${row.itemId}:${row.inStash}`;
      const s = stacks.get(key);
      if (s) {
        s.dto.quantity += row.quantity;
        s.dto.locked ||= row.locked;
        continue;
      }
      const dto = inventoryToDto(row, row.quantity, rates);
      stacks.set(key, { dto, row });
      out.push(dto);
    } else {
      out.push(inventoryToDto(row, row.quantity, rates));
    }
  }
  for (const { dto, row } of stacks.values()) {
    const v = sellValueOf(rates, row, dto.quantity);
    dto.sellValue = v === null ? null : v.toString();
  }
  return out;
}

/** The row plus, for stackable items, every other row of the same item in the same location. */
async function stackRows(tx: Tx, userId: string, inventoryItemId: string): Promise<(InventoryItem & { item: Item })[]> {
  const row = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, userId }, include: { item: true } });
  if (!row) throw new AppError("NOT_FOUND", "Item not found in your inventory");
  if (!row.item.stackable) return [row];
  return tx.inventoryItem.findMany({ where: { userId, itemId: row.itemId, inStash: row.inStash }, include: { item: true } });
}

export interface SellResult {
  sold: number;
  gold: bigint;
  duplicate: boolean;
}

/**
 * Sells items (stackables: the whole stack) for gold. Equipped, locked and skin items are refused.
 * Rows are removed and the gold is credited through one idempotent ITEM_SALE journal.
 */
export async function sellItems(tx: Tx, config: AppConfig, input: { userId: string; inventoryItemIds: string[]; idempotencyKey: string }): Promise<SellResult> {
  const key = `item_sale:${input.userId}:${input.idempotencyKey}`;
  if (await tx.ledgerJournal.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) return { sold: 0, gold: 0n, duplicate: true };
  const ids = [...new Set(input.inventoryItemIds)];
  if (ids.length === 0) throw new AppError("BAD_REQUEST", "Nothing to sell");
  if (ids.length > config.SELL_MAX_ITEMS) throw new AppError("LIMIT_EXCEEDED", `You can sell at most ${config.SELL_MAX_ITEMS} items at once`);

  const rates = sellRatesOf(config);
  const rows = new Map<string, InventoryItem & { item: Item }>();
  let gold = 0n;
  let sold = 0;
  for (const id of ids) {
    const group = await stackRows(tx, input.userId, id);
    const first = group[0]!;
    if (rows.has(first.id)) continue; // two ids of the same stack
    if (!sellable(first.item)) throw new AppError("BAD_REQUEST", `${first.item.name} cannot be sold`);
    if (group.some((r) => r.equipped)) throw new AppError("BAD_REQUEST", `Unequip ${first.item.name} before selling it`);
    if (group.some((r) => r.locked)) throw new AppError("FORBIDDEN", `${first.item.name} is locked`);
    const quantity = group.reduce((n, r) => n + r.quantity, 0);
    gold += sellValueOf(rates, first, quantity) ?? 0n;
    sold++;
    for (const r of group) rows.set(r.id, r);
  }

  // Delete exactly what was priced; a concurrent change (equip, lock, sale) aborts the transaction.
  const removed = await tx.inventoryItem.deleteMany({ where: { id: { in: [...rows.keys()] }, userId: input.userId, equipped: false, locked: false } });
  if (removed.count !== rows.size) throw new AppError("CONFLICT", "Your inventory changed, please retry");
  if (gold > 0n) {
    await postJournal(tx, {
      type: "ITEM_SALE",
      idempotencyKey: key,
      metadata: { items: [...rows.values()].map((r) => ({ itemKey: r.item.key, quantity: r.quantity, upgradeLevel: r.upgradeLevel })) },
      legs: transfer({ system: "GOLD_ISSUANCE" }, { userId: input.userId, kind: "GOLD" }, gold),
    });
  }
  return { sold, gold, duplicate: false };
}

export async function setItemLocked(tx: Tx, userId: string, inventoryItemId: string, locked: boolean): Promise<void> {
  const group = await stackRows(tx, userId, inventoryItemId);
  await tx.inventoryItem.updateMany({ where: { id: { in: group.map((r) => r.id) }, userId }, data: { locked } });
}

/** Moves an item (stackables: the whole stack) between the inventory and the stash. */
export async function moveItem(tx: Tx, userId: string, inventoryItemId: string, toStash: boolean): Promise<void> {
  const group = await stackRows(tx, userId, inventoryItemId);
  const first = group[0]!;
  if (first.inStash === toStash) return;
  if (group.some((r) => r.equipped)) throw new AppError("BAD_REQUEST", "Unequip the item before storing it");
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { inventorySlots: true, stashSlots: true } });
  // A stackable joining an existing stack at the destination needs no new slot.
  const joins = first.item.stackable && (await tx.inventoryItem.count({ where: { userId, itemId: first.itemId, inStash: toStash } })) > 0;
  const capacity = toStash ? user.stashSlots : user.inventorySlots;
  if (!joins && (await usedSlots(tx, userId, toStash)) >= capacity) {
    throw new AppError(toStash ? "STASH_FULL" : "INVENTORY_FULL", toStash ? "Stash is full" : "Inventory is full");
  }
  const res = await tx.inventoryItem.updateMany({ where: { id: { in: group.map((r) => r.id) }, userId, equipped: false, inStash: !toStash }, data: { inStash: toStash } });
  if (res.count !== group.length) throw new AppError("CONFLICT", "Your inventory changed, please retry");
}

async function maxCharacterLevel(tx: Tx, userId: string): Promise<number> {
  const agg = await tx.userCharacter.aggregate({ where: { userId }, _max: { level: true } });
  return agg._max.level ?? 1;
}

export async function equipItem(tx: Tx, userId: string, inventoryItemId: string): Promise<InventoryItemDto> {
  const row = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, userId }, include: { item: true } });
  if (!row) throw new AppError("NOT_FOUND", "Item not found in your inventory");
  const slot = slotFor(row.item);
  if (!slot) throw new AppError("BAD_REQUEST", "This item cannot be equipped");
  if (row.inStash) throw new AppError("BAD_REQUEST", "Take the item out of the stash first");
  if (row.item.levelRequirement > (await maxCharacterLevel(tx, userId))) {
    throw new AppError("FORBIDDEN", `Requires level ${row.item.levelRequirement}`);
  }
  if (row.equipped) return inventoryToDto(row);
  await tx.inventoryItem.updateMany({ where: { userId, equipped: true, equippedSlot: slot }, data: { equipped: false, equippedSlot: null } });
  const updated = await tx.inventoryItem.update({ where: { id: row.id }, data: { equipped: true, equippedSlot: slot }, include: { item: true } });
  return inventoryToDto(updated);
}

export async function unequipItem(tx: Tx, userId: string, inventoryItemId: string): Promise<InventoryItemDto> {
  const row = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, userId }, include: { item: true } });
  if (!row) throw new AppError("NOT_FOUND", "Item not found in your inventory");
  const updated = await tx.inventoryItem.update({ where: { id: row.id }, data: { equipped: false, equippedSlot: null }, include: { item: true } });
  return inventoryToDto(updated);
}

export async function upgradeItem(tx: Tx, userId: string, inventoryItemId: string, idempotencyKey: string): Promise<InventoryItemDto> {
  const row = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, userId }, include: { item: true } });
  if (!row) throw new AppError("NOT_FOUND", "Item not found in your inventory");
  if (row.item.stackable || row.item.maxUpgrade === 0) throw new AppError("BAD_REQUEST", "This item cannot be upgraded");
  const cost = row.upgradeLevel < row.item.maxUpgrade ? itemUpgradeCost(row.item.rarity, row.upgradeLevel) : null;
  if (cost === null) throw new AppError("LIMIT_EXCEEDED", "Item is already at max upgrade");

  const posted = await postJournal(tx, {
    type: "ITEM_UPGRADE",
    idempotencyKey: `item_upgrade:${userId}:${idempotencyKey}`,
    reference: row.id,
    metadata: { itemKey: row.item.key, from: row.upgradeLevel, to: row.upgradeLevel + 1 },
    legs: transfer({ userId, kind: "GOLD" }, { system: "GOLD_SINK" }, cost),
  });
  if (posted.duplicate) {
    const fresh = await tx.inventoryItem.findUniqueOrThrow({ where: { id: row.id }, include: { item: true } });
    return inventoryToDto(fresh);
  }
  // Optimistic guard: only upgrade from the level we priced.
  const res = await tx.inventoryItem.updateMany({
    where: { id: row.id, upgradeLevel: row.upgradeLevel },
    data: { upgradeLevel: { increment: 1 } },
  });
  if (res.count !== 1) throw new AppError("CONFLICT", "Item changed concurrently, please retry");
  const updated = await tx.inventoryItem.findUniqueOrThrow({ where: { id: row.id }, include: { item: true } });
  return inventoryToDto(updated);
}

/** Consumes one unit of a consumable. Returns the item's metadata (effect description). */
export async function consumeItem(tx: Tx, userId: string, itemKey: string): Promise<Record<string, unknown>> {
  const row = await tx.inventoryItem.findFirst({
    where: { userId, inStash: false, item: { key: itemKey, type: "CONSUMABLE" } },
    include: { item: true },
    orderBy: { acquiredAt: "asc" },
  });
  if (!row) throw new AppError("NOT_FOUND", "You do not own this consumable");
  if (row.quantity > 1) {
    const res = await tx.inventoryItem.updateMany({ where: { id: row.id, quantity: row.quantity }, data: { quantity: { decrement: 1 } } });
    if (res.count !== 1) throw new AppError("CONFLICT", "Item changed concurrently, please retry");
  } else {
    await tx.inventoryItem.delete({ where: { id: row.id } });
  }
  return (row.item.metadata ?? {}) as Record<string, unknown>;
}

export async function countItem(tx: Tx, userId: string, itemKey: string): Promise<number> {
  const agg = await tx.inventoryItem.aggregate({ where: { userId, inStash: false, item: { key: itemKey } }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

/** Equipped combat items (skins excluded) for stat computation. */
export async function getEquippedForStats(tx: Tx, userId: string): Promise<EquippedItemInput[]> {
  const rows = await tx.inventoryItem.findMany({ where: { userId, equipped: true }, include: { item: true } });
  return rows
    .filter((r) => r.item.type !== "SKIN" && r.item.type !== "CONSUMABLE")
    .map((r) => ({ stats: parseItemStats(r.item.stats), upgradeLevel: r.upgradeLevel }));
}

export async function getEquippedSkinTint(tx: Tx, userId: string, characterKey: string): Promise<number | null> {
  const row = await tx.inventoryItem.findFirst({ where: { userId, equipped: true, equippedSlot: `SKIN:${characterKey}` }, include: { item: true } });
  const tint = (row?.item.metadata as { tint?: unknown } | undefined)?.tint;
  return typeof tint === "number" ? tint : null;
}
