-- AlterTable: add read gate fields to Entry
ALTER TABLE "Entry"
ADD COLUMN     "readGateAutoApprove" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "readGatePrompt" TEXT;

-- CreateTable
CREATE TABLE "ReadGateResponse" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "approved" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadGateResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadGateResponse_entryId_idx" ON "ReadGateResponse"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadGateResponse_entryId_guestId_key" ON "ReadGateResponse"("entryId", "guestId");

-- CreateIndex
CREATE INDEX "ReadGateResponse_guestId_idx" ON "ReadGateResponse"("guestId");

-- AddForeignKey
ALTER TABLE "ReadGateResponse" ADD CONSTRAINT "ReadGateResponse_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadGateResponse" ADD CONSTRAINT "ReadGateResponse_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
