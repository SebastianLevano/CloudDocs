import { describe, expect, it } from 'vitest';

import {
  CreateDocumentDtoSchema,
  DocumentListQuerySchema,
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
});
