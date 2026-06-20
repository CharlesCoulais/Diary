-- AlterEnum
ALTER TYPE "NoteType" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "customTypeId" TEXT;

-- CreateTable
CREATE TABLE "NoteTypeDef" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelPlural" TEXT NOT NULL,
    "volumeLabel" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "behavior" "NoteType" NOT NULL DEFAULT 'JOURNAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteTypeDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteTypeDef_ownerId_idx" ON "NoteTypeDef"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteTypeDef_ownerId_key_key" ON "NoteTypeDef"("ownerId", "key");

-- AddForeignKey
ALTER TABLE "NoteTypeDef" ADD CONSTRAINT "NoteTypeDef_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_customTypeId_fkey" FOREIGN KEY ("customTypeId") REFERENCES "NoteTypeDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

