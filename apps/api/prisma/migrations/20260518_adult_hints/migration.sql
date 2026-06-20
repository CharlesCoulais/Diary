-- AddColumn adultHints on Entry
ALTER TABLE "Entry" ADD COLUMN "adultHints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
