-- Owner only : pause temporaire de toutes les notifications push envoyées
-- aux confidents (commentaires, réactions, capsules, verrou, nouvelle
-- publication, etc.). L'événement SSE in-app continue de fonctionner — seul
-- le push OS est suspendu.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pauseGuestPush" BOOLEAN NOT NULL DEFAULT false;
