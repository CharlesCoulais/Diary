-- AlterTable
ALTER TABLE "Task" ADD COLUMN "category" TEXT,
                   ADD COLUMN "createdBy" TEXT,
                   ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
