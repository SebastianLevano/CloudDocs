/**
 * Cookie helpers focused on the refresh-token cookie.
 *
 * - Name: `cdx_rt` (CloudDocs refresh token). Short for tighter Set-Cookie
 *   headers; recognised across the codebase.
 * - HttpOnly so JavaScript can never read it (XSS can't exfiltrate it).
 * - SameSite defaults to **None** because the SPA (Vercel / localhost) and the
 *   API (`*.execute-api.<region>.amazonaws.com`) are on different sites, so the
 *   browser only sends the cookie on cross-site XHR when SameSite=None. None
 *   *requires* Secure, so {@link isSecure} forces it on in that mode.
 *   Override with `COOKIE_SAMESITE=Lax` for same-site setups (e.g. a future
 *   custom domain proxying the API) or local same-origin testing.
 * - SameSite=None removes the implicit CSRF protection Lax gave us, so the
 *   refresh/logout handlers additionally require the `X-CDX-Client` header
 *   (see `middlewares/with-csrf.ts`): a forged cross-site request can't set a
 *   custom header without a CORS preflight, which our origin allowlist blocks.
 * - Path scoped to `/v1/auth` so the cookie is only sent to auth endpoints,
 *   not to documents/search/etc.
 */
export const REFRESH_COOKIE_NAME = 'cdx_rt';
const COOKIE_PATH = '/v1/auth';

type SameSiteMode = 'None' | 'Lax' | 'Strict';

function sameSite(): SameSiteMode {
  const value = process.env['COOKIE_SAMESITE'];
  return value === 'Lax' || value === 'Strict' ? value : 'None';
}

function isSecure(): boolean {
  // SameSite=None is invalid without Secure — browsers drop such cookies — so
  // force it on regardless of COOKIE_SECURE when running in cross-site mode.
  if (sameSite() === 'None') return true;
  return process.env['COOKIE_SECURE'] !== 'false';
}

export function buildRefreshCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${REFRESH_COOKIE_NAME}=${token}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    `SameSite=${sameSite()}`,
  ];
  if (isSecure()) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearedRefreshCookie(): string {
  const parts = [
    `${REFRESH_COOKIE_NAME}=`,
    `Path=${COOKIE_PATH}`,
    'Max-Age=0',
    'HttpOnly',
    `SameSite=${sameSite()}`,
  ];
  if (isSecure()) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Reads cookies from the API Gateway v2 event shape (`event.cookies` is an
 * array of `name=value` strings) and returns the refresh token if present.
 */
export function readRefreshCookie(cookies: readonly string[] | undefined): string | undefined {
  if (!cookies) return undefined;
  for (const raw of cookies) {
    const idx = raw.indexOf('=');
    if (idx <= 0) continue;
    const name = raw.slice(0, idx).trim();
    if (name === REFRESH_COOKIE_NAME) return raw.slice(idx + 1).trim();
  }
  return undefined;
}
