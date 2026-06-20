-- Backfill : marque comme "déjà notifié" les capsules dont la date d'ouverture
-- est déjà passée AVANT l'introduction du cron — sinon le premier run enverrait
-- une notif pour toutes les anciennes capsules ouvertes.
-- Wrapped in DO block : la colonne peut ne pas encore exister selon l'ordre d'application.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Entry' AND column_name = 'capsuleNotifSentAt'
  ) THEN
    UPDATE "Entry"
    SET "capsuleNotifSentAt" = NOW()
    WHERE "unlockAt" IS NOT NULL
      AND "unlockAt" <= NOW()
      AND "capsuleNotifSentAt" IS NULL;
  END IF;
END $$;
