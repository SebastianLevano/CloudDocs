-- Up Migration

-- Document chunk embeddings for semantic search (plan §5.1). One row per chunk;
-- text-embedding-3-small produces 1536-dim vectors.
CREATE TABLE embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chunk_index   INT NOT NULL,
  chunk_text    TEXT NOT NULL,
  embedding     vector(1536) NOT NULL,
  token_count   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX idx_embeddings_org ON embeddings(org_id);

-- HNSW (cosine) — works well on small/growing datasets with no list training,
-- unlike ivfflat which needs data + ANALYZE to be effective.
CREATE INDEX idx_embeddings_vec ON embeddings USING hnsw (embedding vector_cosine_ops);


-- Down Migration

DROP TABLE IF EXISTS embeddings;
