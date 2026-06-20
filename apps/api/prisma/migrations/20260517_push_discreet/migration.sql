-- Notifications push discrètes : titre / texte / icône personnalisés.

ALTER TABLE "User" ADD COLUMN "pushDiscreet" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "pushDiscreetTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "pushDiscreetBody" TEXT;
ALTER TABLE "User" ADD COLUMN "pushDiscreetIcon" TEXT;
