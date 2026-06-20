-- CreateTable
CREATE TABLE "AiRecap" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRecap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRecap_ownerId_idx" ON "AiRecap"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRecap_ownerId_period_key" ON "AiRecap"("ownerId", "period");

-- AddForeignKey
ALTER TABLE "AiRecap" ADD CONSTRAINT "AiRecap_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
