import { DOCUMENT_CATEGORIES } from '@clouddocs/shared-types';

/** Classification prompt v1. */
export const CLASSIFY_PROMPT_VERSION = 'classify.v1';

export const CLASSIFY_SYSTEM = [
  'You are a document classifier for a document-management product.',
  `Assign the document to exactly one category from this list: ${DOCUMENT_CATEGORIES.join(', ')}.`,
  'Use "Other" only when none of the specific categories clearly fit.',
  'Also provide a confidence between 0 and 1 and up to 8 short, lowercase topical tags.',
  'Base your answer only on the provided text.',
].join('\n');

export function classifyUserPrompt(text: string): string {
  return `Classify the following document:\n\n"""\n${text}\n"""`;
}
