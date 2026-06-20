-- AlterTable: add replyToId to Comment for tracking specific reply targets
ALTER TABLE "Comment" ADD COLUMN "replyToId" TEXT;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Comment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
