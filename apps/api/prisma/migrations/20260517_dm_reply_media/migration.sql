-- Messagerie directe : réponses à un message + médias (image / vidéo / GIF).

-- Réponse à un message + GIF
ALTER TABLE "DirectMessage" ADD COLUMN "gifUrl" TEXT;
ALTER TABLE "DirectMessage" ADD COLUMN "replyToId" TEXT;

CREATE INDEX "DirectMessage_replyToId_idx" ON "DirectMessage"("replyToId");

ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Image attachée à un message
ALTER TABLE "Image" ADD COLUMN "directMessageId" TEXT;

CREATE UNIQUE INDEX "Image_directMessageId_key" ON "Image"("directMessageId");

ALTER TABLE "Image" ADD CONSTRAINT "Image_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vidéo courte attachée à un message
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "directMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Video_directMessageId_key" ON "Video"("directMessageId");
CREATE INDEX "Video_authorId_idx" ON "Video"("authorId");

ALTER TABLE "Video" ADD CONSTRAINT "Video_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
