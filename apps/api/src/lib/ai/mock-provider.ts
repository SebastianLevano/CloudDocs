/**
 * Deterministic {@link AiProvider} for tests and local runs without an API key.
 * Returns canned-but-plausible results derived from the input so assertions can
 * be specific.
 */
import type { ClassifyResult, SummaryResult } from '@clouddocs/shared-types';

import type { AiProvider, AiResult } from './provider';

export class MockAiProvider implements AiProvider {
  async summarize(text: string): Promise<AiResult<SummaryResult>> {
    const data: SummaryResult = {
      summary: `Mock summary of a ${text.length}-character document.`,
      bullets: ['First key point', 'Second key point'],
      language: 'en',
    };
    return { data, usage: { model: 'mock', promptVersion: 'mock', costUsd: 0 } };
  }

  async classify(text: string): Promise<AiResult<ClassifyResult>> {
    const data: ClassifyResult = {
      category: text.toLowerCase().includes('invoice') ? 'Invoice' : 'Other',
      confidence: 0.9,
      tags: ['mock', 'test'],
    };
    return { data, usage: { model: 'mock', promptVersion: 'mock', costUsd: 0 } };
  }
}
