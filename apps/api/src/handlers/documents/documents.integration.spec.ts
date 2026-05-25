/**
 * End-to-end document flow against a real Postgres (create → complete → list).
 *
 * Same safety gate as the auth suite: only runs when `RUN_INTEGRATION=1` AND
 * the DB URL points at localhost, so `pnpm nx test api` never truncates a real
 * database. S3 is mocked (the presign helpers) so the suite needs no AWS creds
 * and never touches a bucket — we're exercising the DB + handler wiring, not S3.
 *
 * To run: `docker compose up -d && pnpm test:integration`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const RUN = process.env['RUN_INTEGRATION'] === '1';
const INTEGRATION_URL =
  process.env['INTEGRATION_DATABASE_URL'] ??
  'postgres://clouddocs:clouddocs@localhost:5434/clouddocs';
const LOCAL_HOST_RE = /(?:^|@|\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|\/|$)/;
const URL_LOCAL = LOCAL_HOST_RE.test(INTEGRATION_URL);

if (RUN && URL_LOCAL) {
  process.env['DATABASE_URL'] = INTEGRATION_URL;
  process.env['UPLOADS_BUCKET'] = 'test-bucket';
}

// Mock S3 so presigning is offline and deterministic — no AWS creds needed.
vi.mock('../../lib/storage/s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage/s3')>();
  return {
    ...actual,
    presignUpload: vi.fn(async (key: string, contentType: string) => ({
      url: `https://s3.test/${key}?signed=put`,
      headers: { 'Content-Type': contentType },
      expiresInSeconds: 300,
    })),
    presignDownload: vi.fn(async (key: string) => ({
      url: `https://s3.test/${key}?signed=get`,
      expiresInSeconds: 900,
    })),
  };
});

import { closePool, query } from '../../lib/db/client';
import { signAccessToken } from '../../lib/auth/jwt';
import { handler as createHandler } from './create/handler';
import { handler as completeHandler } from './complete/handler';
import { handler as listHandler } from './list/handler';

const lambdaCtx = { awsRequestId: 'test-correlation-id' } as Context;

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    routeKey: 'POST /v1/test',
    rawPath: '/v1/documents',
    requestContext: {
      http: {
        method: 'POST',
        path: '/v1/documents',
        protocol: 'HTTP/2',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
    },
    headers: { 'user-agent': 'vitest' },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

async function seedOrgUser(): Promise<{ orgId: string; userId: string; token: string }> {
  const orgs = await query<{ id: string }>(
    `INSERT INTO organizations (name, slug) VALUES ('Acme', 'acme') RETURNING id`,
  );
  const orgId = orgs[0]!.id;
  const users = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ('demo@test.com', 'x') RETURNING id`,
  );
  const userId = users[0]!.id;
  await query(`INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, 'owner')`, [
    userId,
    orgId,
  ]);
  const access = await signAccessToken({
    userId,
    email: 'demo@test.com',
    memberships: [{ orgId, role: 'owner' }],
  });
  return { orgId, userId, token: access.token };
}

describe.skipIf(!RUN || !URL_LOCAL)('documents integration flow', () => {
  beforeAll(() => {
    if (!process.env['JWT_PRIVATE_KEY'] || !process.env['JWT_PUBLIC_KEY']) {
      throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set for integration tests.');
    }
  });

  beforeEach(async () => {
    await query(
      'TRUNCATE documents, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it('create → complete → list', async () => {
    const { orgId, token } = await seedOrgUser();
    const authHeaders = { authorization: `Bearer ${token}`, 'x-org-id': orgId };

    const createRes = (await createHandler(
      makeEvent({
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: 'contract.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
        }),
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.document.status).toBe('pending_upload');
    expect(created.upload.url).toContain('signed=put');
    const docId = created.document.id;

    const completeRes = (await completeHandler(
      makeEvent({
        rawPath: `/v1/documents/${docId}/complete`,
        headers: authHeaders,
        pathParameters: { id: docId },
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(completeRes.statusCode).toBe(200);
    expect(JSON.parse(completeRes.body).status).toBe('uploaded');

    const listRes = (await listHandler(
      makeEvent({
        routeKey: 'GET /v1/documents',
        headers: authHeaders,
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(listRes.statusCode).toBe(200);
    const list = JSON.parse(listRes.body);
    expect(list.documents).toHaveLength(1);
    expect(list.documents[0].id).toBe(docId);
    expect(list.documents[0].status).toBe('uploaded');
    expect(list.nextCursor).toBeNull();
  });

  it('rejects completing a document twice', async () => {
    const { orgId, token } = await seedOrgUser();
    const authHeaders = { authorization: `Bearer ${token}`, 'x-org-id': orgId };

    const createRes = (await createHandler(
      makeEvent({
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: 'a.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
        }),
      }),
      lambdaCtx,
    )) as { body: string };
    const docId = JSON.parse(createRes.body).document.id;

    const complete = () =>
      completeHandler(
        makeEvent({ headers: authHeaders, pathParameters: { id: docId } }),
        lambdaCtx,
      ) as Promise<{ statusCode: number }>;

    expect((await complete()).statusCode).toBe(200);
    expect((await complete()).statusCode).toBe(400);
  });

  it('forbids acting on an org the user does not belong to', async () => {
    const { token } = await seedOrgUser();
    const otherOrg = '99999999-9999-4999-8999-999999999999';

    const res = (await createHandler(
      makeEvent({
        headers: {
          authorization: `Bearer ${token}`,
          'x-org-id': otherOrg,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 }),
      }),
      lambdaCtx,
    )) as { statusCode: number };
    expect(res.statusCode).toBe(403);
  });
});
