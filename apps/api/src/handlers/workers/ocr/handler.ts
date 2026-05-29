/**
 * ocr-worker — SQS-triggered (DocumentNeedsOcr → EventBridge → ocr queue).
 *
 * Downloads the raw file from S3, runs Tesseract.js OCR to extract text from
 * scanned PDFs/images, stores the text in S3, and then emits DocumentExtracted
 * so the existing AI pipeline (summarize + classify + embed) picks up from here.
 *
 * Tesseract.js downloads the English training data (~4 MB) to /tmp on the first
 * cold start and caches it for warm invocations. Lambda has internet access by
 * default (not in a VPC) so the download succeeds.
 */
import { mkdir } from 'node:fs/promises';

import { buildTextKey, getObjectBytes, putText } from '../../../lib/storage/s3';
import { publishDocumentExtracted } from '../../../lib/events';
import { DocumentsRepo } from '../../../repositories/documents-repo';
import { sqsWorker, type EventBridgeEnvelope } from '../runner';

const TESSDATA_DIR = '/tmp/tessdata';
// Cache the worker across warm invocations — creation is expensive (~2s).
let _tesseractWorkerCache: unknown | null = null;

async function getTesseractWorker(): Promise<{
  recognize: (buf: Buffer) => Promise<{ data: { text: string } }>;
}> {
  if (_tesseractWorkerCache)
    return _tesseractWorkerCache as ReturnType<typeof getTesseractWorker> extends Promise<infer T>
      ? T
      : never;

  await mkdir(TESSDATA_DIR, { recursive: true });

  // Dynamic import avoids esbuild trying to statically analyse tesseract.js
  // (which needs runtime access to its WASM binary and language data files).
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    langPath: TESSDATA_DIR,
    cacheMethod: 'write', // persist downloaded traineddata to /tmp
    logger: () => undefined,
  });
  _tesseractWorkerCache = worker;
  return worker as ReturnType<typeof getTesseractWorker> extends Promise<infer T> ? T : never;
}

interface DocumentNeedsOcrDetail {
  orgId: string;
  documentId: string;
  s3Key: string;
}

export const handler = sqsWorker('ocr', async (envelope: EventBridgeEnvelope, log) => {
  const detail = envelope.detail as DocumentNeedsOcrDetail;
  const { orgId, documentId, s3Key } = detail ?? {};
  if (!orgId || !documentId || !s3Key) {
    log.warn({ envelope }, 'ocr: missing detail fields, skipping');
    return;
  }

  const repo = new DocumentsRepo(orgId);

  const claimed = await repo.claimForOcr(documentId);
  if (!claimed) {
    log.info({ documentId }, 'ocr: already claimed/processed, skipping');
    return;
  }

  try {
    const bytes = await getObjectBytes(s3Key);
    const worker = await getTesseractWorker();
    const {
      data: { text },
    } = await worker.recognize(bytes);

    const textS3Key = buildTextKey(orgId, documentId);
    await putText(textS3Key, text.trim() || '[OCR produced no text]');
    await repo.markExtracted(documentId, { textS3Key });
    await publishDocumentExtracted({ orgId, documentId, textS3Key });

    log.info({ documentId, chars: text.length }, 'ocr: done');
  } catch (err) {
    log.error({ err, documentId }, 'ocr: failed');
    await repo.setStatus(documentId, 'failed', 'OCR processing failed.');
  }
});
