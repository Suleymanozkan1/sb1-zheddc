-- Selling items, item locks and the stash.
ALTER TYPE "TransactionType" ADD VALUE 'ITEM_SALE';

ALTER TABLE "InventoryItem" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InventoryItem" ADD COLUMN "inStash" BOOLEAN NOT NULL DEFAULT false;
-- Stashed items can never be equipped.
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_stash_not_equipped" CHECK (NOT ("inStash" AND "equipped"));

ALTER TABLE "User" ADD COLUMN "stashSlots" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "User" ADD CONSTRAINT "User_stashSlots_non_negative" CHECK ("stashSlots" >= 0);

CREATE INDEX "InventoryItem_userId_inStash_idx" ON "InventoryItem"("userId", "inStash");
