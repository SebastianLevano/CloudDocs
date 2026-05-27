import { describe, expect, it } from 'vitest';

import { ChatRequestSchema } from './chat';

describe('ChatRequestSchema', () => {
  it('accepts a minimal user turn', () => {
    const v = { messages: [{ role: 'user', content: 'What is this invoice about?' }] };
    expect(ChatRequestSchema.parse(v).messages).toHaveLength(1);
  });

  it('accepts an optional documentId for per-document chat', () => {
    const parsed = ChatRequestSchema.parse({
      messages: [{ role: 'user', content: 'hi' }],
      documentId: '44444444-4444-4444-8444-444444444444',
    });
    expect(parsed.documentId).toBeDefined();
  });

  it('rejects an empty conversation', () => {
    expect(() => ChatRequestSchema.parse({ messages: [] })).toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() =>
      ChatRequestSchema.parse({ messages: [{ role: 'system', content: 'x' }] }),
    ).toThrow();
  });
});
