-- Versioning des commentaires pour permettre la détection de conflits
-- (owner + confident éditant simultanément).
-- Les lignes existantes démarrent à 1 ; chaque édition future incrémente.

ALTER TABLE "Comment" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
