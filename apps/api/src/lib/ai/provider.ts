/**
 * Provider-agnostic AI interface (plan §10.5). Use cases and workers depend on
 * this, never on the OpenAI SDK directly, so we can swap providers (or a mock
 * in tests) without touching business logic.
 *
 * Embeddings + chat (RAG) land in a later phase; Phase 4 only needs the two
 * synchronous analysis calls.
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

export interface AiProvider {
  summarize(text: string): Promise<AiResult<SummaryResult>>;
  classify(text: string): Promise<AiResult<ClassifyResult>>;
}
