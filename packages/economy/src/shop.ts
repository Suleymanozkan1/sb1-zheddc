import type { AppConfig } from "@cryptoarena/config";
import type { ShopProductDto } from "@cryptoarena/shared";
import type { ShopProduct, Tx } from "@cryptoarena/database";
import { LogEvent, type Logger } from "@cryptoarena/observability";
import { getUserBalances, type AccountRef, type SystemAccountKey } from "./accounts";
import { writeAudit } from "./audit";
import { grantCharacter } from "./characters";
import { requireFeature } from "./compliance";
import { AppError } from "./errors";
import { grantItem } from "./inventory";
import { postJournal, transfer, type LedgerLeg } from "./ledger";
import { parseProductMetadata } from "./products";

export function productToDto(p: ShopProduct, owned?: boolean): ShopProductDto {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    category: p.category,
    price: p.price.toString(),
    currency: p.currency,
    rarity: p.rarity,
    metadata: parseProductMetadata(p.metadata),
    ...(owned === undefined ? {} : { owned }),
  };
}

export async function listShop(tx: Tx, userId: string | null): Promise<ShopProductDto[]> {
  const products = await tx.shopProduct.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { price: "asc" }] });
  let ownedCharacters = new Set<string>();
  if (userId) {
    const owned = await tx.userCharacter.findMany({ where: { userId }, include: { character: { select: { key: true } } } });
    ownedCharacters = new Set(owned.map((o) => o.character.key));
  }
  return products.map((p) => {
    const meta = parseProductMetadata(p.metadata);
    const charGrant = meta.grants.find((g) => g.kind === "CHARACTER");
    return productToDto(p, charGrant && charGrant.kind === "CHARACTER" ? ownedCharacters.has(charGrant.characterKey) : undefined);
  });
}

const SINK: Record<"GOLD" | "GEMS" | "CRYPTO", SystemAccountKey> = { GOLD: "GOLD_SINK", GEMS: "GEMS_SINK", CRYPTO: "CRYPTO_REVENUE" };

/** Payment legs. Crypto purchases draw from deposited (spendable) funds first, then earned rewards. */
async function paymentLegs(tx: Tx, userId: string, currency: "GOLD" | "GEMS" | "CRYPTO", total: bigint): Promise<LedgerLeg[]> {
  const sink: AccountRef = { system: SINK[currency] };
  if (currency !== "CRYPTO") return transfer({ userId, kind: currency }, sink, total);
  const balances = await getUserBalances(tx, userId);
  const fromSpendable = balances.cryptoSpendable >= total ? total : balances.cryptoSpendable;
  const fromReward = total - fromSpendable;
  const legs: LedgerLeg[] = [];
  if (fromSpendable > 0n) legs.push({ account: { userId, kind: "CRYPTO_SPENDABLE" }, direction: "DEBIT", amount: fromSpendable });
  if (fromReward > 0n) legs.push({ account: { userId, kind: "CRYPTO_REWARD" }, direction: "DEBIT", amount: fromReward });
  legs.push({ account: sink, direction: "CREDIT", amount: total });
  return legs;
}

export interface PurchaseInput {
  userId: string;
  sku: string;
  quantity: number;
  idempotencyKey: string;
}

