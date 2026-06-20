-- Préférence push pour la messagerie directe.

ALTER TABLE "User" ADD COLUMN "notifyMessages" BOOLEAN NOT NULL DEFAULT true;
