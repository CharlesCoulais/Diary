-- CreateTable
CREATE TABLE "SouvenirTag" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "mediaSrc" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "tag" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SouvenirTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SouvenirTag_authorId_idx" ON "SouvenirTag"("authorId");

-- CreateIndex
CREATE INDEX "SouvenirTag_authorId_tag_idx" ON "SouvenirTag"("authorId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "SouvenirTag_authorId_mediaSrc_tag_key" ON "SouvenirTag"("authorId", "mediaSrc", "tag");

-- AddForeignKey
ALTER TABLE "SouvenirTag" ADD CONSTRAINT "SouvenirTag_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
