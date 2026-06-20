-- Médias dans les commentaires : image jointe + GIF Giphy.

ALTER TABLE "Comment" ADD COLUMN "gifUrl" TEXT;

ALTER TABLE "Image" ADD COLUMN "commentId" TEXT;

CREATE UNIQUE INDEX "Image_commentId_key" ON "Image"("commentId");

ALTER TABLE "Image" ADD CONSTRAINT "Image_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
