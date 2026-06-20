-- Baromètre du couple : une couleur par jour (rouge / neutre / vert).

CREATE TYPE "CoupleColor" AS ENUM ('RED', 'BLUE', 'GREEN');

CREATE TABLE "CoupleDay" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "color" "CoupleColor" NOT NULL DEFAULT 'BLUE',
    "setAt" TIMESTAMP(3),
    "linkedEntryIds" JSONB,
    "awayLabel" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CoupleDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoupleDay_ownerId_date_key" ON "CoupleDay"("ownerId", "date");
CREATE INDEX "CoupleDay_ownerId_date_idx" ON "CoupleDay"("ownerId", "date");
CREATE INDEX "CoupleDay_ownerId_updatedAt_idx" ON "CoupleDay"("ownerId", "updatedAt");

ALTER TABLE "CoupleDay" ADD CONSTRAINT "CoupleDay_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
