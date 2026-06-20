-- Concurrence optimiste pour l'édition des messages directs.
ALTER TABLE "DirectMessage" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
