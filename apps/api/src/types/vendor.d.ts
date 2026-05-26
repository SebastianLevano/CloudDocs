// Ambient declarations for vendored libs whose published types we can't use
// directly: pdf-parse's inner entrypoint (imported to dodge its debug block)
// and mammoth (ships no types).

declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    text: string;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module 'mammoth' {
  interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function extractRawText(input: { buffer: Buffer }): Promise<MammothResult>;
}
