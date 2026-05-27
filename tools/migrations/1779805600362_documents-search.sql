-- Up Migration

-- Full-text search vector over filename + category + tags (plan §9).
-- A STORED generated column can't be used here: to_tsvector with a named config
-- ('simple') isn't treated as immutable by Postgres. We maintain the column via
-- a trigger instead (fires when the searchable fields change, e.g. the classify
-- worker setting category/tags). 'simple' config (no stemming) suits short
-- metadata like filenames.
ALTER TABLE documents ADD COLUMN search_tsv tsvector;

CREATE FUNCTION documents_search_tsv() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector(
    'simple',
    NEW.filename || ' ' || coalesce(NEW.category, '') || ' ' || array_to_string(NEW.tags, ' ')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_search_tsv_trg
  BEFORE INSERT OR UPDATE OF filename, category, tags ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_search_tsv();

-- Backfill any existing rows.
UPDATE documents SET search_tsv = to_tsvector(
  'simple',
  filename || ' ' || coalesce(category, '') || ' ' || array_to_string(tags, ' ')
);

CREATE INDEX idx_documents_search ON documents USING GIN (search_tsv);


-- Down Migration

DROP INDEX IF EXISTS idx_documents_search;
DROP TRIGGER IF EXISTS documents_search_tsv_trg ON documents;
DROP FUNCTION IF EXISTS documents_search_tsv();
ALTER TABLE documents DROP COLUMN IF EXISTS search_tsv;
