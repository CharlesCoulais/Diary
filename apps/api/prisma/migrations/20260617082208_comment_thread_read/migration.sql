-- CreateTable
CREATE TABLE "CommentThreadRead" (
    "userId" TEXT NOT NULL,
    "threadRootId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentThreadRead_pkey" PRIMARY KEY ("userId","threadRootId")
);

-- CreateIndex
CREATE INDEX "CommentThreadRead_userId_idx" ON "CommentThreadRead"("userId");

-- AddForeignKey
ALTER TABLE "CommentThreadRead" ADD CONSTRAINT "CommentThreadRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentThreadRead" ADD CONSTRAINT "CommentThreadRead_threadRootId_fkey" FOREIGN KEY ("threadRootId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

