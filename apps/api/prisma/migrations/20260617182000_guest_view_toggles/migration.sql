-- Résout un drift : ces colonnes (toggles d'accès confident aux pages
-- Calendrier / Agenda / Budget) ont été ajoutées à schema.prisma par une autre
-- session sans migration ; la base de dev les a déjà (via `prisma db push`).
-- `IF NOT EXISTS` rend cette migration idempotente : no-op là où les colonnes
-- existent (dev), ajout là où elles manquent (prod / nouvelle base / shadow DB).

-- AlterTable: User — préférences owner d'accès confident par fonctionnalité
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guestCanViewCalendar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guestCanViewAgenda" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guestCanViewBudget" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Invitation — mêmes droits portés par l'invitation
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "canViewCalendar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "canViewAgenda" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "canViewBudget" BOOLEAN NOT NULL DEFAULT false;
