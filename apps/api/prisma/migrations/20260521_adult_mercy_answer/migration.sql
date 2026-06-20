-- Note 18+ : champ "réponse de clémence" optionnel.
-- Quand il est défini, le confident voit son accès accordé automatiquement après
-- 100 essais ratés uniques (anti-bruteforce raisonnable, anti-frustration), et
-- la réponse est révélée pour qu'il connaisse la bonne formulation.
-- NULL (défaut) = feature désactivée — comportement actuel.
ALTER TABLE "Entry"
  ADD COLUMN IF NOT EXISTS "adultMercyAnswer" TEXT;
