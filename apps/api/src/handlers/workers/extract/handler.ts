/**
 * extract-worker — SQS-triggered (S3 ObjectCreated → EventBridge → ingest queue).
 *
 * Downloads the uploaded file, extracts plain text (pdf-parse / mammoth), stores
 * it in S3, advances the document to `extracted`, and emits a `DocumentExtracted`
 * event that fans out to the summarize + classify queues.
 */
import { DocumentsRepo } from '../../../repositories/documents-repo';
import { buildTextKey, getObjectBytes, putText } from '../../../lib/storage/s3';
import { extractText } from '../../../lib/extract/text-extractor';
import { publishDocumentExtracted, publishDocumentNeedsOcr } from '../../../lib/events';
import { sqsWorker, type EventBridgeEnvelope } from '../runner';

interface S3ObjectCreatedDetail {
  bucket: { name: string };
  object: { key: string };
}

/** raw-uploads/{orgId}/{documentId}/{filename} → ids. */
function parseRawKey(key: string): { orgId: string; documentId: string } | null {
  const parts = decodeURIComponent(key).split('/');
  if (parts.length < 4 || parts[0] !== 'raw-uploads') return null;
  return { orgId: parts[1]!, documentId: parts[2]! };
}

export const handler = sqsWorker('extract', async (envelope: EventBridgeEnvelope, log) => {
  const detail = envelope.detail as S3ObjectCreatedDetail;
  const key = detail?.object?.key;
  if (!key) {
    log.warn({ envelope }, 'extract: event missing object key, skipping');
    return;
  }

  const ids = parseRawKey(key);
  if (!ids) {
    log.warn({ key }, 'extract: key not under raw-uploads/, skipping');
    return;
  }
  const { orgId, documentId } = ids;
  const repo = new DocumentsRepo(orgId);

  const doc = await repo.findById(documentId);
  if (!doc) {
    log.warn({ orgId, documentId }, 'extract: no document row for key, skipping');
    return;
  }

  const claimed = await repo.claimForExtraction(documentId);
  if (!claimed) {
    log.info({ documentId, status: doc.status }, 'extract: already claimed/processed, skipping');
    return;
  }

  try {
    const bytes = await getObjectBytes(claimed.s3_key);
    const { text, pageCount } = await extractText(bytes, claimed.mime_type);

    // Scanned/image PDFs yield little or no extractable text.
    // Route them to the OCR worker instead of the AI analysis pipeline.
    const MIN_TEXT_CHARS = 50;
    if (text.trim().length < MIN_TEXT_CHARS) {
      await repo.markNeedsOcr(documentId);
      await publishDocumentNeedsOcr({ orgId, documentId, s3Key: claimed.s3_key });
      log.info(
        { documentId, chars: text.trim().length },
        'extract: text too short, routing to OCR',
      );
      return;
    }

    const textS3Key = buildTextKey(orgId, documentId);
    await putText(textS3Key, text);
    await repo.markExtracted(documentId, { textS3Key, ...(pageCount ? { pageCount } : {}) });
    await publishDocumentExtracted({ orgId, documentId, textS3Key });
    log.info({ documentId, pageCount, chars: text.length }, 'extract: done');
  } catch (err) {
    // Terminal for this document: mark failed and consume the message rather
    // than retry a file we can't parse. Transient infra blips are rare in dev.
    log.error({ err, documentId }, 'extract: failed');
    await repo.setStatus(documentId, 'failed', 'Text extraction failed.');
  }
});
