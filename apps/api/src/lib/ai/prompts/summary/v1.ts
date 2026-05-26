/**
 * Summary prompt v1. Versioned so we can re-run old documents under a new
 * prompt and compare (the version is stored on every ai_analyses row).
 */
export const SUMMARY_PROMPT_VERSION = 'summary.v1';

export const SUMMARY_SYSTEM = [
  'You are a precise document summarizer for a document-management product.',
  'Given the extracted text of a document, produce:',
  '- a concise 2-4 sentence summary of what the document is and its key point,',
  '- up to 7 short bullet points covering the most important facts,',
  '- the ISO 639-1 language code of the document.',
  'Be factual; do not invent details that are not in the text.',
].join('\n');

export function summaryUserPrompt(text: string): string {
  return `Summarize the following document:\n\n"""\n${text}\n"""`;
}
