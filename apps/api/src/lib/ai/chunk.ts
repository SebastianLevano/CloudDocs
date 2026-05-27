/**
 * Splits document text into overlapping chunks for embedding. Paragraph-aware:
 * accumulates paragraphs up to a target size, then starts a new chunk carrying a
 * small overlap (the tail of the previous chunk) so meaning that straddles a
 * boundary is still retrievable. Sizes are in characters (~4 chars/token), a
 * good-enough proxy for the plan's ~500-token target without a tokenizer dep.
 */
export interface ChunkOptions {
  /** Target max chunk size in characters (~500 tokens ≈ 2000 chars). */
  targetChars?: number;
  /** Overlap carried into the next chunk, in characters. */
  overlapChars?: number;
  /** Safety cap on number of chunks per document. */
  maxChunks?: number;
}

const DEFAULTS = { targetChars: 2000, overlapChars: 200, maxChunks: 50 };

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const { targetChars, overlapChars, maxChunks } = { ...DEFAULTS, ...opts };
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).flatMap(splitLongParagraph(targetChars));

  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > targetChars) {
      chunks.push(current.trim());
      if (chunks.length >= maxChunks) return chunks;
      current = current.slice(Math.max(0, current.length - overlapChars));
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current.trim() && chunks.length < maxChunks) chunks.push(current.trim());
  return chunks;
}

/** A single paragraph larger than the target is hard-split so it still fits. */
function splitLongParagraph(targetChars: number): (para: string) => string[] {
  return (para: string) => {
    if (para.length <= targetChars) return [para];
    const parts: string[] = [];
    for (let i = 0; i < para.length; i += targetChars) {
      parts.push(para.slice(i, i + targetChars));
    }
    return parts;
  };
}
