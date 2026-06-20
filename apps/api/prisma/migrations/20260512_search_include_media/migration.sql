-- Étend le trigger searchVector pour inclure les champs mediaMeta
-- (subject, creator, trackTitle, seriesName, playlistName, description + tracks[].subject/creator/trackTitle)

CREATE OR REPLACE FUNCTION entry_search_vector_update()
RETURNS trigger AS $$
DECLARE
  media_text text := '';
  tracks_text text := '';
BEGIN
  IF NEW."mediaMeta" IS NOT NULL THEN
    media_text :=
      coalesce(NEW."mediaMeta"->>'subject', '')      || ' ' ||
      coalesce(NEW."mediaMeta"->>'creator', '')      || ' ' ||
      coalesce(NEW."mediaMeta"->>'trackTitle', '')   || ' ' ||
      coalesce(NEW."mediaMeta"->>'seriesName', '')   || ' ' ||
      coalesce(NEW."mediaMeta"->>'playlistName', '') || ' ' ||
      coalesce(NEW."mediaMeta"->>'description', '');

    -- tracks[] (playlists)
    SELECT coalesce(string_agg(
      coalesce(t->>'subject', '')    || ' ' ||
      coalesce(t->>'creator', '')    || ' ' ||
      coalesce(t->>'trackTitle', '') || ' ' ||
      coalesce(t->>'description', '')
    , ' '), '')
    INTO tracks_text
    FROM jsonb_array_elements(coalesce(NEW."mediaMeta"->'tracks', '[]'::jsonb)) AS t;
  END IF;

  NEW."searchVector" :=
    setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW."contentMd", '')), 'B') ||
    setweight(to_tsvector('french', media_text), 'B') ||
    setweight(to_tsvector('french', tracks_text), 'B') ||
    setweight(to_tsvector('french', coalesce(NEW.mood, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Le trigger lui-même n'a pas changé, mais on le re-crée pour être safe au cas où
DROP TRIGGER IF EXISTS entry_search_vector_trigger ON "Entry";
CREATE TRIGGER entry_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "Entry"
  FOR EACH ROW EXECUTE FUNCTION entry_search_vector_update();

-- Backfill : force le recalcul du searchVector pour toutes les entrées existantes
-- (no-op update qui déclenche le BEFORE UPDATE trigger)
UPDATE "Entry" SET "title" = "title";
