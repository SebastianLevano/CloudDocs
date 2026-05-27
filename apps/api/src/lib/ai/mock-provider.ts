/**
 * Deterministic {@link AiProvider} for tests and local runs without an API key.
 * Returns canned-but-plausible results derived from the input so assertions can
 * be specific.
 */
import type { ClassifyResult, SummaryResult } from '@clouddocs/shared-types';

import { EMBEDDING_DIMENSIONS, type AiProvider, type AiResult, type EmbedResult } from './provider';

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

  async embed(texts: string[]): Promise<EmbedResult> {
    return {
      vectors: texts.map(hashEmbed),
      usage: { model: 'mock', promptVersion: 'embed.mock', costUsd: 0 },
    };
  }
}

/**
 * Deterministic bag-of-words embedding: each word bumps a hashed dimension, then
 * the vector is L2-normalized. Texts sharing vocabulary end up cosine-similar,
 * so integration tests can assert meaningful semantic ranking without OpenAI.
 */
function hashEmbed(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const word of words) {
    let h = 0;
    for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) | 0;
    vec[Math.abs(h) % EMBEDDING_DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}
