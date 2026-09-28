-- Scans existing rows under SHARE UPDATE EXCLUSIVE, which does not block normal reads and writes.
ALTER TABLE "User" VALIDATE CONSTRAINT "User_inventorySlots_non_negative";
