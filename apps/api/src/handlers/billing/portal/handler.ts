/**
 * POST /v1/billing/portal
 * Owner-only. Creates a Stripe Customer Portal session so the org owner can
 * update payment info or cancel their Pro subscription.
 */
import type { PortalResponse } from '@clouddocs/shared-types';

import { ForbiddenError, NotFoundError } from '../../../lib/errors';
import { getStripe } from '../../../lib/stripe';
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

const RETURN_URL = process.env['FRONTEND_URL']
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
          if (!org.stripe_customer_id)
            throw new NotFoundError('No billing account found. Start a subscription first.');

          const session = await getStripe().billingPortal.sessions.create({
            customer: org.stripe_customer_id,
            return_url: RETURN_URL,
          });

          const body: PortalResponse = { url: session.url };
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
