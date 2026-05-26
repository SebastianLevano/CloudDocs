/**
 * Text extraction for the supported document types. PDF via `pdf-parse`
 * (imported from its inner entrypoint to avoid the package's debug block that
 * reads a sample file at import time when bundled), DOCX via `mammoth`.
 */
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { extractRawText } from 'mammoth';

import { AppError } from '../errors';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface ExtractedText {
  text: string;
  pageCount?: number;
}

export async function extractText(bytes: Buffer, mimeType: string): Promise<ExtractedText> {
  if (mimeType === PDF) {
    const result = await pdfParse(bytes);
    return { text: normalize(result.text), pageCount: result.numpages };
  }
  if (mimeType === DOCX) {
    const result = await extractRawText({ buffer: bytes });
    return { text: normalize(result.value) };
  }
  throw new AppError('unsupported_media_type', `Cannot extract text from ${mimeType}.`, 415);
}

/** Collapse excessive whitespace; keeps payloads (and token costs) sane. */
function normalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
