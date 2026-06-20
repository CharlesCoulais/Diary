-- Ajout du type TASK_UPDATED à l'enum NotifType
ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'TASK_UPDATED';

-- Lien Notification → Task + payload de changement
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "taskId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "meta" JSONB;

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "Notification_taskId_idx" ON "Notification"("taskId");
