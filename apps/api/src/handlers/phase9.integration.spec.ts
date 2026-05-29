/**
 * Phase 9 integration tests: folders, shares, comments.
 * Same safety gate as other suites — only runs with RUN_INTEGRATION=1 + localhost DB.
 * S3 is mocked for the public-share handler.
 *
 * To run: docker compose up -d && pnpm test:integration
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('../lib/storage/s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage/s3')>();
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

import { closePool, query } from '../lib/db/client';
import { signAccessToken } from '../lib/auth/jwt';
import { handler as folderCreateHandler } from './folders/create/handler';
import { handler as folderListHandler } from './folders/list/handler';
import { handler as folderDeleteHandler } from './folders/delete/handler';
import { handler as shareCreateHandler } from './shares/create/handler';
import { handler as shareDeleteHandler } from './shares/delete/handler';
import { handler as sharePublicGetHandler } from './shares/public-get/handler';
import { handler as commentCreateHandler } from './documents/comments/create/handler';
import { handler as commentListHandler } from './documents/comments/list/handler';
import { handler as commentDeleteHandler } from './documents/comments/delete/handler';

const lambdaCtx = { awsRequestId: 'test-correlation-id' } as Context;

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    routeKey: 'GET /v1/test',
    rawPath: '/v1/test',
    requestContext: {
      http: {
        method: 'GET',
        path: '/v1/test',
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
  const [{ id: orgId }] = await query<{ id: string }>(
    `INSERT INTO organizations (name, slug) VALUES ('Acme', 'acme') RETURNING id`,
  );
  const [{ id: userId }] = await query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash) VALUES ('demo@test.com', 'Demo User', 'x') RETURNING id`,
  );
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

async function seedDocument(orgId: string, userId: string): Promise<string> {
  const [{ id }] = await query<{ id: string }>(
    `INSERT INTO documents (org_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
     VALUES ($1, $2, 'test.pdf', 'application/pdf', 1024, 'raw-uploads/test.pdf', 'uploaded') RETURNING id`,
    [orgId, userId],
  );
  return id;
}

describe.skipIf(!RUN || !URL_LOCAL)('phase 9 — folders', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE document_comments, document_shares, documents, folders, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it('create folder → list → delete', async () => {
    const { orgId, token } = await seedOrgUser();
    const auth = { authorization: `Bearer ${token}`, 'x-org-id': orgId };

    const createRes = (await folderCreateHandler(
      makeEvent({
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Contracts' }),
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(createRes.statusCode).toBe(201);
    const folder = JSON.parse(createRes.body);
    expect(folder.name).toBe('Contracts');

    const listRes = (await folderListHandler(makeEvent({ headers: auth }), lambdaCtx)) as {
      statusCode: number;
      body: string;
    };
    expect(listRes.statusCode).toBe(200);
    const { folders } = JSON.parse(listRes.body);
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Contracts');

    const deleteRes = (await folderDeleteHandler(
      makeEvent({ headers: auth, pathParameters: { id: folder.id } }),
      lambdaCtx,
    )) as { statusCode: number };
    expect(deleteRes.statusCode).toBe(204);

    const listAfter = JSON.parse(
      ((await folderListHandler(makeEvent({ headers: auth }), lambdaCtx)) as { body: string }).body,
    );
    expect(listAfter.folders).toHaveLength(0);
  });

  it('nested folders (parent_id)', async () => {
    const { orgId, token } = await seedOrgUser();
    const auth = { authorization: `Bearer ${token}`, 'x-org-id': orgId };

    const parentRes = (await folderCreateHandler(
      makeEvent({
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Root' }),
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    const parent = JSON.parse(parentRes.body);

    const childRes = (await folderCreateHandler(
      makeEvent({
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Sub', parentId: parent.id }),
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(childRes.statusCode).toBe(201);
    const child = JSON.parse(childRes.body);
    expect(child.parentId).toBe(parent.id);
  });
});

describe.skipIf(!RUN || !URL_LOCAL)('phase 9 — shares', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE document_comments, document_shares, documents, folders, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  it('create share → public get → revoke', async () => {
    const { orgId, userId, token } = await seedOrgUser();
    const auth = { authorization: `Bearer ${token}`, 'x-org-id': orgId };
    const docId = await seedDocument(orgId, userId);

    const createRes = (await shareCreateHandler(
      makeEvent({
        headers: { ...auth, 'content-type': 'application/json' },
        body: '{}',
        pathParameters: { id: docId },
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(createRes.statusCode).toBe(201);
    const { shares } = JSON.parse(createRes.body);
    expect(shares).toHaveLength(1);
    const shareToken = shares[0].token;
    const shareId = shares[0].id;

    const pubRes = (await sharePublicGetHandler(
      makeEvent({ pathParameters: { token: shareToken } }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(pubRes.statusCode).toBe(200);
    const pub = JSON.parse(pubRes.body);
    expect(pub.filename).toBe('test.pdf');
    expect(pub.downloadUrl).toContain('signed=get');

    const delRes = (await shareDeleteHandler(
      makeEvent({ headers: auth, pathParameters: { id: docId, shareId } }),
      lambdaCtx,
    )) as { statusCode: number };
    expect(delRes.statusCode).toBe(204);
  });

  it('public get returns 404 for unknown token', async () => {
    const res = (await sharePublicGetHandler(
      makeEvent({ pathParameters: { token: 'nonexistent-token' } }),
      lambdaCtx,
    )) as { statusCode: number };
    expect(res.statusCode).toBe(404);
  });
});

describe.skipIf(!RUN || !URL_LOCAL)('phase 9 — comments', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE document_comments, document_shares, documents, folders, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  it('post comment → list → delete', async () => {
    const { orgId, userId, token } = await seedOrgUser();
    const auth = { authorization: `Bearer ${token}`, 'x-org-id': orgId };
    const docId = await seedDocument(orgId, userId);

    const postRes = (await commentCreateHandler(
      makeEvent({
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Great document!' }),
        pathParameters: { id: docId },
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(postRes.statusCode).toBe(201);
    const comment = JSON.parse(postRes.body);
    expect(comment.body).toBe('Great document!');
    expect(comment.authorName).toBe('Demo User');

    const listRes = (await commentListHandler(
      makeEvent({ headers: auth, pathParameters: { id: docId } }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(listRes.statusCode).toBe(200);
    const { comments } = JSON.parse(listRes.body);
    expect(comments).toHaveLength(1);

    const delRes = (await commentDeleteHandler(
      makeEvent({ headers: auth, pathParameters: { id: docId, commentId: comment.id } }),
      lambdaCtx,
    )) as { statusCode: number };
    expect(delRes.statusCode).toBe(204);

    const after = JSON.parse(
      (
        (await commentListHandler(
          makeEvent({ headers: auth, pathParameters: { id: docId } }),
          lambdaCtx,
        )) as { body: string }
      ).body,
    );
    expect(after.comments).toHaveLength(0);
  });

  it("cannot delete another user's comment", async () => {
    const { orgId, userId, token } = await seedOrgUser();
    const auth = { authorization: `Bearer ${token}`, 'x-org-id': orgId };
    const docId = await seedDocument(orgId, userId);

    // Create a second user in the same org
    const [{ id: user2Id }] = await query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ('other@test.com', 'Other User', 'x') RETURNING id`,
    );
    await query(`INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, 'member')`, [
      user2Id,
      orgId,
    ]);
    const access2 = await signAccessToken({
      userId: user2Id,
      email: 'other@test.com',
      memberships: [{ orgId, role: 'member' }],
    });
    const auth2 = { authorization: `Bearer ${access2.token}`, 'x-org-id': orgId };

    // User 1 posts a comment
    const postRes = (await commentCreateHandler(
      makeEvent({
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'My comment' }),
        pathParameters: { id: docId },
      }),
      lambdaCtx,
    )) as { body: string };
    const comment = JSON.parse(postRes.body);

    // User 2 tries to delete it — should 403
    const delRes = (await commentDeleteHandler(
      makeEvent({ headers: auth2, pathParameters: { id: docId, commentId: comment.id } }),
      lambdaCtx,
    )) as { statusCode: number };
    expect(delRes.statusCode).toBe(403);
  });
});
