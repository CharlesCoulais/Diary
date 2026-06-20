-- Soft-delete pour les guests révoqués.
-- Préserve leurs comments / reactions / ratings / readGate responses
-- (historique de l'owner) plutôt que de cascade-delete via user.delete.

ALTER TABLE "User" ADD COLUMN "revokedAt" TIMESTAMP(3);
CREATE INDEX "User_revokedAt_idx" ON "User"("revokedAt");
