CREATE TABLE "EntryReadStatus" (
  "userId"  TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "readAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntryReadStatus_pkey" PRIMARY KEY ("userId", "entryId")
);

ALTER TABLE "EntryReadStatus"
  ADD CONSTRAINT "EntryReadStatus_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EntryReadStatus"
  ADD CONSTRAINT "EntryReadStatus_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "EntryReadStatus_userId_idx" ON "EntryReadStatus"("userId");
