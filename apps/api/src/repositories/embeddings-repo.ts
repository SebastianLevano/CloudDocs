/**
 * Embeddings repository — org-scoped. Stores per-chunk vectors for semantic
 * search. Re-embedding a document replaces its chunks wholesale so a re-run is
 * idempotent.
 */
import { withTransaction } from '../lib/db/client';
import { OrgScopedRepository } from './org-scoped-repository';

export interface ChunkEmbedding {
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  tokenCount?: number;
}

/** pgvector accepts a `[a,b,c]` literal cast to `vector`. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export class EmbeddingsRepo extends OrgScopedRepository {
  /** Replace all chunks for a document (delete + insert) in one transaction. */
  async replaceForDocument(documentId: string, chunks: ChunkEmbedding[]): Promise<void> {
    await withTransaction(async (tx) => {
      await tx.query(`DELETE FROM embeddings WHERE org_id = $1 AND document_id = $2`, [
        this.orgId,
        documentId,
      ]);
      for (const c of chunks) {
        await tx.query(
          `INSERT INTO embeddings (org_id, document_id, chunk_index, chunk_text, embedding, token_count)
           VALUES ($1, $2, $3, $4, $5::vector, $6)`,
          [
            this.orgId,
            documentId,
            c.chunkIndex,
            c.chunkText,
            toVectorLiteral(c.embedding),
            c.tokenCount ?? 0,
          ],
        );
      }
    });
  }

  async countForDocument(documentId: string): Promise<number> {
    const rows = await this.scopedQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM embeddings WHERE org_id = $1 AND document_id = $2`,
      [documentId],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
