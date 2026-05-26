import { describe, expect, it } from 'vitest';

import { ClassifyResultSchema, SummaryResultSchema } from '@clouddocs/shared-types';

import { MockAiProvider } from './mock-provider';
import { getAiProvider } from './index';

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
