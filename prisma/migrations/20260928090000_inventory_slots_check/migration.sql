-- Refunds clamp slot counts at zero; the constraint makes a negative capacity impossible.
UPDATE "User" SET "inventorySlots" = 0 WHERE "inventorySlots" < 0;
-- NOT VALID skips the full-table scan here (new writes are checked at once); the next migration validates.
ALTER TABLE "User" ADD CONSTRAINT "User_inventorySlots_non_negative" CHECK ("inventorySlots" >= 0) NOT VALID;
