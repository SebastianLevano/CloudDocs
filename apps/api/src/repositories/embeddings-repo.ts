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

  /**
   * Retrieve the top-K chunks nearest the query vector (cosine), for RAG. Joins
   * documents for the filename. Optionally scoped to a single document.
   * `$1`=org, `$2`=vector, `$3`=limit, `$4`=documentId (when filtering).
   */
  async search(
    queryVector: number[],
    limit: number,
    documentId?: string,
  ): Promise<RetrievedChunk[]> {
    const vec = toVectorLiteral(queryVector);
    const params: unknown[] = [vec, limit];
    let filter = '';
    if (documentId) {
      params.push(documentId);
      filter = 'AND e.document_id = $4';
    }
    return this.scopedQuery<RetrievedChunk>(
      `SELECT e.document_id AS "documentId",
              d.filename     AS filename,
              e.chunk_index  AS "chunkIndex",
              e.chunk_text   AS "chunkText",
              (e.embedding <=> $2::vector) AS distance
       FROM embeddings e
       JOIN documents d ON d.id = e.document_id AND d.org_id = $1
       WHERE e.org_id = $1 ${filter}
       ORDER BY e.embedding <=> $2::vector
       LIMIT $3`,
      params,
    );
  }
}

// type alias (not interface) so it satisfies the scopedQuery `Record` constraint.
export type RetrievedChunk = {
  documentId: string;
  filename: string;
  chunkIndex: number;
  chunkText: string;
  distance: number;
};