export async function purchaseProduct(tx: Tx, config: AppConfig, logger: Logger, input: PurchaseInput) {
  const idem = `purchase:${input.userId}:${input.idempotencyKey}`;
  const prior = await tx.purchase.findUnique({ where: { idempotencyKey: idem } });
  if (prior) return { purchase: prior, duplicate: true };

  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) throw new AppError("BAD_REQUEST", "Invalid quantity");
  const product = await tx.shopProduct.findUnique({ where: { sku: input.sku } });
  if (!product || !product.active) throw new AppError("NOT_FOUND", "Product not available");
  const meta = parseProductMetadata(product.metadata);
  const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
  await requireFeature(tx, config, user, "PURCHASE");
  if (product.currency === "CRYPTO" && user.isGuest) throw new AppError("FORBIDDEN", "Connect a wallet to purchase with crypto");

  const hasUniqueGrant = meta.grants.some((g) => g.kind === "CHARACTER" || g.kind === "PREMIUM");
  if (hasUniqueGrant && input.quantity !== 1) throw new AppError("BAD_REQUEST", "This product can only be bought once at a time");
  for (const g of meta.grants) {
    if (g.kind === "CHARACTER") {
      const owned = await tx.userCharacter.findFirst({ where: { userId: input.userId, character: { key: g.characterKey } } });
      if (owned) throw new AppError("ALREADY_OWNED", "You already own this character");
    }
  }
  if (product.perUserLimit !== null) {
    const agg = await tx.purchase.aggregate({ where: { userId: input.userId, productId: product.id, status: "COMPLETED" }, _sum: { quantity: true } });
    if ((agg._sum.quantity ?? 0) + input.quantity > product.perUserLimit) throw new AppError("LIMIT_EXCEEDED", "Purchase limit reached for this product");
  }

  const total = product.price * BigInt(input.quantity);
  let journalId: string;
  if (total > 0n) {
    const posted = await postJournal(tx, {
      type: "PURCHASE",
      idempotencyKey: idem,
      reference: product.sku,
      metadata: { sku: product.sku, quantity: input.quantity },
      legs: await paymentLegs(tx, input.userId, product.currency, total),
    });
    journalId = posted.journalId;
  } else {
    journalId = "00000000-0000-0000-0000-000000000000";
  }

  const purchase = await tx.purchase.create({
    data: {
      userId: input.userId,
      productId: product.id,
      quantity: input.quantity,
      unitPrice: product.price,
      totalPrice: total,
      currency: product.currency,
      idempotencyKey: idem,
      journalId,
    },
  });

  for (let unit = 0; unit < input.quantity; unit++) {
    for (const [gi, g] of meta.grants.entries()) {
      const ref = `purchase:${purchase.id}:${unit}:${gi}`;
      switch (g.kind) {
        case "ITEM":
          await grantItem(tx, { userId: input.userId, itemKey: g.itemKey, quantity: g.quantity, source: "SHOP", sourceRef: ref, ignoreCapacity: true });
          break;
        case "CHARACTER":
          await grantCharacter(tx, input.userId, g.characterKey);
          break;
        case "GEMS":
        case "GOLD":
          await postJournal(tx, {
            type: "PURCHASE",
            idempotencyKey: ref,
            reference: purchase.id,
            legs: transfer({ system: g.kind === "GEMS" ? "GEMS_ISSUANCE" : "GOLD_ISSUANCE" }, { userId: input.userId, kind: g.kind }, BigInt(g.amount)),
          });
          break;
        case "PREMIUM": {
          const fresh = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
          const now = new Date();
          const base = fresh.premiumUntil && fresh.premiumUntil > now ? fresh.premiumUntil : now;
          const tier = fresh.premiumTier === "ELITE" && fresh.premiumUntil && fresh.premiumUntil > now ? "ELITE" : g.tier;
          await tx.user.update({
            where: { id: input.userId },
            data: { premiumTier: tier, premiumUntil: new Date(base.getTime() + g.days * 86_400_000) },
          });
          break;
        }
        case "INVENTORY_SLOTS":
          await tx.user.update({ where: { id: input.userId }, data: { inventorySlots: { increment: g.amount } } });
          break;
        case "STASH_SLOTS":
          await tx.user.update({ where: { id: input.userId }, data: { stashSlots: { increment: g.amount } } });
          break;
      }
    }
  }

  logger.info(
    { event: LogEvent.PURCHASE_CREATED, userId: input.userId, sku: product.sku, quantity: input.quantity, total: total.toString(), currency: product.currency },
    "purchase created",
  );
  return { purchase, duplicate: false };
}

