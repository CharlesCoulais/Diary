-- Boîte à demandes : sujets que le confident souhaiterait que l'owner traite
CREATE TYPE "TopicRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'REJECTED');

CREATE TABLE "TopicRequest" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "TopicRequestStatus" NOT NULL DEFAULT 'PENDING',
    "authorId" TEXT NOT NULL,
    "treatedById" TEXT,
    "ownerNote" TEXT,
    "linkedEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "treatedAt" TIMESTAMP(3),

    CONSTRAINT "TopicRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TopicRequest_authorId_status_idx" ON "TopicRequest"("authorId", "status");
CREATE INDEX "TopicRequest_status_createdAt_idx" ON "TopicRequest"("status", "createdAt");

ALTER TABLE "TopicRequest" ADD CONSTRAINT "TopicRequest_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicRequest" ADD CONSTRAINT "TopicRequest_treatedById_fkey"
  FOREIGN KEY ("treatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TopicRequest" ADD CONSTRAINT "TopicRequest_linkedEntryId_fkey"
  FOREIGN KEY ("linkedEntryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
