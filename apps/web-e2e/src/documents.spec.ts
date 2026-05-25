import { test, expect, type Page } from '@playwright/test';

/**
 * Document upload flow e2e. The API and the S3 PUT are mocked at the network
 * layer, so the test is deterministic and touches neither the live backend nor
 * a real bucket. It verifies the full browser path: pick file → presigned PUT →
 * complete → appears in the list.
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

const DOC_ID = '44444444-4444-4444-8444-444444444444';
const S3_PUT_URL = 'https://s3.example.test/raw-uploads/put-target';

function makeDoc(status: 'pending_upload' | 'uploaded') {
  return {
    id: DOC_ID,
    orgId: ORG_ID,
    uploadedBy: SESSION.user.id,
    filename: 'contract.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 24,
    status,
    error: null,
    createdAt: '2026-05-25T10:00:00.000Z',
    updatedAt: '2026-05-25T10:00:00.000Z',
  };
}

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** Boot authenticated: APP_INITIALIZER's refresh returns a live session. */
async function stubAuthenticatedBoot(page: Page): Promise<void> {
  await page.route('**/v1/auth/refresh', (route) => route.fulfill(json(SESSION)));
}

test('upload a document → it appears in the list', async ({ page }) => {
  await stubAuthenticatedBoot(page);

  let uploaded = false;

  // GET list + POST create share the /v1/documents path; branch on method.
  // `**` after the path so the glob also matches the `?limit=...` query on GET.
  await page.route('**/v1/documents**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(
        json({ documents: uploaded ? [makeDoc('uploaded')] : [], nextCursor: null }),
      );
    }
    // POST create → pending row + presigned PUT
    return route.fulfill(
      json(
        {
          document: makeDoc('pending_upload'),
          upload: {
            url: S3_PUT_URL,
            headers: { 'Content-Type': 'application/pdf' },
            expiresInSeconds: 300,
          },
        },
        201,
      ),
    );
  });

  // Registered after the general route → higher priority for these URLs.
  await page.route('**/v1/documents/*/complete', (route) => {
    uploaded = true;
    return route.fulfill(json(makeDoc('uploaded')));
  });
  await page.route(`${S3_PUT_URL}**`, (route) => route.fulfill({ status: 200, body: '' }));

  await page.goto('/documents');

  // Empty state first.
  await expect(page.getByTestId('empty-state')).toBeVisible();

  // Pick a file via the hidden input.
  await page.getByTestId('file-input').setInputFiles({
    name: 'contract.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake pdf bytes'),
  });

  // The document shows up in the list once upload + complete + refresh finish.
  await expect(page.getByTestId('documents-table')).toBeVisible();
  await expect(page.getByTestId('documents-table')).toContainText('contract.pdf');
  await expect(page.getByTestId('documents-table')).toContainText('uploaded');
});

test('rejects an unsupported file type client-side', async ({ page }) => {
  await stubAuthenticatedBoot(page);
  await page.route('**/v1/documents**', (route) =>
    route.fulfill(json({ documents: [], nextCursor: null })),
  );

  await page.goto('/documents');
  await page.getByTestId('file-input').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fakepng'),
  });

  await expect(page.getByTestId('rejected')).toContainText('photo.png');
  await expect(page.getByTestId('rejected')).toContainText('PDF and DOCX');
});
