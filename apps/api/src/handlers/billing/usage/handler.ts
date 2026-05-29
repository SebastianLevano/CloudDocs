/**
 * GET /v1/billing/usage
 * Returns the authenticated org's current month usage counters and plan limits.
 */
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
import { BillingRepo } from '../../../repositories/billing-repo';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const usage = await BillingRepo.getUsage(ctx.orgId);
          return jsonResponse(200, usage);
        }),
      ),
    ),
  ),
);
