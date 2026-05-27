/**
 * Search / filter / stats integration tests against a real Postgres.
 * Same gate as the other suites (RUN_INTEGRATION=1 + localhost). No S3 or AI —
 * documents are inserted directly so we can assert the query behaviour.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const RUN = process.env['RUN_INTEGRATION'] === '1';
const INTEGRATION_URL =
  process.env['INTEGRATION_DATABASE_URL'] ??
  'postgres://clouddocs:clouddocs@localhost:5434/clouddocs';
const LOCAL_HOST_RE = /(?:^|@|\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|\/|$)/;
const URL_LOCAL = LOCAL_HOST_RE.test(INTEGRATION_URL);

if (RUN && URL_LOCAL) {
  process.env['DATABASE_URL'] = INTEGRATION_URL;
}

import { closePool, query } from '../../lib/db/client';
import { signAccessToken } from '../../lib/auth/jwt';
import { handler as listHandler } from './list/handler';
import { handler as statsHandler } from './stats/handler';

const lambdaCtx = {} as Context;

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    routeKey: 'GET /v1/documents',
    rawPath: '/v1/documents',
    requestContext: {
      http: {
        method: 'GET',
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

async function seed(): Promise<{ orgId: string; token: string }> {
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

  // Three documents with distinct names / categories / statuses / tags.
  const docs: Array<[string, string, string | null, string, string[]]> = [
    // filename, status, category, s3key, tags
    ['acme-invoice-q2.pdf', 'ready', 'Invoice', 'raw-uploads/x/1/a.pdf', ['finance', 'billing']],
    ['annual-report.pdf', 'ready', 'Report', 'raw-uploads/x/2/b.pdf', ['yearly']],
    ['draft-letter.docx', 'analyzing', null, 'raw-uploads/x/3/c.docx', []],
  ];
  for (const [filename, status, category, s3key, tags] of docs) {
    await query(
      `INSERT INTO documents (org_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status, category, tags)
       VALUES ($1, $2, $3, 'application/pdf', 1000, $4, $5, $6, $7)`,
      [orgId, userId, filename, s3key, status, category, tags],
    );
  }

  const access = await signAccessToken({
    userId,
    email: 'demo@test.com',
    memberships: [{ orgId, role: 'owner' }],
  });
  return { orgId, token: access.token };
}

describe.skipIf(!RUN || !URL_LOCAL)('documents search / filter / stats', () => {
  let auth: { orgId: string; token: string };

  beforeAll(() => {
    if (!process.env['JWT_PRIVATE_KEY'] || !process.env['JWT_PUBLIC_KEY']) {
      throw new Error('JWT keys must be set for integration tests.');
    }
  });

  beforeEach(async () => {
    await query(
      'TRUNCATE ai_analyses, documents, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
    auth = await seed();
  });

  afterAll(async () => {
    await closePool();
  });

  const headers = (): Record<string, string> => ({
    authorization: `Bearer ${auth.token}`,
    'x-org-id': auth.orgId,
  });

  async function list(
    qs: Record<string, string>,
  ): Promise<{ documents: Array<{ filename: string }> }> {
    const res = (await listHandler(
      makeEvent({ headers: headers(), queryStringParameters: qs }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body);
  }

  it('full-text search matches filename', async () => {
    const { documents } = await list({ q: 'invoice' });
    expect(documents).toHaveLength(1);
    expect(documents[0]!.filename).toBe('acme-invoice-q2.pdf');
  });

  it('full-text search matches a tag', async () => {
    const { documents } = await list({ q: 'billing' });
    expect(documents.map((d) => d.filename)).toEqual(['acme-invoice-q2.pdf']);
  });

  it('full-text search matches a category', async () => {
    const { documents } = await list({ q: 'report' });
    expect(documents.map((d) => d.filename)).toEqual(['annual-report.pdf']);
  });

  it('filters by status', async () => {
    const { documents } = await list({ status: 'ready' });
    expect(documents).toHaveLength(2);
  });

  it('filters by category', async () => {
    const { documents } = await list({ category: 'Invoice' });
    expect(documents.map((d) => d.filename)).toEqual(['acme-invoice-q2.pdf']);
  });

  it('combines search + filter (both applied)', async () => {
    // 'report' matches annual-report.pdf, which is ready → 1 hit.
    expect((await list({ q: 'report', status: 'ready' })).documents.map((d) => d.filename)).toEqual(
      ['annual-report.pdf'],
    );
    // same search but a status it isn't in → 0 hits, proving the filter also applies.
    expect((await list({ q: 'report', status: 'analyzing' })).documents).toHaveLength(0);
  });

  it('returns dashboard stats', async () => {
    const res = (await statsHandler(
      makeEvent({ routeKey: 'GET /v1/documents/stats', headers: headers() }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const stats = JSON.parse(res.body);
    expect(stats.total).toBe(3);
    expect(stats.ready).toBe(2);
    expect(stats.processing).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.storageBytes).toBe(3000);
    expect(stats.uploadsPerDay).toHaveLength(14);
    // all three seeded today → last day's count is 3
    expect(stats.uploadsPerDay[13].count).toBe(3);
  });
});
