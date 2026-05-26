import { z } from 'zod';

import { DocumentSchema } from './documents';

/** Kinds of AI analysis. Phase 4 produces summary + classification. */
export const AnalysisKindSchema = z.enum(['summary', 'classification', 'entities', 'keywords']);
export type AnalysisKind = z.infer<typeof AnalysisKindSchema>;

/** Predefined document categories the classifier picks from (plan §8 #6). */
export const DOCUMENT_CATEGORIES = [
  'Contract',
  'Invoice',
  'Report',
  'Resume',
  'Letter',
  'Presentation',
  'Other',
] as const;
export const DocumentCategorySchema = z.enum(DOCUMENT_CATEGORIES);
export type DocumentCategory = z.infer<typeof DocumentCategorySchema>;

/**
 * Structured output of the summary prompt. This is the exact shape we ask
 * OpenAI to return (json schema) and what we store in `ai_analyses.result`.
 */
export const SummaryResultSchema = z.object({
  summary: z.string(),
  bullets: z.array(z.string()).max(7),
  language: z.string().describe('ISO 639-1 code of the document language'),
});
export type SummaryResult = z.infer<typeof SummaryResultSchema>;

/** Structured output of the classification prompt. */
export const ClassifyResultSchema = z.object({
  category: DocumentCategorySchema,
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()).max(8),
});
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;

/** A stored analysis row as returned by the API. */
export const AiAnalysisSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  kind: AnalysisKindSchema,
  model: z.string(),
  promptVersion: z.string(),
  result: z.unknown(),
  createdAt: z.iso.datetime(),
});
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

/** GET /v1/documents/{id} — the document plus all its analyses. */
export const DocumentDetailResponseSchema = z.object({
  document: DocumentSchema,
  analyses: z.array(AiAnalysisSchema),
});
export type DocumentDetailResponse = z.infer<typeof DocumentDetailResponseSchema>;
