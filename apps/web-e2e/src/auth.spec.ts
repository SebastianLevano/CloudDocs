import { test, expect, type Page } from '@playwright/test';

/**
 * Auth flow e2e. The API is mocked at the network layer (Playwright route
 * interception) so these tests are deterministic and never touch the live
 * sa-east-1 backend or the Neon dev database. A live smoke test is run
 * manually against the real endpoint.
 */

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
      orgId: '33333333-3333-4333-8333-333333333333',
      role: 'owner',
      organization: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Analytical Engines',
        slug: 'analytical-engines',
        plan: 'free',
        createdAt: '2026-05-25T00:00:00.000Z',
      },
    },
  ],
  tokens: {
    accessToken: 'mock.access.token',
    accessTokenExpiresAt: '2026-05-25T00:15:00.000Z',
  },
};

/** App boot calls refresh() via the APP_INITIALIZER; default it to anonymous. */
async function stubAnonymousBoot(page: Page): Promise<void> {
  await page.route('**/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'unauthorized', message: 'No session.', correlationId: 'test' },
      }),
    }),
  );
}

test('guests are redirected from a protected route to login', async ({ page }) => {
  await stubAnonymousBoot(page);

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('register → dashboard → logout', async ({ page }) => {
  await stubAnonymousBoot(page);
  await page.route('**/v1/auth/register', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SESSION),
    }),
  );
  await page.route('**/v1/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));
  // The dashboard loads stats + recent docs on arrival — stub them so the test
  // doesn't depend on the network.
  await page.route(/\/v1\/documents\/stats/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 0,
        ready: 0,
        processing: 0,
        failed: 0,
        storageBytes: 0,
        analysesThisMonth: 0,
        uploadsPerDay: [],
      }),
    }),
  );
  await page.route(/\/v1\/documents\?/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: [], nextCursor: null }),
    }),
  );

  await page.goto('/auth/register');

  await page.getByTestId('email').fill('ada@example.com');
  await page.getByTestId('displayName').fill('Ada Lovelace');
  await page.getByTestId('password').fill('correct-horse-battery');
  await page.getByTestId('orgName').fill('Analytical Engines');
  // slug auto-derives from org name; assert it then submit
  await expect(page.getByTestId('orgSlug')).toHaveValue('analytical-engines');

  await page.getByTestId('submit').click();

  // Landed on the authenticated dashboard.
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId('dashboard-heading')).toContainText('Ada Lovelace');
  await expect(page.getByTestId('kpis')).toBeVisible();

  // Sign out returns to login.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('login shows a server error message on bad credentials', async ({ page }) => {
  await stubAnonymousBoot(page);
  await page.route('**/v1/auth/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'invalid_credentials',
          message: 'Invalid email or password.',
          correlationId: 'test',
        },
      }),
    }),
  );

  await page.goto('/auth/login');
  await page.getByTestId('email').fill('ada@example.com');
  await page.getByTestId('password').fill('wrong-password');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('form-error')).toHaveText('Invalid email or password.');
  await expect(page).toHaveURL(/\/auth\/login/);
});
