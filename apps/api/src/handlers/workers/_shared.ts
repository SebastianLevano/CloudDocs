import type { AnalysisKind } from '@clouddocs/shared-types';
import type { DocumentExtractedDetail } from '../../lib/events';

/**
 * The analysis kinds that must all exist before a document flips to `ready`.
 * Both analyze workers reference this so the ready-join stays consistent.
 */
export const READY_KINDS: readonly AnalysisKind[] = ['summary', 'classification'];

export function isExtractedDetail(detail: unknown): detail is DocumentExtractedDetail {
  return (
    typeof detail === 'object' &&
    detail !== null &&
    typeof (detail as DocumentExtractedDetail).documentId === 'string' &&
    typeof (detail as DocumentExtractedDetail).orgId === 'string' &&
    typeof (detail as DocumentExtractedDetail).textS3Key === 'string'
  );
}
