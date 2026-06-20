-- Force-change flag posé quand l'owner régénère un mdp temporaire pour
-- un confident.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
