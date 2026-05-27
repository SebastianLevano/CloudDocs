/**
 * RAG chat integration test against a real Postgres+pgvector. Gated like the
 * others. MockAiProvider (no OPENAI_API_KEY) gives deterministic embeddings +
 * answer, so retrieval and citations are assertable offline.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Context, APIGatewayProxyEventV2 } from 'aws-lambda';

const RUN = process.env['RUN_INTEGRATION'] === '1';
const INTEGRATION_URL =
  process.env['INTEGRATION_DATABASE_URL'] ??
  'postgres://clouddocs:clouddocs@localhost:5434/clouddocs';
const LOCAL_HOST_RE = /(?:^|@|\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|\/|$)/;
const URL_LOCAL = LOCAL_HOST_RE.test(INTEGRATION_URL);

if (RUN && URL_LOCAL) {
  process.env['DATABASE_URL'] = INTEGRATION_URL;
  delete process.env['OPENAI_API_KEY'];
}

import { closePool, query } from '../../lib/db/client';
import { getAiProvider } from '../../lib/ai';
import { signAccessToken } from '../../lib/auth/jwt';
import { EmbeddingsRepo } from '../../repositories/embeddings-repo';
import { handler as chatHandler } from './handler';

const lambdaCtx = {} as Context;

function makeEvent(body: unknown, headers: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    routeKey: 'POST /v1/chat',
    rawPath: '/v1/chat',
    requestContext: {
      http: {
        method: 'POST',
        path: '/v1/chat',
        protocol: 'HTTP/2',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
    },
    headers: { 'user-agent': 'vitest', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

async function seed(): Promise<{ orgId: string; token: string; docId: string }> {
  const orgId = (
    await query<{ id: string }>(
      `INSERT INTO organizations (name, slug) VALUES ('Acme','acme') RETURNING id`,
    )
  )[0]!.id;
  const userId = (
    await query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ('d@test.com','x') RETURNING id`,
    )
  )[0]!.id;
  await query(`INSERT INTO memberships (user_id, org_id, role) VALUES ($1,$2,'owner')`, [
    userId,
    orgId,
  ]);
  const docId = (
    await query<{ id: string }>(
      `INSERT INTO documents (org_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
       VALUES ($1,$2,'acme-invoice.pdf','application/pdf',10,'raw-uploads/x/1/a.pdf','ready') RETURNING id`,
      [orgId, userId],
    )
  )[0]!.id;

  // One embedded chunk about billing.
  const [vec] = (await getAiProvider().embed(['invoice billing payment amount due 6000 net 30']))
    .vectors;
  await new EmbeddingsRepo(orgId).replaceForDocument(docId, [
    {
      chunkIndex: 0,
      chunkText: 'Invoice total amount due is 6000 USD, net 30 days.',
      embedding: vec!,
    },
  ]);

  const token = (
    await signAccessToken({ userId, email: 'd@test.com', memberships: [{ orgId, role: 'owner' }] })
  ).token;
  return { orgId, token, docId };
}

describe.skipIf(!RUN || !URL_LOCAL)('RAG chat', () => {
  let auth: { orgId: string; token: string; docId: string };

  beforeAll(() => {
    if (!process.env['JWT_PRIVATE_KEY'] || !process.env['JWT_PUBLIC_KEY']) {
      throw new Error('JWT keys must be set for integration tests.');
    }
  });

  beforeEach(async () => {
    await query(
      'TRUNCATE embeddings, ai_analyses, documents, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
    auth = await seed();
  });

  afterAll(async () => {
    await closePool();
  });

  it('answers with citations to the relevant document', async () => {
    const res = (await chatHandler(
      makeEvent(
        { messages: [{ role: 'user', content: 'How much do I owe on the invoice?' }] },
        { authorization: `Bearer ${auth.token}`, 'x-org-id': auth.orgId },
      ),
      lambdaCtx,
    )) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.answer).toBe('string');
    expect(body.answer.length).toBeGreaterThan(0);
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.citations[0].documentId).toBe(auth.docId);
    expect(body.citations[0].filename).toBe('acme-invoice.pdf');
  });

  it('scopes retrieval to a documentId when provided', async () => {
    const res = (await chatHandler(
      makeEvent(
        {
          messages: [{ role: 'user', content: 'summary?' }],
          documentId: auth.docId,
        },
        { authorization: `Bearer ${auth.token}`, 'x-org-id': auth.orgId },
      ),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(
      JSON.parse(res.body).citations.every(
        (c: { documentId: string }) => c.documentId === auth.docId,
      ),
    ).toBe(true);
  });
});
