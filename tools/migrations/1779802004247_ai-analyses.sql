-- Up Migration

-- Document columns the AI pipeline fills in (Phase 4) and Phase 5 search uses.
-- Added nullable so existing rows stay valid; populated by the workers.
ALTER TABLE documents
  ADD COLUMN text_s3_key TEXT,                    -- extracted plain text in S3
  ADD COLUMN page_count  INT,
  ADD COLUMN language    TEXT,                    -- ISO 639-1, from extraction/classify
  ADD COLUMN category    TEXT,                    -- classify result
  ADD COLUMN tags        TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_documents_tags ON documents USING GIN (tags);

-- AI analyses (plan §5.1). One row per (document, kind); a re-run inserts a new
-- row with a bumped prompt_version, so we keep history rather than overwrite.
CREATE TABLE ai_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('summary', 'classification', 'entities', 'keywords')),
  model           TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  input_tokens    INT,
  output_tokens   INT,
  cost_usd        NUMERIC(10, 6),
  result          JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_analyses_doc ON ai_analyses(document_id, kind);
CREATE INDEX idx_ai_analyses_org_created ON ai_analyses(org_id, created_at DESC);


-- Down Migration

DROP TABLE IF EXISTS ai_analyses;
DROP INDEX IF EXISTS idx_documents_tags;
ALTER TABLE documents
  DROP COLUMN IF EXISTS text_s3_key,
  DROP COLUMN IF EXISTS page_count,
  DROP COLUMN IF EXISTS language,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS tags;
