-- CreateTable
CREATE TABLE "DailyLog" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mood" TEXT,
    "sleepHours" DOUBLE PRECISION,
    "weather" TEXT,
    "energy" INTEGER,
    "anxiety" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_ownerId_date_key" ON "DailyLog"("ownerId", "date");

-- CreateIndex
CREATE INDEX "DailyLog_ownerId_date_idx" ON "DailyLog"("ownerId", "date");

-- CreateIndex
CREATE INDEX "DailyLog_ownerId_updatedAt_idx" ON "DailyLog"("ownerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
