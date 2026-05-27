/**
 * Provider-agnostic AI interface (plan §10.5). Use cases and workers depend on
 * this, never on the OpenAI SDK directly, so we can swap providers (or a mock
 * in tests) without touching business logic.
 *
 * Chat (RAG) lands in a later phase; this covers the two analysis calls plus
 * embeddings (Phase 7 semantic search).
 */
import type { ClassifyResult, SummaryResult } from '@clouddocs/shared-types';

export interface AiUsage {
  model: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Estimated USD cost, if the provider reports token usage. */
  costUsd?: number;
}

export interface AiResult<T> {
  data: T;
  usage: AiUsage;
}

/** Dimensions of the embedding model (text-embedding-3-small). */
export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbedResult {
  /** One vector per input text, in order. */
  vectors: number[][];
  usage: AiUsage;
}

export interface AiProvider {
  summarize(text: string): Promise<AiResult<SummaryResult>>;
  classify(text: string): Promise<AiResult<ClassifyResult>>;
  /** Embed a batch of texts (document chunks or a search query). */
  embed(texts: string[]): Promise<EmbedResult>;
}
