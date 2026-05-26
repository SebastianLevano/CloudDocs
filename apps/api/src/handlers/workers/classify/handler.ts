/**
 * classify-worker — triggered by the `DocumentExtracted` fan-out. Reads the
 * extracted text, asks the AI provider to categorize it, stores an
 * `ai_analyses` row, mirrors category + tags onto the document (for list
 * filtering in Phase 5), and runs the ready-join.
 */
import { getAiProvider } from '../../../lib/ai';
import { getObjectText } from '../../../lib/storage/s3';
import { AiAnalysesRepo } from '../../../repositories/ai-analyses-repo';
import { DocumentsRepo } from '../../../repositories/documents-repo';
import { sqsWorker } from '../runner';
import { isExtractedDetail, READY_KINDS } from '../_shared';

export const handler = sqsWorker('classify', async (envelope, log) => {
  if (!isExtractedDetail(envelope.detail)) {
    log.warn({ envelope }, 'classify: unexpected event detail, skipping');
    return;
  }
  const { orgId, documentId, textS3Key } = envelope.detail;

  const docs = new DocumentsRepo(orgId);
  await docs.markAnalyzing(documentId);

  const text = await getObjectText(textS3Key);
  const { data, usage } = await getAiProvider().classify(text);

  const analyses = new AiAnalysesRepo(orgId);
  await analyses.create({
    documentId,
    kind: 'classification',
    model: usage.model,
    promptVersion: usage.promptVersion,
    ...(usage.inputTokens != null ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens != null ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.costUsd != null ? { costUsd: usage.costUsd } : {}),
    result: data,
  });
  await docs.setClassification(documentId, { category: data.category, tags: data.tags });

  const ready = await docs.markReadyIfAnalysesComplete(documentId, READY_KINDS, READY_KINDS.length);
  log.info({ documentId, category: data.category, ready }, 'classify: done');
});
