-- Capsule temporelle : date de déverrouillage optionnelle sur les entrées
ALTER TABLE "Entry" ADD COLUMN IF NOT EXISTS "unlockAt" TIMESTAMP(3);
