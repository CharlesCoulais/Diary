CREATE TABLE IF NOT EXISTS "Image" (
  "id"        TEXT         NOT NULL,
  "data"      TEXT         NOT NULL,
  "mimeType"  TEXT         NOT NULL,
  "size"      INTEGER      NOT NULL,
  "authorId"  TEXT         NOT NULL,
  "entryId"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Image_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Image_authorId_fkey" FOREIGN KEY ("authorId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Image_authorId_idx" ON "Image"("authorId");
