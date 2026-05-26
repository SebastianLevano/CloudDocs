/**
 * summarize-worker — triggered by the `DocumentExtracted` fan-out. Reads the
 * extracted text, asks the AI provider for a summary, stores it as an
 * `ai_analyses` row, and (if classification is also done) flips the document to
 * `ready` via the atomic ready-join.
 */
import { getAiProvider } from '../../../lib/ai';
import { getObjectText } from '../../../lib/storage/s3';
import { AiAnalysesRepo } from '../../../repositories/ai-analyses-repo';
import { DocumentsRepo } from '../../../repositories/documents-repo';
import { sqsWorker } from '../runner';
import { isExtractedDetail, READY_KINDS } from '../_shared';

export const handler = sqsWorker('summarize', async (envelope, log) => {
  if (!isExtractedDetail(envelope.detail)) {
    log.warn({ envelope }, 'summarize: unexpected event detail, skipping');
    return;
  }
  const { orgId, documentId, textS3Key } = envelope.detail;

  const docs = new DocumentsRepo(orgId);
  await docs.markAnalyzing(documentId);

  const text = await getObjectText(textS3Key);
  const { data, usage } = await getAiProvider().summarize(text);

  const analyses = new AiAnalysesRepo(orgId);
  await analyses.create({
    documentId,
    kind: 'summary',
    model: usage.model,
    promptVersion: usage.promptVersion,
    ...(usage.inputTokens != null ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens != null ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.costUsd != null ? { costUsd: usage.costUsd } : {}),
    result: data,
  });
  if (data.language) await docs.setLanguage(documentId, data.language);

  const ready = await docs.markReadyIfAnalysesComplete(documentId, READY_KINDS, READY_KINDS.length);
  log.info({ documentId, ready }, 'summarize: done');
});
