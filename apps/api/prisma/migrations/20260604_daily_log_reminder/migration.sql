-- Rappel du suivi quotidien (DailyLog) : heure de rappel, distincte du rappel d'écriture.
ALTER TABLE "User" ADD COLUMN "dailyLogReminderAt" TEXT;

-- Index pour le cron qui filtre les owners par heure de rappel.
CREATE INDEX "User_dailyLogReminderAt_idx" ON "User"("dailyLogReminderAt");
