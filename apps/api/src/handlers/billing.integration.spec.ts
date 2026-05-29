/**
 * Phase 10 billing integration tests: BillingRepo usage tracking + feature gate.
 * Stripe SDK is mocked (offline, no real API calls).
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
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_mock';
  process.env['STRIPE_PRICE_ID'] = 'price_mock';
}

// Mock S3 presigning
vi.mock('../lib/storage/s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage/s3')>();
  return {
    ...actual,
    presignUpload: vi.fn(async (key: string, contentType: string) => ({
      url: `https://s3.test/${key}?signed=put`,
      headers: { 'Content-Type': contentType },
      expiresInSeconds: 300,
    })),
  };
});

// Mock Stripe — we don't want real API calls in integration tests
vi.mock('../lib/stripe', () => ({
  getStripe: vi.fn(() => ({
    checkout: {
      sessions: { create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/mock' }) },
    },
    billingPortal: {
      sessions: { create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/mock' }) },
    },
    customers: { create: vi.fn().mockResolvedValue({ id: 'cus_mock123' }) },
    subscriptions: { retrieve: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  })),
  getProPriceId: vi.fn(() => 'price_mock'),
}));

import { closePool, query } from '../lib/db/client';
import { signAccessToken } from '../lib/auth/jwt';
import { BillingRepo } from '../repositories/billing-repo';
import { handler as usageHandler } from './billing/usage/handler';
import { handler as createDocHandler } from './documents/create/handler';

const lambdaCtx = { awsRequestId: 'test-billing' } as Context;

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

describe.skipIf(!RUN || !URL_LOCAL)('phase 10 — billing repo', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE usage_counters, subscriptions, document_comments, document_shares, documents, folders, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it('getUsage returns zeroes for a new free org', async () => {
    const { orgId } = await seedOrgUser();
    const usage = await BillingRepo.getUsage(orgId);
    expect(usage.plan).toBe('free');
    expect(usage.docsUploaded).toBe(0);
    expect(usage.aiAnalyses).toBe(0);
    expect(usage.limits.docsPerMonth).toBe(10);
  });

  it('incrementDocs adds to the month counter', async () => {
    const { orgId } = await seedOrgUser();
    await BillingRepo.incrementDocs(orgId);
    await BillingRepo.incrementDocs(orgId);
    const usage = await BillingRepo.getUsage(orgId);
    expect(usage.docsUploaded).toBe(2);
  });

  it('canUploadDoc returns false after hitting the free limit', async () => {
    const { orgId } = await seedOrgUser();
    // Simulate 10 uploads (free limit)
    for (let i = 0; i < 10; i++) await BillingRepo.incrementDocs(orgId);
    const allowed = await BillingRepo.canUploadDoc(orgId);
    expect(allowed).toBe(false);
  });

  it('canUploadDoc returns true under the free limit', async () => {
    const { orgId } = await seedOrgUser();
    await BillingRepo.incrementDocs(orgId, 9);
    const allowed = await BillingRepo.canUploadDoc(orgId);
    expect(allowed).toBe(true);
  });

  it('upsertSubscription creates a subscription row', async () => {
    const { orgId } = await seedOrgUser();
    const sub = await BillingRepo.upsertSubscription({
      orgId,
      stripeSubId: 'sub_test123',
      stripePriceId: 'price_mock',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    expect(sub.stripeSubId).toBe('sub_test123');
    expect(sub.status).toBe('active');
  });
});

describe.skipIf(!RUN || !URL_LOCAL)('phase 10 — document create feature gate', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE usage_counters, subscriptions, document_comments, document_shares, documents, folders, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  it('allows upload when under the free limit', async () => {
    const { orgId, token } = await seedOrgUser();
    const auth = {
      authorization: `Bearer ${token}`,
      'x-org-id': orgId,
      'content-type': 'application/json',
    };

    const res = (await createDocHandler(
      makeEvent({
        headers: auth,
        body: JSON.stringify({
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        }),
      }),
      lambdaCtx,
    )) as { statusCode: number };
    expect(res.statusCode).toBe(201);
  });

  it('returns 429 when free limit is exceeded', async () => {
    const { orgId, token } = await seedOrgUser();
    const auth = {
      authorization: `Bearer ${token}`,
      'x-org-id': orgId,
      'content-type': 'application/json',
    };

    // Exhaust the free plan limit (10 docs)
    await BillingRepo.incrementDocs(orgId, 10);

    const res = (await createDocHandler(
      makeEvent({
        headers: auth,
        body: JSON.stringify({
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        }),
      }),
      lambdaCtx,
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body).error.message).toContain('limit reached');
  });

  it('GET /v1/billing/usage returns current usage', async () => {
    const { orgId, token } = await seedOrgUser();
    const auth = { authorization: `Bearer ${token}`, 'x-org-id': orgId };
    await BillingRepo.incrementDocs(orgId, 3);

    const res = (await usageHandler(makeEvent({ headers: auth }), lambdaCtx)) as {
      statusCode: number;
      body: string;
    };
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plan).toBe('free');
    expect(body.docsUploaded).toBe(3);
  });
});
