/**
 * POST /v1/billing/checkout
 * Owner-only. Creates a Stripe Checkout Session for the Pro plan and returns
 * the hosted URL to redirect the browser to.
 */
import type { CheckoutResponse } from '@clouddocs/shared-types';

import { ForbiddenError } from '../../../lib/errors';
import { getProPriceId, getStripe } from '../../../lib/stripe';
import {
  compose,
  jsonResponse,
  withActiveOrg,
  withAuth,
  withErrorHandler,
  withRequestLogger,
  withSecrets,
  type LambdaHandler,
} from '../../../middlewares';
import { OrgsRepo } from '../../../repositories/orgs-repo';

const SUCCESS_URL = process.env['FRONTEND_URL']
  ? `${process.env['FRONTEND_URL']}/settings/billing?upgraded=1`
  : 'http://localhost:4200/settings/billing?upgraded=1';

const CANCEL_URL = process.env['FRONTEND_URL']
  ? `${process.env['FRONTEND_URL']}/settings/billing`
  : 'http://localhost:4200/settings/billing';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          if (ctx.role !== 'owner')
            throw new ForbiddenError('Only the org owner can manage billing.');

          const org = await OrgsRepo.findById(ctx.orgId);
          if (!org) throw new ForbiddenError('Organization not found.');

          const stripe = getStripe();

          // Reuse or create a Stripe customer for this org.
          let customerId = org.stripe_customer_id;
          if (!customerId) {
            const customer = await stripe.customers.create({
              name: org.name,
              metadata: { orgId: org.id },
            });
            customerId = customer.id;
            await OrgsRepo.setStripeCustomer(org.id, customerId);
          }

          const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: getProPriceId(), quantity: 1 }],
            success_url: SUCCESS_URL,
            cancel_url: CANCEL_URL,
            metadata: { orgId: org.id },
            subscription_data: { metadata: { orgId: org.id } },
          });

          const body: CheckoutResponse = { url: session.url! };
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
