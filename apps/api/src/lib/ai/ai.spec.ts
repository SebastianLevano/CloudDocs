import { describe, expect, it } from 'vitest';

import { ClassifyResultSchema, SummaryResultSchema } from '@clouddocs/shared-types';

import { MockAiProvider } from './mock-provider';
import { EMBEDDING_DIMENSIONS } from './provider';
import { chunkText } from './chunk';
import { getAiProvider } from './index';

/** Cosine similarity for the embedding assertions. */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot; // mock vectors are already L2-normalized
}

describe('MockAiProvider', () => {
  const provider = new MockAiProvider();

  it('returns a schema-valid summary', async () => {
    const { data } = await provider.summarize('some document text');
    expect(() => SummaryResultSchema.parse(data)).not.toThrow();
  });

  it('returns a schema-valid classification and detects "invoice"', async () => {
    const { data } = await provider.classify('This is an INVOICE for services');
    expect(() => ClassifyResultSchema.parse(data)).not.toThrow();
    expect(data.category).toBe('Invoice');
  });

  it('embeds to fixed-dimension vectors where shared vocabulary is more similar', async () => {
    const { vectors } = await provider.embed([
      'invoice payment due total amount',
      'invoice payment total billing amount',
      'a poem about mountains and rivers',
    ]);
    expect(vectors).toHaveLength(3);
    expect(vectors[0]).toHaveLength(EMBEDDING_DIMENSIONS);
    // First two share most words → more similar than the unrelated third.
    expect(cosine(vectors[0]!, vectors[1]!)).toBeGreaterThan(cosine(vectors[0]!, vectors[2]!));
  });
});

describe('chunkText', () => {
  it('returns a single chunk for short text and splits long text with overlap', () => {
    expect(chunkText('short text')).toEqual(['short text']);
    const long = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} ` + 'x'.repeat(600)).join(
      '\n\n',
    );
    const chunks = chunkText(long, { targetChars: 1000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1300)).toBe(true);
  });

  it('returns no chunks for empty input', () => {
    expect(chunkText('   ')).toEqual([]);
  });
});

describe('getAiProvider', () => {
  it('falls back to the mock provider when no OPENAI_API_KEY is set', () => {
    const prev = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    try {
      expect(getAiProvider()).toBeInstanceOf(MockAiProvider);
    } finally {
      if (prev !== undefined) process.env['OPENAI_API_KEY'] = prev;
    }
  });
});
