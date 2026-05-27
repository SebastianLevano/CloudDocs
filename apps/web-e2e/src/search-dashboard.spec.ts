import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 5 e2e (mocked API): search filters the documents list, and the
 * dashboard renders KPIs + the uploads sparkline.
 */

const ORG_ID = '33333333-3333-4333-8333-333333333333';

const SESSION = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    avatarUrl: null,
    emailVerified: false,
    createdAt: '2026-05-25T00:00:00.000Z',
  },
  memberships: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      orgId: ORG_ID,
      role: 'owner',
      organization: {
        id: ORG_ID,
        name: 'Analytical Engines',
        slug: 'analytical-engines',
        plan: 'free',
        createdAt: '2026-05-25T00:00:00.000Z',
      },
    },
  ],
  tokens: { accessToken: 'mock.access.token', accessTokenExpiresAt: '2026-05-25T00:15:00.000Z' },
};

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

function doc(id: string, filename: string, status = 'ready', category: string | null = null) {
  return {
    id,
    orgId: ORG_ID,
    uploadedBy: SESSION.user.id,
    filename,
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    status,
    error: null,
    category,
    tags: [],
    language: 'en',
    pageCount: 1,
    createdAt: '2026-05-26T10:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
  };
}

const INVOICE = doc('44444444-4444-4444-8444-444444444444', 'acme-invoice.pdf', 'ready', 'Invoice');
const REPORT = doc('55555555-5555-4555-8555-555555555555', 'annual-report.pdf', 'ready', 'Report');

async function stubAuthenticatedBoot(page: Page): Promise<void> {
  await page.route('**/v1/auth/refresh', (route) => route.fulfill(json(SESSION)));
}

test('search filters the document list by query', async ({ page }) => {
  await stubAuthenticatedBoot(page);

  await page.route(/\/v1\/documents\/stats/, (route) =>
    route.fulfill(
      json({
        total: 2,
        ready: 2,
        processing: 0,
        failed: 0,
        storageBytes: 2048,
        analysesThisMonth: 4,
        uploadsPerDay: [],
      }),
    ),
  );
  // List endpoint (always has a ?limit= query) honours the `q` param in the mock.
  await page.route(/\/v1\/documents\?/, (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const all = [INVOICE, REPORT];
    const documents = q
      ? all.filter((d) => d.filename.includes(q) || (d.category ?? '').toLowerCase().includes(q))
      : all;
    return route.fulfill(json({ documents, nextCursor: null }));
  });

  await page.goto('/documents');

  // Both documents listed initially.
  await expect(page.getByTestId('documents-table')).toContainText('acme-invoice.pdf');
  await expect(page.getByTestId('documents-table')).toContainText('annual-report.pdf');

  // Search narrows to the invoice (debounced).
  await page.getByTestId('search').fill('invoice');
  await expect(page.getByTestId('documents-table')).toContainText('acme-invoice.pdf');
  await expect(page.getByTestId('documents-table')).not.toContainText('annual-report.pdf');
});

test('dashboard renders KPIs, sparkline and recent documents', async ({ page }) => {
  await stubAuthenticatedBoot(page);

  await page.route(/\/v1\/documents\/stats/, (route) =>
    route.fulfill(
      json({
        total: 7,
        ready: 5,
        processing: 1,
        failed: 1,
        storageBytes: 5 * 1024 * 1024,
        analysesThisMonth: 10,
        uploadsPerDay: Array.from({ length: 14 }, (_, i) => ({
          date: `2026-05-${String(13 + i).padStart(2, '0')}`,
          count: i % 3,
        })),
      }),
    ),
  );
  await page.route(/\/v1\/documents\?/, (route) =>
    route.fulfill(json({ documents: [INVOICE, REPORT], nextCursor: null })),
  );

  await page.goto('/dashboard');

  await expect(page.getByTestId('kpis')).toContainText('Documents');
  await expect(page.getByTestId('kpis')).toContainText('7'); // total
  await expect(page.getByTestId('kpis')).toContainText('5.0 MB'); // storage
  await expect(page.getByTestId('sparkline')).toBeVisible();
  await expect(page.getByTestId('recent')).toContainText('acme-invoice.pdf');
});
