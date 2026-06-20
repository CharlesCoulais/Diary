-- Ajoute la colonne `avatarImageId` à `User` (photo de profil).
-- Migration manquante : le champ a été ajouté à schema.prisma sans passer par
-- `prisma migrate dev`, donc la prod ne l'a jamais reçue → l'API plante avec
-- "column User.avatarImageId does not exist" sur chaque requête de session.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "avatarImageId" TEXT;
