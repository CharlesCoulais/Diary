-- Notation favoris / nul par utilisateur sur une entry.
-- Mutuellement exclusif : 1 ligne max par (entryId, userId) via @@unique.

CREATE TYPE "EntryRatingValue" AS ENUM ('FAVORITE', 'LOW');

CREATE TABLE "EntryRating" (
    "id"        TEXT NOT NULL,
    "entryId"   TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "value"     "EntryRatingValue" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EntryRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntryRating_entryId_userId_key" ON "EntryRating"("entryId", "userId");
CREATE INDEX "EntryRating_entryId_idx" ON "EntryRating"("entryId");
CREATE INDEX "EntryRating_userId_idx" ON "EntryRating"("userId");

ALTER TABLE "EntryRating"
  ADD CONSTRAINT "EntryRating_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EntryRating"
  ADD CONSTRAINT "EntryRating_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
