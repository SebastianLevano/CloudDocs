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
import { NotificationsRepo } from '../../../repositories/notifications-repo';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          await NotificationsRepo.markAllRead(ctx.user.id, ctx.orgId);
          return jsonResponse(204, null);
        }),
      ),
    ),
  ),
);
