-- Mode silencieux : plages horaires sans aucune notification push.

ALTER TABLE "User" ADD COLUMN "pushSilent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "pushSilentSchedule" JSONB;
