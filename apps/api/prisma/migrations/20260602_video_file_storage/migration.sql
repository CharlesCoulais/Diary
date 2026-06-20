-- Migration: video file storage
-- Ajoute le stockage sur disque pour les vidéos (notes de journal)
-- et étend le modèle Video pour qu'il puisse être attaché à une Entry.

-- Rendre data nullable (DM legacy restent en base64, nouvelles vidéos sur notes = NULL)
ALTER TABLE "Video" ALTER COLUMN "data" DROP NOT NULL;

-- Nouveau chemin fichier sur disque
ALTER TABLE "Video" ADD COLUMN "filePath" TEXT;

-- Relation avec Entry
ALTER TABLE "Video" ADD COLUMN "entryId" TEXT;
ALTER TABLE "Video" ADD CONSTRAINT "Video_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Video_entryId_idx" ON "Video"("entryId");
