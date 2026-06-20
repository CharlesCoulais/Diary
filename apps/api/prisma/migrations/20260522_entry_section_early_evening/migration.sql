-- Ajoute la valeur `EARLY_EVENING` à l'enum EntrySection (entre
-- LATE_AFTERNOON et EVENING). Label UX : « Début de soirée ».
ALTER TYPE "EntrySection" ADD VALUE IF NOT EXISTS 'EARLY_EVENING' AFTER 'LATE_AFTERNOON';
