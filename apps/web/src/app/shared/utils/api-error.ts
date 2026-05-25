import { HttpErrorResponse } from '@angular/common/http';
import type { ApiError } from '@clouddocs/shared-types';

function isApiError(body: unknown): body is ApiError {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as ApiError).error?.message === 'string'
  );
}

/**
 * Turns whatever an HTTP failure produced into a user-facing message, reading
 * the backend's stable `{ error: { message, ... } }` envelope when present.
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof HttpErrorResponse) {
    if (isApiError(err.error)) return err.error.error.message;
    if (err.status === 0) return 'Cannot reach the server. Check your connection.';
  }
  return fallback;
}
