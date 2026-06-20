-- Migration : Full-text search sur Entry
-- Ajoute une colonne tsvector maintenue par trigger + index GIN

-- 1. Colonne searchVector (nullable, maintenue par trigger)
ALTER TABLE "Entry" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

-- 2. Fonction trigger : met à jour searchVector à chaque INSERT/UPDATE
CREATE OR REPLACE FUNCTION entry_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW."contentMd", '')), 'B') ||
    setweight(to_tsvector('french', coalesce(NEW.mood, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS entry_search_vector_trigger ON "Entry";
CREATE TRIGGER entry_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "Entry"
  FOR EACH ROW EXECUTE FUNCTION entry_search_vector_update();

-- 4. Backfill des lignes existantes
UPDATE "Entry"
SET "searchVector" =
  setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('french', coalesce("contentMd", '')), 'B') ||
  setweight(to_tsvector('french', coalesce(mood, '')), 'C');

-- 5. Index GIN pour la recherche rapide
CREATE INDEX IF NOT EXISTS "Entry_searchVector_idx"
  ON "Entry" USING GIN("searchVector");
