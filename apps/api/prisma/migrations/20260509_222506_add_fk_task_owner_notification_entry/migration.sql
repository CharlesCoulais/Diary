-- AddForeignKey: Task.ownerId → User
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Notification.entryId → Entry
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
