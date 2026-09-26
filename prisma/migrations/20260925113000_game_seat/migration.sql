-- CreateTable
CREATE TABLE "GameSeat" (
    "userId" UUID NOT NULL,
    "roomId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSeat_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "GameSeat_roomId_idx" ON "GameSeat"("roomId");

-- AddForeignKey
ALTER TABLE "GameSeat" ADD CONSTRAINT "GameSeat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
