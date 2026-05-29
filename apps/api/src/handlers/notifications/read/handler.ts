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
import { NotificationsRepo } from '../../../repositories/notifications-repo';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const id = ctx.event.pathParameters?.id;
          if (!id) throw new NotFoundError('Notification not found.');
          const marked = await NotificationsRepo.markRead(id, ctx.user.id);
          if (!marked) throw new NotFoundError('Notification not found or already read.');
          return jsonResponse(204, null);
        }),
      ),
    ),
  ),
);
