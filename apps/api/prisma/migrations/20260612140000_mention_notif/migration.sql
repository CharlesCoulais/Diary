-- Ajoute le type de notification « mention » (@user dans une note ou un commentaire).
-- ADD VALUE hors transaction implicite : on ne réutilise pas la valeur dans la même
-- migration, donc Postgres l'accepte sans erreur.
ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'MENTION_NEW';
