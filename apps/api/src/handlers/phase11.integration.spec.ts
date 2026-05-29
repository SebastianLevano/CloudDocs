/**
 * Phase 11 integration tests: activity logs, notifications, OCR status routing.
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
    presignUpload: vi.fn(async (key: string, ct: string) => ({
      url: `https://s3.test/${key}?signed=put`,
      headers: { 'Content-Type': ct },
      expiresInSeconds: 300,
    })),
    presignDownload: vi.fn(async (key: string) => ({
      url: `https://s3.test/${key}?signed=get`,
      expiresInSeconds: 900,
    })),
  };
});

// Mock Stripe for billing gate
vi.mock('../lib/stripe', () => ({
  getStripe: vi.fn(() => ({})),
  getProPriceId: vi.fn(() => 'price_mock'),
}));

import { closePool, query } from '../lib/db/client';
import { signAccessToken } from '../lib/auth/jwt';
import { ActivityRepo } from '../repositories/activity-repo';
import { NotificationsRepo } from '../repositories/notifications-repo';
import { DocumentsRepo } from '../repositories/documents-repo';
import { handler as activityListHandler } from './activity/list/handler';
import { handler as notifListHandler } from './notifications/list/handler';
import { handler as notifReadAllHandler } from './notifications/read-all/handler';

const lambdaCtx = { awsRequestId: 'test-p11' } as Context;

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
    `INSERT INTO users (email, display_name, password_hash) VALUES ('demo@test.com', 'Demo', 'x') RETURNING id`,
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

describe.skipIf(!RUN || !URL_LOCAL)('phase 11 — activity logs', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE activity_logs, notifications, usage_counters, subscriptions, document_comments, document_shares, documents, folders, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await closePool();
  });

  it('logs an action and lists it via GET /v1/activity', async () => {
    const { orgId, token } = await seedOrgUser();
    await ActivityRepo.log({
      orgId,
      action: 'document.uploaded',
      targetType: 'document',
      targetId: orgId,
    });

    const res = (await activityListHandler(
      makeEvent({ headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId } }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].action).toBe('document.uploaded');
  });

  it('filters activity by action', async () => {
    const { orgId, token } = await seedOrgUser();
    await ActivityRepo.log({ orgId, action: 'document.uploaded' });
    await ActivityRepo.log({ orgId, action: 'share.created' });

    const res = (await activityListHandler(
      makeEvent({
        headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId },
        queryStringParameters: { action: 'share.created' },
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    const body = JSON.parse(res.body);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].action).toBe('share.created');
  });

  it('returns CSV when format=csv', async () => {
    const { orgId, token } = await seedOrgUser();
    await ActivityRepo.log({ orgId, action: 'document.ready' });

    const res = (await activityListHandler(
      makeEvent({
        headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId },
        queryStringParameters: { format: 'csv' },
      }),
      lambdaCtx,
    )) as { statusCode: number; headers: Record<string, string>; body: string };
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv');
    expect(res.body).toContain('document.ready');
    expect(res.body).toContain('action,targetType');
  });
});

describe.skipIf(!RUN || !URL_LOCAL)('phase 11 — notifications', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE activity_logs, notifications, usage_counters, subscriptions, document_comments, document_shares, documents, folders, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  it('creates and lists notifications', async () => {
    const { orgId, userId, token } = await seedOrgUser();
    await NotificationsRepo.create({
      orgId,
      userId,
      type: 'document.ready',
      title: 'Doc is ready',
    });

    const res = (await notifListHandler(
      makeEvent({ headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId } }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.notifications).toHaveLength(1);
    expect(body.unreadCount).toBe(1);
  });

  it('markAllRead sets unread count to 0', async () => {
    const { orgId, userId, token } = await seedOrgUser();
    await NotificationsRepo.create({ orgId, userId, type: 'document.ready', title: 'Doc A' });
    await NotificationsRepo.create({ orgId, userId, type: 'document.ready', title: 'Doc B' });

    await notifReadAllHandler(
      makeEvent({ headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId } }),
      lambdaCtx,
    );

    const res = (await notifListHandler(
      makeEvent({ headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId } }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    const body = JSON.parse(res.body);
    expect(body.unreadCount).toBe(0);
  });

  it('notifyDocReady creates notifications for all org members', async () => {
    const { orgId, userId, token } = await seedOrgUser();
    const docId = await seedDocument(orgId, userId);

    await NotificationsRepo.notifyDocReady({ orgId, documentId: docId, filename: 'report.pdf' });

    const res = (await notifListHandler(
      makeEvent({ headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId } }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    const body = JSON.parse(res.body);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].title).toContain('report.pdf');
  });
});

describe.skipIf(!RUN || !URL_LOCAL)('phase 11 — OCR routing', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE activity_logs, notifications, usage_counters, subscriptions, document_comments, document_shares, documents, folders, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  it('markNeedsOcr transitions from extracting to needs_ocr', async () => {
    const { orgId, userId } = await seedOrgUser();
    const [{ id: docId }] = await query<{ id: string }>(
      `INSERT INTO documents (org_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
       VALUES ($1, $2, 'scan.pdf', 'application/pdf', 1024, 'raw-uploads/scan.pdf', 'extracting') RETURNING id`,
      [orgId, userId],
    );
    const repo = new DocumentsRepo(orgId);
    const updated = await repo.markNeedsOcr(docId);
    expect(updated?.status).toBe('needs_ocr');
  });

  it('claimForOcr transitions needs_ocr to ocr_processing', async () => {
    const { orgId, userId } = await seedOrgUser();
    const [{ id: docId }] = await query<{ id: string }>(
      `INSERT INTO documents (org_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
       VALUES ($1, $2, 'scan.pdf', 'application/pdf', 1024, 'raw-uploads/scan.pdf', 'needs_ocr') RETURNING id`,
      [orgId, userId],
    );
    const repo = new DocumentsRepo(orgId);
    const claimed = await repo.claimForOcr(docId);
    expect(claimed?.status).toBe('ocr_processing');
  });
});
