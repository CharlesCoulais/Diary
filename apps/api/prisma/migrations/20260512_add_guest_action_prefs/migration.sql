-- AlterTable
ALTER TABLE "User" ADD COLUMN "notifyOnTaskUpdate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyOnRequestTreated" BOOLEAN NOT NULL DEFAULT true;
