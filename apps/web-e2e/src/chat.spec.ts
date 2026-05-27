import { test, expect, type Page } from '@playwright/test';

/** RAG chat e2e (mocked API): send a question, render the answer + a citation. */

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

async function stubAuthenticatedBoot(page: Page): Promise<void> {
  await page.route('**/v1/auth/refresh', (route) => route.fulfill(json(SESSION)));
}

test('chat: ask a question, get an answer with a citation', async ({ page }) => {
  await stubAuthenticatedBoot(page);
  await page.route('**/v1/chat', (route) =>
    route.fulfill(
      json({
        answer: 'The total due on the invoice is $6000, net 30 days. [1]',
        citations: [
          {
            documentId: DOC_ID,
            filename: 'acme-invoice.pdf',
            chunkIndex: 0,
            snippet: 'Total due 6000 USD',
          },
        ],
      }),
    ),
  );

  await page.goto('/chat');
  await page.getByTestId('chat-input').fill('How much do I owe?');
  await page.getByTestId('chat-send').click();

  await expect(page.getByTestId('chat')).toContainText('total due on the invoice is $6000');
  await expect(page.getByTestId('citations')).toContainText('acme-invoice.pdf');
});
