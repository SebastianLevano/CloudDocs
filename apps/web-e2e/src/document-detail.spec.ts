import { test, expect, type Page } from '@playwright/test';

/**
 * Document detail + polling e2e. The API is mocked at the network layer. The
 * detail endpoint returns `analyzing` on the first poll and `ready` (with a
 * summary + classification) afterwards, so the test verifies the page shows the
 * processing state and then auto-updates without a manual refresh.
 */

const ORG_ID = '33333333-3333-4333-8333-333333333333';
const DOC_ID = '44444444-4444-4444-8444-444444444444';

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

function makeDoc(status: 'analyzing' | 'ready') {
  const ready = status === 'ready';
  return {
    id: DOC_ID,
    orgId: ORG_ID,
    uploadedBy: SESSION.user.id,
    filename: 'invoice.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    status,
    error: null,
    category: ready ? 'Invoice' : null,
    tags: ready ? ['finance', 'q2'] : [],
    language: ready ? 'en' : null,
    pageCount: 2,
    createdAt: '2026-05-26T10:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
  };
}

async function stubAuthenticatedBoot(page: Page): Promise<void> {
  await page.route('**/v1/auth/refresh', (route) => route.fulfill(json(SESSION)));
}

test('detail page shows processing, then auto-updates to the analysis', async ({ page }) => {
  await stubAuthenticatedBoot(page);

  let calls = 0;
  await page.route(`**/v1/documents/${DOC_ID}`, (route) => {
    calls += 1;
    if (calls === 1) {
      return route.fulfill(json({ document: makeDoc('analyzing'), analyses: [] }));
    }
    return route.fulfill(
      json({
        document: makeDoc('ready'),
        analyses: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            documentId: DOC_ID,
            kind: 'summary',
            model: 'gpt-4o-mini',
            promptVersion: 'summary.v1',
            result: {
              summary: 'This invoice bills consulting services.',
              bullets: ['Total due: $1000', 'Net 30 terms'],
              language: 'en',
            },
            createdAt: '2026-05-26T10:01:00.000Z',
          },
        ],
      }),
    );
  });

  await page.goto(`/documents/${DOC_ID}`);

  // First poll: processing.
  await expect(page.getByTestId('processing')).toBeVisible();

  // A later poll flips to ready: summary + classification render, badge updates.
  await expect(page.getByTestId('summary')).toContainText('consulting services', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('detail-status')).toHaveText('ready');
  await expect(page.getByText('Invoice', { exact: true })).toBeVisible();
});
