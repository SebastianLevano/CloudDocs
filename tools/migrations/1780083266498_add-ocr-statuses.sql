-- Add needs_ocr and ocr_processing to the documents.status CHECK constraint.
-- Postgres requires dropping and re-adding the constraint.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status IN (
    'pending_upload', 'uploaded', 'extracting', 'extracted',
    'needs_ocr', 'ocr_processing',
    'analyzing', 'ready', 'failed'
  ));
