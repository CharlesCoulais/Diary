-- AlterEnum
ALTER TYPE "NotifType" ADD VALUE 'ENTRY_NEW';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "notifyOnNewEntry" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "notifyEntryTypes" "NoteType"[] DEFAULT ARRAY[]::"NoteType"[];
