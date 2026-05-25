-- Up Migration

-- Documents -----------------------------------------------------------------
-- Phase 3 covers upload + S3 storage only. AI-derived columns (summary,
-- category, tags, language, page_count, text_s3_key), folders and versions
-- arrive with their respective phases (4 / 7) via later migrations — kept out
-- here so this migration maps cleanly to the feature it ships.
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  filename      TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL CHECK (size_bytes >= 0),
  s3_key        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending_upload'
                CHECK (status IN (
                  'pending_upload', 'uploaded', 'extracting', 'extracted',
                  'analyzing', 'ready', 'failed'
                )),
  error         TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every read path is org-scoped (OrgScopedRepository), so the org_id-leading
-- indexes match the access patterns: list newest-first, filter by status.
CREATE INDEX idx_documents_org_created ON documents(org_id, created_at DESC);
CREATE INDEX idx_documents_org_status ON documents(org_id, status);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Down Migration

DROP TABLE IF EXISTS documents;
