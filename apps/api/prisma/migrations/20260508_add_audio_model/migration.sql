CREATE TABLE "Audio" (
  "id"        TEXT NOT NULL,
  "data"      TEXT NOT NULL,
  "mimeType"  TEXT NOT NULL,
  "filename"  TEXT NOT NULL,
  "size"      INTEGER NOT NULL,
  "authorId"  TEXT NOT NULL,
  "entryId"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Audio_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Audio"
  ADD CONSTRAINT "Audio_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Audio_authorId_idx" ON "Audio"("authorId");
