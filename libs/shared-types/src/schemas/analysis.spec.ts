import { describe, expect, it } from 'vitest';

import { ClassifyResultSchema, SummaryResultSchema } from './analysis';

describe('SummaryResultSchema', () => {
  it('accepts a well-formed summary', () => {
    const v = { summary: 'A short summary.', bullets: ['a', 'b'], language: 'en' };
    expect(SummaryResultSchema.parse(v)).toEqual(v);
  });

  it('caps bullets at 7', () => {
    expect(() =>
      SummaryResultSchema.parse({ summary: 's', bullets: Array(8).fill('x'), language: 'en' }),
    ).toThrow();
  });
});

describe('ClassifyResultSchema', () => {
  it('accepts a known category with confidence in range', () => {
    const v = { category: 'Invoice', confidence: 0.92, tags: ['finance'] };
    expect(ClassifyResultSchema.parse(v)).toEqual(v);
  });

  it('rejects an unknown category', () => {
    expect(() =>
      ClassifyResultSchema.parse({ category: 'Spaceship', confidence: 0.5, tags: [] }),
    ).toThrow();
  });

  it('rejects confidence outside 0..1', () => {
    expect(() =>
      ClassifyResultSchema.parse({ category: 'Other', confidence: 1.5, tags: [] }),
    ).toThrow();
  });
});
