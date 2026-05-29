import type { NotificationListResponse } from '@clouddocs/shared-types';

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
          const result = await NotificationsRepo.listForUser(ctx.user.id, ctx.orgId);
          const body: NotificationListResponse = result;
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
