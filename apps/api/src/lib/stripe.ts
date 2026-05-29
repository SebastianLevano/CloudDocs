/**
 * Lazy Stripe client — constructed once per warm Lambda container using the
 * STRIPE_SECRET_KEY loaded from Secrets Manager via loadSecretsIntoEnv().
 */
import Stripe from 'stripe';

type StripeClient = InstanceType<typeof Stripe>;

let _stripe: StripeClient | null = null;

export function getStripe(): StripeClient {
  if (!_stripe) {
    const key = process.env['STRIPE_SECRET_KEY'];
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
    _stripe = new Stripe(key, { apiVersion: '2026-05-27.dahlia' });
  }
  return _stripe;
}

/** The Stripe price ID for the Pro plan (set via STRIPE_PRICE_ID env). */
export function getProPriceId(): string {
  const id = process.env['STRIPE_PRICE_ID'];
  if (!id) throw new Error('STRIPE_PRICE_ID is not set.');
  return id;
}
