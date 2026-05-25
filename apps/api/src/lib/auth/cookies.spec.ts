import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildClearedRefreshCookie,
  buildRefreshCookie,
  readRefreshCookie,
  REFRESH_COOKIE_NAME,
} from './cookies';

/** Parse a Set-Cookie string into { name=value, ...flags }. */
function attrs(cookie: string): { value: string; flags: Set<string> } {
  const [pair, ...rest] = cookie.split('; ');
  return { value: pair, flags: new Set(rest) };
}

describe('refresh cookie', () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    delete process.env['COOKIE_SAMESITE'];
    delete process.env['COOKIE_SECURE'];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('defaults to SameSite=None; Secure (cross-site SPA ↔ API)', () => {
    const { value, flags } = attrs(buildRefreshCookie('tok', 3600));
    expect(value).toBe(`${REFRESH_COOKIE_NAME}=tok`);
    expect(flags).toContain('Path=/v1/auth');
    expect(flags).toContain('Max-Age=3600');
    expect(flags).toContain('HttpOnly');
    expect(flags).toContain('SameSite=None');
    expect(flags).toContain('Secure');
  });

  it('forces Secure even when COOKIE_SECURE=false, because SameSite=None requires it', () => {
    process.env['COOKIE_SECURE'] = 'false';
    expect(attrs(buildRefreshCookie('tok', 60)).flags).toContain('Secure');
  });

  it('honours COOKIE_SAMESITE=Lax and then respects COOKIE_SECURE=false', () => {
    process.env['COOKIE_SAMESITE'] = 'Lax';
    process.env['COOKIE_SECURE'] = 'false';
    const { flags } = attrs(buildRefreshCookie('tok', 60));
    expect(flags).toContain('SameSite=Lax');
    expect(flags).not.toContain('Secure');
  });

  it('clears the cookie with Max-Age=0 and matching attributes', () => {
    const { value, flags } = attrs(buildClearedRefreshCookie());
    expect(value).toBe(`${REFRESH_COOKIE_NAME}=`);
    expect(flags).toContain('Max-Age=0');
    expect(flags).toContain('SameSite=None');
    expect(flags).toContain('HttpOnly');
  });

  it('reads the token back from the API Gateway v2 cookies array', () => {
    expect(readRefreshCookie([`${REFRESH_COOKIE_NAME}=abc123`, 'other=x'])).toBe('abc123');
    expect(readRefreshCookie(['other=x'])).toBeUndefined();
    expect(readRefreshCookie(undefined)).toBeUndefined();
  });
});
