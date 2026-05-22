/**
 * Cookie helpers focused on the refresh-token cookie.
 *
 * - Name: `cdx_rt` (CloudDocs refresh token). Short for tighter Set-Cookie
 *   headers; recognised across the codebase.
 * - HttpOnly + SameSite=Lax so the browser ships it on top-level POSTs to
 *   `/v1/auth/refresh` and `/v1/auth/logout` but not on third-party requests.
 * - Secure flag toggled by env (`COOKIE_SECURE`) so local http://localhost
 *   dev still works while prod over HTTPS demands it.
 * - Path scoped to `/v1/auth` so the cookie is only sent to auth endpoints,
 *   not to documents/search/etc.
 */
export const REFRESH_COOKIE_NAME = 'cdx_rt';
const COOKIE_PATH = '/v1/auth';

function isSecure(): boolean {
  return process.env['COOKIE_SECURE'] !== 'false';
}

export function buildRefreshCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${REFRESH_COOKIE_NAME}=${token}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
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
    'SameSite=Lax',
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
