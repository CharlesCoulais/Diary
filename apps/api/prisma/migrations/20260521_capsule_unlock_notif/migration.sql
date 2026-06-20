-- Notification d'ouverture de capsule temporelle.
--
-- 1) Nouveau type de notif : CAPSULE_UNLOCKED (owner + confidents notifiés
--    quand `unlockAt` est franchie).
-- 2) Préférence push `notifyOnCapsuleUnlock` (default true) — partagée owner/guest.
-- 3) Marqueur `capsuleNotifSentAt` sur Entry : empêche le cron de notifier
--    plusieurs fois la même capsule (analogue à `hiddenNotifSentAt`).

ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'CAPSULE_UNLOCKED';

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "notifyOnCapsuleUnlock" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Entry"
  ADD COLUMN IF NOT EXISTS "capsuleNotifSentAt" TIMESTAMP(3);
