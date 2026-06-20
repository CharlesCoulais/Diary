-- Replace mood/energy/stress integer fields with a single emoji string field
ALTER TABLE "Entry" DROP COLUMN IF EXISTS "energy";
ALTER TABLE "Entry" DROP COLUMN IF EXISTS "stress";
ALTER TABLE "Entry" ALTER COLUMN "mood" TYPE VARCHAR(200) USING NULL;
