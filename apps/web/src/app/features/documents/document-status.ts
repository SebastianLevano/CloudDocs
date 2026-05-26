import type { Document } from '@clouddocs/shared-types';

/** Statuses that mean "the pipeline is still working" — drive polling + spinners. */
const PROCESSING: ReadonlySet<Document['status']> = new Set([
  'pending_upload',
  'uploaded',
  'extracting',
  'extracted',
  'analyzing',
]);

export function isProcessing(status: Document['status']): boolean {
  return PROCESSING.has(status);
}

export function statusBadgeClass(status: Document['status']): string {
  switch (status) {
    case 'ready':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    case 'failed':
      return 'border-danger/40 bg-danger/10 text-danger';
    case 'pending_upload':
      return 'border-border-strong bg-surface-3 text-text-dim';
    default:
      return 'border-brand-500/40 bg-brand-500/10 text-brand-300';
  }
}
