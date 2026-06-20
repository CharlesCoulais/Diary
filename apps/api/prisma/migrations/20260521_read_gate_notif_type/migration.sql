-- Ajoute le type READ_GATE_RESPONSE à l'enum NotifType.
-- Notifie l'owner quand un confident répond à un verrou de lecture.
ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'READ_GATE_RESPONSE';
