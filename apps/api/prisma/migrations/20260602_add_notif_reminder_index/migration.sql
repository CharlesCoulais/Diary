-- Add composite index for cron: find users by notifEnabled + notifReminderTime
-- Runs every minute — without this index, full User table scan on every tick.
CREATE INDEX IF NOT EXISTS "User_notifEnabled_notifReminderTime_idx"
ON "User"("notifEnabled", "notifReminderTime");
