/**
 * AI analyses repository — org-scoped. Stores one row per analysis run; a
 * re-analysis inserts a new row (history) rather than overwriting.
 */
import type { AiAnalysis, AnalysisKind } from '@clouddocs/shared-types';

import { OrgScopedRepository } from './org-scoped-repository';

export type AiAnalysisRow = {
  id: string;
  document_id: string;
  org_id: string;
  kind: AnalysisKind;
  model: string;
  prompt_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  result: unknown;
  created_at: Date;
};

export interface CreateAnalysisInput {
  documentId: string;
  kind: AnalysisKind;
  model: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  result: unknown;
}

export class AiAnalysesRepo extends OrgScopedRepository {
  async create(input: CreateAnalysisInput): Promise<AiAnalysisRow> {
    const rows = await this.scopedQuery<AiAnalysisRow>(
      `INSERT INTO ai_analyses
         (org_id, document_id, kind, model, prompt_version, input_tokens, output_tokens, cost_usd, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.documentId,
        input.kind,
        input.model,
        input.promptVersion,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        input.costUsd ?? null,
        JSON.stringify(input.result),
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('Insert into ai_analyses returned no row.');
    return row;
  }

  async listForDocument(documentId: string): Promise<AiAnalysisRow[]> {
    return this.scopedQuery<AiAnalysisRow>(
      `SELECT * FROM ai_analyses
       WHERE org_id = $1 AND document_id = $2
       ORDER BY created_at DESC`,
      [documentId],
    );
  }

  /** Count of analyses created since the start of the current month (dashboard KPI). */
  async countThisMonth(): Promise<number> {
    const rows = await this.scopedQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM ai_analyses
       WHERE org_id = $1 AND created_at >= date_trunc('month', now())`,
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Distinct count of the given kinds present for a document (for the ready-join). */
  async countKinds(documentId: string, kinds: readonly AnalysisKind[]): Promise<number> {
    const rows = await this.scopedQuery<{ n: string }>(
      `SELECT count(DISTINCT kind)::text AS n FROM ai_analyses
       WHERE org_id = $1 AND document_id = $2 AND kind = ANY($3)`,
      [documentId, [...kinds]],
    );
    return Number(rows[0]?.n ?? 0);
  }
}

/** Map a DB row to the API `AiAnalysis` shape. */
export function toAiAnalysis(row: AiAnalysisRow): AiAnalysis {
  return {
    id: row.id,
    documentId: row.document_id,
    kind: row.kind,
    model: row.model,
    promptVersion: row.prompt_version,
    result: row.result,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
