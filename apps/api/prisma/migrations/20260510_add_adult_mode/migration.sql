-- AlterTable: add 18+ fields to Entry
ALTER TABLE "Entry" ADD COLUMN IF NOT EXISTS "isAdult" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Entry" ADD COLUMN IF NOT EXISTS "adultQuestion" TEXT;
ALTER TABLE "Entry" ADD COLUMN IF NOT EXISTS "adultAnswerHash" TEXT;
