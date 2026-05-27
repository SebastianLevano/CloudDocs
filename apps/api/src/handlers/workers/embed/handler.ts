/**
 * embed-worker — triggered by the `DocumentExtracted` fan-out (alongside
 * summarize + classify). Reads the extracted text, chunks it, embeds each chunk
 * with the AI provider, and stores the vectors for semantic search.
 *
 * Independent of the ready-join: a document becomes `ready` on summary +
 * classification; embeddings populate in parallel and just make the doc
 * retrievable by semantic search once they land.
 */
import { chunkText, getAiProvider } from '../../../lib/ai';
import { getObjectText } from '../../../lib/storage/s3';
import { EmbeddingsRepo } from '../../../repositories/embeddings-repo';
import { sqsWorker } from '../runner';
import { isExtractedDetail } from '../_shared';

export const handler = sqsWorker('embed', async (envelope, log) => {
  if (!isExtractedDetail(envelope.detail)) {
    log.warn({ envelope }, 'embed: unexpected event detail, skipping');
    return;
  }
  const { orgId, documentId, textS3Key } = envelope.detail;

  const text = await getObjectText(textS3Key);
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    log.info({ documentId }, 'embed: no text to embed, skipping');
    return;
  }

  const { vectors } = await getAiProvider().embed(chunks);

  await new EmbeddingsRepo(orgId).replaceForDocument(
    documentId,
    chunks.map((content, i) => ({ chunkIndex: i, chunkText: content, embedding: vectors[i]! })),
  );

  log.info({ documentId, chunks: chunks.length }, 'embed: done');
});
