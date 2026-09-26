import { EquipSlots, type EquipSlot, type InventoryItemDto, type ItemDto } from "@cryptoarena/shared";
import { itemUpgradeCost, scaleItemStats, type EquippedItemInput } from "@cryptoarena/game-core";
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

export function inventoryToDto(row: InventoryItem & { item: Item }, quantity = row.quantity): InventoryItemDto {
  const cost = row.item.maxUpgrade > row.upgradeLevel ? itemUpgradeCost(row.item.rarity, row.upgradeLevel) : null;
  return {
    id: row.id,
    item: itemToDto(row.item),
    quantity,
    upgradeLevel: row.upgradeLevel,
    equipped: row.equipped,
    equippedSlot: row.equippedSlot,
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

/** Number of inventory slots used: each non-stackable row, plus one per distinct stackable item. */
export async function usedSlots(tx: Tx, userId: string): Promise<number> {
  const rows = await tx.inventoryItem.findMany({ where: { userId }, select: { itemId: true, item: { select: { stackable: true } } } });
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
    const hasStack = item.stackable && (await tx.inventoryItem.count({ where: { userId: input.userId, itemId: item.id } })) > 0;
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

export async function listInventory(tx: Tx, userId: string): Promise<InventoryItemDto[]> {
  const rows = await tx.inventoryItem.findMany({ where: { userId }, include: { item: true }, orderBy: { acquiredAt: "desc" } });
  const out: InventoryItemDto[] = [];
  const stacks = new Map<string, { dto: InventoryItemDto }>();
  for (const row of rows) {
    if (row.item.stackable) {
      const s = stacks.get(row.itemId);
      if (s) {
        s.dto.quantity += row.quantity;
        continue;
      }
      const dto = inventoryToDto(row);
      stacks.set(row.itemId, { dto });
      out.push(dto);
    } else {
      out.push(inventoryToDto(row));
    }
  }
  return out;
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
    where: { userId, item: { key: itemKey, type: "CONSUMABLE" } },
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
  const agg = await tx.inventoryItem.aggregate({ where: { userId, item: { key: itemKey } }, _sum: { quantity: true } });
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