/** Admin refund: reverses payment legs with a compensating journal and revokes what was granted. */
export async function refundPurchase(tx: Tx, logger: Logger, purchaseId: string, adminUserId: string, reason: string, ip: string | null) {
  const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { product: true } });
  if (!purchase) throw new AppError("NOT_FOUND", "Purchase not found");
  if (purchase.status === "REFUNDED") throw new AppError("CONFLICT", "Purchase already refunded");
  const meta = parseProductMetadata(purchase.product.metadata);

  // Revoke grants first so a refund cannot leave the user with both the goods and the money.
  for (let unit = 0; unit < purchase.quantity; unit++) {
    for (const [gi, g] of meta.grants.entries()) {
      const ref = `purchase:${purchase.id}:${unit}:${gi}`;
      if (g.kind === "ITEM") {
        const revoked = await tx.inventoryItem.deleteMany({ where: { sourceRef: ref, userId: purchase.userId } });
        // A sold (or used up) item cannot be revoked; refunding anyway would pay twice.
        if (revoked.count === 0) throw new AppError("CONFLICT", "A purchased item was already sold or used; use a balance adjustment instead");
      } else if (g.kind === "GEMS" || g.kind === "GOLD") {
        await postJournal(tx, {
          type: "REFUND",
          idempotencyKey: `refund:${ref}`,
          reference: purchase.id,
          adminUserId,
          legs: transfer({ userId: purchase.userId, kind: g.kind }, { system: g.kind === "GEMS" ? "GEMS_ISSUANCE" : "GOLD_ISSUANCE" }, BigInt(g.amount)),
        });
      } else if (g.kind === "CHARACTER") {
        const uc = await tx.userCharacter.findFirst({ where: { userId: purchase.userId, character: { key: g.characterKey } } });
        if (uc) {
          // Match history references the character; deleting it would break that history.
          const played = await tx.gameMatchPlayer.count({ where: { userCharacterId: uc.id } });
          if (played > 0) throw new AppError("CONFLICT", "This character was already used in matches and cannot be refunded; use a balance adjustment instead");
          await tx.userCharacter.delete({ where: { id: uc.id } });
        }
      } else if (g.kind === "INVENTORY_SLOTS") {
        await tx.user.update({ where: { id: purchase.userId }, data: { inventorySlots: { decrement: g.amount } } });
      } else if (g.kind === "STASH_SLOTS") {
        const u = await tx.user.findUniqueOrThrow({ where: { id: purchase.userId }, select: { stashSlots: true } });
        await tx.user.update({ where: { id: purchase.userId }, data: { stashSlots: Math.max(0, u.stashSlots - g.amount) } });
      } else if (g.kind === "PREMIUM") {
        const u = await tx.user.findUniqueOrThrow({ where: { id: purchase.userId } });
        if (u.premiumUntil) {
          const until = new Date(u.premiumUntil.getTime() - g.days * 86_400_000);
          await tx.user.update({
            where: { id: purchase.userId },
            data: until > new Date() ? { premiumUntil: until } : { premiumTier: "FREE", premiumUntil: null },
          });
        }
      }
    }
  }

  let refundJournalId: string | null = null;
  if (purchase.totalPrice > 0n) {
    const original = await tx.balanceLedger.findMany({ where: { journalId: purchase.journalId }, include: { account: true } });
    const legs: LedgerLeg[] = original.map((row) => {
      const account: AccountRef = row.account.systemKey
        ? { system: row.account.systemKey as SystemAccountKey }
        : { userId: row.account.userId!, kind: row.account.kind as "GOLD" | "GEMS" | "CRYPTO_SPENDABLE" | "CRYPTO_REWARD" };
      return { account, direction: row.direction === "DEBIT" ? "CREDIT" : "DEBIT", amount: row.amount };
    });
    const posted = await postJournal(tx, { type: "REFUND", idempotencyKey: `refund:purchase:${purchase.id}`, reference: purchase.id, adminUserId, description: reason, legs });
    refundJournalId = posted.journalId;
  }

  const updated = await tx.purchase.update({ where: { id: purchase.id }, data: { status: "REFUNDED", refundedAt: new Date(), refundJournalId } });
  await writeAudit(tx, {
    actorType: "ADMIN",
    adminUserId,
    userId: purchase.userId,
    action: "PURCHASE_REFUND",
    targetType: "Purchase",
    targetId: purchase.id,
    before: { status: purchase.status },
    after: { status: "REFUNDED", refundJournalId },
    reason,
    ip,
  });
  logger.info({ event: LogEvent.PURCHASE_REFUNDED, purchaseId, adminUserId }, "purchase refunded");
  return updated;
}
