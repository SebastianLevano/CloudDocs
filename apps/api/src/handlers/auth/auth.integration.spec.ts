/**
 * End-to-end auth flow against a real Postgres.
 *
 * Safety: this suite TRUNCATEs the auth tables between tests, so it's
 * gated by two conditions and skips otherwise:
 *
 *   1. `RUN_INTEGRATION=1` is set (so plain `pnpm nx test api` never runs
 *      this against whatever DATABASE_URL happens to be in `.env.local`).
 *   2. The integration URL points at localhost (so a stray production
 *      Neon URL can never wipe real data).
 *
 * To run: `docker compose up -d && pnpm test:integration`.
 *
 * The suite covers the full register → login → me → refresh → logout loop
 * and the security-critical edges: rotated refresh tokens stop working,
 * wrong passwords return 401, replaying a logout is idempotent.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const RUN = process.env['RUN_INTEGRATION'] === '1';
const INTEGRATION_URL =
  process.env['INTEGRATION_DATABASE_URL'] ??
  'postgres://clouddocs:clouddocs@localhost:5434/clouddocs';
const LOCAL_HOST_RE = /(?:^|@|\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|\/|$)/;
const URL_LOCAL = LOCAL_HOST_RE.test(INTEGRATION_URL);

// Only override DATABASE_URL when we actually intend to run the suite, so
// unit-only runs don't accidentally redirect the pool away from whatever
// the caller configured.
if (RUN && URL_LOCAL) {
  process.env['DATABASE_URL'] = INTEGRATION_URL;
}

import { closePool, query } from '../../lib/db/client';
import { REFRESH_COOKIE_NAME } from '../../lib/auth/cookies';
import { handler as registerHandler } from './register/handler';
import { handler as loginHandler } from './login/handler';
import { handler as meHandler } from './me/handler';
import { handler as refreshHandler } from './refresh/handler';
import { handler as logoutHandler } from './logout/handler';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    routeKey: 'POST /v1/test',
    rawPath: '/v1/test',
    requestContext: {
      http: {
        method: 'POST',
        path: '/v1/test',
        protocol: 'HTTP/2',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
    },
    // `x-cdx-client` satisfies withCsrf on the cookie endpoints (refresh/logout).
    headers: { 'user-agent': 'vitest', 'x-cdx-client': 'web' },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

const lambdaCtx = { awsRequestId: 'test-correlation-id' } as Context;

function extractRefreshCookieValue(cookies: readonly string[] | undefined): string {
  if (!cookies) throw new Error('Expected Set-Cookie headers.');
  for (const raw of cookies) {
    const idx = raw.indexOf('=');
    const name = raw.slice(0, idx).trim();
    if (name === REFRESH_COOKIE_NAME) {
      const rest = raw.slice(idx + 1);
      const semi = rest.indexOf(';');
      return semi === -1 ? rest : rest.slice(0, semi);
    }
  }
  throw new Error(`No ${REFRESH_COOKIE_NAME} cookie found.`);
}

describe.skipIf(!RUN || !URL_LOCAL)('auth integration flow', () => {
  beforeAll(() => {
    if (!process.env['JWT_PRIVATE_KEY'] || !process.env['JWT_PUBLIC_KEY']) {
      throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set for integration tests.');
    }
  });

  beforeEach(async () => {
    await query(
      'TRUNCATE refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await closePool();
  });

  const registerPayload = {
    email: 'demo@test.com',
    password: 'correct-horse-battery-staple',
    displayName: 'Demo',
    orgName: 'Acme',
    orgSlug: 'acme',
  };

  it('register → login → me → refresh → logout', async () => {
    const registerRes = (await registerHandler(
      makeEvent({ body: JSON.stringify(registerPayload) }),
      lambdaCtx,
    )) as { statusCode: number; body: string; cookies?: string[] };
    expect(registerRes.statusCode).toBe(201);
    const registerBody = JSON.parse(registerRes.body);
    expect(registerBody.user.email).toBe(registerPayload.email);
    expect(registerBody.memberships).toHaveLength(1);
    expect(registerBody.memberships[0].role).toBe('owner');
    expect(registerBody.tokens.accessToken).toBeTruthy();
    expect(extractRefreshCookieValue(registerRes.cookies)).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const loginRes = (await loginHandler(
      makeEvent({
        body: JSON.stringify({
          email: registerPayload.email,
          password: registerPayload.password,
        }),
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string; cookies?: string[] };
    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    const accessToken = loginBody.tokens.accessToken;
    const loginCookie = extractRefreshCookieValue(loginRes.cookies);

    const meRes = (await meHandler(
      makeEvent({
        rawPath: '/v1/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(meRes.statusCode).toBe(200);
    expect(JSON.parse(meRes.body).user.email).toBe(registerPayload.email);

    const refreshRes = (await refreshHandler(
      makeEvent({ cookies: [`${REFRESH_COOKIE_NAME}=${loginCookie}`] }),
      lambdaCtx,
    )) as { statusCode: number; body: string; cookies?: string[] };
    expect(refreshRes.statusCode).toBe(200);
    const newCookie = extractRefreshCookieValue(refreshRes.cookies);
    expect(newCookie).not.toBe(loginCookie);

    const replayRes = (await refreshHandler(
      makeEvent({ cookies: [`${REFRESH_COOKIE_NAME}=${loginCookie}`] }),
      lambdaCtx,
    )) as { statusCode: number };
    expect(replayRes.statusCode).toBe(401);

    const logoutRes = (await logoutHandler(
      makeEvent({ cookies: [`${REFRESH_COOKIE_NAME}=${newCookie}`] }),
      lambdaCtx,
    )) as { statusCode: number; cookies?: string[] };
    expect(logoutRes.statusCode).toBe(204);
    expect(logoutRes.cookies?.some((c) => /Max-Age=0/.test(c))).toBe(true);

    const logoutAgain = (await logoutHandler(
      makeEvent({ cookies: [`${REFRESH_COOKIE_NAME}=${newCookie}`] }),
      lambdaCtx,
    )) as { statusCode: number };
    expect(logoutAgain.statusCode).toBe(204);
  });

  it('rejects duplicate email registration with 409', async () => {
    await registerHandler(makeEvent({ body: JSON.stringify(registerPayload) }), lambdaCtx);
    const dupe = (await registerHandler(
      makeEvent({
        body: JSON.stringify({ ...registerPayload, orgSlug: 'acme-2' }),
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(dupe.statusCode).toBe(409);
    expect(JSON.parse(dupe.body).error.code).toBe('conflict');
  });

  it('rejects duplicate org slug with 409', async () => {
    await registerHandler(makeEvent({ body: JSON.stringify(registerPayload) }), lambdaCtx);
    const dupe = (await registerHandler(
      makeEvent({
        body: JSON.stringify({ ...registerPayload, email: 'other@test.com' }),
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(dupe.statusCode).toBe(409);
  });

  it('rejects login with wrong password with 401', async () => {
    await registerHandler(makeEvent({ body: JSON.stringify(registerPayload) }), lambdaCtx);
    const bad = (await loginHandler(
      makeEvent({
        body: JSON.stringify({
          email: registerPayload.email,
          password: 'wrong-password-here',
        }),
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(bad.statusCode).toBe(401);
    expect(JSON.parse(bad.body).error.code).toBe('unauthorized');
  });

  it('/me without bearer returns 401', async () => {
    const noAuth = (await meHandler(makeEvent({ rawPath: '/v1/auth/me' }), lambdaCtx)) as {
      statusCode: number;
    };
    expect(noAuth.statusCode).toBe(401);
  });
});
