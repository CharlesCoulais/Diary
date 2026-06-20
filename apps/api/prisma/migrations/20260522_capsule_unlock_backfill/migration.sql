-- Backfill : marque comme "déjà notifié" les capsules dont la date d'ouverture
-- est déjà passée AVANT l'introduction du cron — sinon le premier run enverrait
-- une notif pour toutes les anciennes capsules ouvertes (effet de surprise).
UPDATE "Entry"
SET "capsuleNotifSentAt" = NOW()
WHERE "unlockAt" IS NOT NULL
  AND "unlockAt" <= NOW()
  AND "capsuleNotifSentAt" IS NULL;
