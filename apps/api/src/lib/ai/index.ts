export type { AiProvider, AiResult, AiUsage } from './provider';
export { OpenAiProvider } from './openai-provider';
export { MockAiProvider } from './mock-provider';

/**
 * Returns the AI provider for the current environment: the real OpenAI client
 * when a key is present, otherwise the deterministic mock (local/dev without a
 * key, and tests).
 */
import type { AiProvider } from './provider';
import { OpenAiProvider } from './openai-provider';
import { MockAiProvider } from './mock-provider';

export function getAiProvider(): AiProvider {
  return process.env['OPENAI_API_KEY'] ? new OpenAiProvider() : new MockAiProvider();
}
