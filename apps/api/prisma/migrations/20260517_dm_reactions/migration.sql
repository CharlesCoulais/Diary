-- Réactions emoji sur les messages de la messagerie directe.

ALTER TABLE "Reaction" ADD COLUMN "directMessageId" TEXT;

CREATE UNIQUE INDEX "Reaction_userId_directMessageId_emoji_key" ON "Reaction"("userId", "directMessageId", "emoji");
CREATE INDEX "Reaction_directMessageId_idx" ON "Reaction"("directMessageId");

ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
