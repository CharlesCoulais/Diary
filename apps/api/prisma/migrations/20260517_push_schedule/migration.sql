-- Horaires automatiques pour les notifications discrètes.

ALTER TABLE "User" ADD COLUMN "pushDiscreetScheduled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "pushDiscreetSchedule" JSONB;
ALTER TABLE "User" ADD COLUMN "timezone" TEXT;
