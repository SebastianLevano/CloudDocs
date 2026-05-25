/**
 * CSRF defense for the cookie-authenticated endpoints (`refresh`, `logout`).
 *
 * The refresh cookie is `SameSite=None` (the SPA and API are cross-site — see
 * `lib/auth/cookies.ts`), so we can't rely on SameSite to stop a malicious
 * site from triggering an authenticated POST. Instead we require a custom
 * request header: a browser will only attach a non-safelisted header to a
 * cross-origin request after a successful CORS preflight, and our API's CORS
 * config only allows known origins. A forged request from an attacker's page
 * therefore never reaches the handler.
 *
 * We only check the header is present and non-empty — its value is irrelevant;
 * the security comes from the browser's preflight, not the value itself.
 */
import { ForbiddenError } from '../lib/errors';
import type { Handler } from './types';

export const CSRF_HEADER = 'x-cdx-client';

export function withCsrf(handler: Handler): Handler {
  return async (ctx) => {
    const value = ctx.event.headers?.[CSRF_HEADER] ?? ctx.event.headers?.['X-CDX-Client'];
    if (!value || value.trim().length === 0) {
      throw new ForbiddenError('Missing required client header.');
    }
    return handler(ctx);
  };
}
