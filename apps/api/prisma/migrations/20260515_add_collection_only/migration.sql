-- Item de Collection : une Entry avec collectionOnly = true est masquée de la
-- Timeline, du Journal et du Fil du confident tant que rien n'y est rédigé.
ALTER TABLE "Entry" ADD COLUMN "collectionOnly" BOOLEAN NOT NULL DEFAULT false;
