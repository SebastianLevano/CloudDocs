import { NotFoundError } from '../../../lib/errors';
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
import { SharesRepo } from '../../../repositories/shares-repo';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const shareId = ctx.event.pathParameters?.shareId;
          if (!shareId) throw new NotFoundError('Share not found.');
          const repo = new SharesRepo(ctx.orgId);
          const deleted = await repo.delete(shareId);
          if (!deleted) throw new NotFoundError('Share not found.');
          return jsonResponse(204, null);
        }),
      ),
    ),
  ),
);
