/**
 * POST /v1/billing/webhook
 * No JWT. Stripe sends events here after each billing lifecycle change.
 * Security: signature verified with STRIPE_WEBHOOK_SECRET before any DB write.
 */
import { createLogger } from '../../../lib/logger';
import { loadSecretsIntoEnv } from '../../../lib/secrets';
import { AppError } from '../../../lib/errors';
import { getStripe } from '../../../lib/stripe';
import { BillingRepo } from '../../../repositories/billing-repo';
import { OrgsRepo } from '../../../repositories/orgs-repo';
import type { LambdaHandler } from '../../../middlewares';

const log = createLogger({ handler: 'billing-webhook' });

// Minimal inline shapes for the Stripe event data we access — avoids the
// sub-namespace import issues with Stripe v22's type structure.
interface StripeSubscriptionData {
  id: string;
  status: string;
  current_period_end: number;
  items: { data: Array<{ price: { id: string } }> };
  metadata: Record<string, string | undefined>;
}

interface StripeCheckoutSessionData {
  subscription: string | null;
  metadata: Record<string, string | undefined>;
}

async function handleCheckoutCompleted(session: StripeCheckoutSessionData): Promise<void> {
  const orgId = session.metadata?.orgId;
  if (!orgId || !session.subscription) return;

  const sub = (await getStripe().subscriptions.retrieve(
    session.subscription,
  )) as unknown as StripeSubscriptionData;
  const priceId = sub.items.data[0]?.price.id ?? '';

  await BillingRepo.upsertSubscription({
    orgId,
    stripeSubId: sub.id,
    stripePriceId: priceId,
    status: sub.status as 'active' | 'past_due' | 'canceled' | 'trialing',
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
  });
  await OrgsRepo.setPlan(orgId, 'pro');
}

async function handleSubscriptionChange(sub: StripeSubscriptionData): Promise<void> {
  const orgId = sub.metadata?.orgId;
  if (!orgId) return;

  const priceId = sub.items.data[0]?.price.id ?? '';
  const status = sub.status as 'active' | 'past_due' | 'canceled' | 'trialing';

  await BillingRepo.upsertSubscription({
    orgId,
    stripeSubId: sub.id,
    stripePriceId: priceId,
    status,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
  });

  if (status === 'canceled') {
    await OrgsRepo.setPlan(orgId, 'free');
  } else if (status === 'active') {
    await OrgsRepo.setPlan(orgId, 'pro');
  }
}

export const handler: LambdaHandler = async (event) => {
  await loadSecretsIntoEnv();

  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    log.error('STRIPE_WEBHOOK_SECRET not configured');
    return { statusCode: 500, body: 'Webhook secret not configured.' };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '');

  const sig = event.headers?.['stripe-signature'] ?? event.headers?.['Stripe-Signature'];
  if (!sig) return { statusCode: 400, body: 'Missing Stripe-Signature header.' };

  let stripeEvent: { type: string; data: { object: Record<string, unknown> } };
  try {
    stripeEvent = getStripe().webhooks.constructEvent(
      rawBody,
      sig,
      webhookSecret,
    ) as unknown as typeof stripeEvent;
  } catch (err) {
    log.warn({ err }, 'Stripe webhook signature verification failed');
    return { statusCode: 400, body: 'Signature verification failed.' };
  }

  try {
    const obj = stripeEvent.data.object;
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(obj as unknown as StripeCheckoutSessionData);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(obj as unknown as StripeSubscriptionData);
        break;
      default:
        break;
    }
  } catch (err) {
    const msg = err instanceof AppError ? err.message : 'Internal error handling webhook.';
    log.error({ err, eventType: stripeEvent.type }, msg);
    return { statusCode: 500, body: msg };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
