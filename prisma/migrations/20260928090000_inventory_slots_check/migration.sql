-- Refunds clamp slot counts at zero; the constraint makes a negative capacity impossible.
UPDATE "User" SET "inventorySlots" = 0 WHERE "inventorySlots" < 0;
ALTER TABLE "User" ADD CONSTRAINT "User_inventorySlots_non_negative" CHECK ("inventorySlots" >= 0);
