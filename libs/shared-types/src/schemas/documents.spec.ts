import { describe, expect, it } from 'vitest';

import {
  CreateDocumentDtoSchema,
  DocumentListQuerySchema,
  DocumentStatsSchema,
  MAX_UPLOAD_SIZE_BYTES,
} from './documents';

describe('CreateDocumentDtoSchema', () => {
  const valid = {
    filename: 'contract.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
  };

  it('accepts a valid PDF payload', () => {
    expect(CreateDocumentDtoSchema.parse(valid)).toEqual(valid);
  });

  it('rejects unsupported mime types', () => {
    expect(() => CreateDocumentDtoSchema.parse({ ...valid, mimeType: 'image/png' })).toThrow();
  });

  it('rejects files over the 10 MB limit', () => {
    expect(() =>
      CreateDocumentDtoSchema.parse({ ...valid, sizeBytes: MAX_UPLOAD_SIZE_BYTES + 1 }),
    ).toThrow();
  });

  it('rejects empty filenames', () => {
    expect(() => CreateDocumentDtoSchema.parse({ ...valid, filename: '' })).toThrow();
  });
});

describe('DocumentListQuerySchema', () => {
  it('defaults limit to 20 and coerces string query params', () => {
    expect(DocumentListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(DocumentListQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  it('caps limit at 100', () => {
    expect(() => DocumentListQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('accepts search + filter params and trims q', () => {
    const parsed = DocumentListQuerySchema.parse({
      q: '  invoice ',
      status: 'ready',
      category: 'Invoice',
    });
    expect(parsed.q).toBe('invoice');
    expect(parsed.status).toBe('ready');
    expect(parsed.category).toBe('Invoice');
  });

  it('rejects an unknown status', () => {
    expect(() => DocumentListQuerySchema.parse({ status: 'bogus' })).toThrow();
  });
});

describe('DocumentStatsSchema', () => {
  it('accepts a well-formed stats payload', () => {
    const v = {
      total: 3,
      ready: 2,
      processing: 1,
      failed: 0,
      storageBytes: 4096,
      analysesThisMonth: 4,
      uploadsPerDay: [{ date: '2026-05-26', count: 2 }],
    };
    expect(DocumentStatsSchema.parse(v)).toEqual(v);
  });
});
