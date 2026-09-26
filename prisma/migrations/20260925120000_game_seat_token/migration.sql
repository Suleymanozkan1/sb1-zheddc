-- AlterTable
ALTER TABLE "GameSeat" ADD COLUMN     "token" UUID NOT NULL DEFAULT gen_random_uuid();
