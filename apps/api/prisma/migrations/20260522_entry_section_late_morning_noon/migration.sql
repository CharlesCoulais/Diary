-- Ajoute deux nouveaux créneaux temporels à l'enum EntrySection :
--   LATE_MORNING (« Fin de matinée », 10h-12h) entre MORNING et NOON
--   NOON (« Midi », 12h-14h) entre LATE_MORNING et AFTERNOON
ALTER TYPE "EntrySection" ADD VALUE IF NOT EXISTS 'LATE_MORNING' AFTER 'MORNING';
ALTER TYPE "EntrySection" ADD VALUE IF NOT EXISTS 'NOON' AFTER 'LATE_MORNING';
