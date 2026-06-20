-- Verrou de lecture : décision côté owner + notification du confident.
--
-- 1) Nouveau type de notif : READ_GATE_DECIDED (le confident est notifié quand
--    l'owner accepte ou refuse sa réponse au verrou).
-- 2) Deux préférences push :
--    - notifyOwnerReadGate : owner reçoit les réponses au verrou (default true)
--    - notifyOnReadGateDecision : confident reçoit la décision (default true)

ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'READ_GATE_DECIDED';

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "notifyOwnerReadGate"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyOnReadGateDecision" BOOLEAN NOT NULL DEFAULT true;
