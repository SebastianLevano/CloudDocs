import { NotFoundError } from '../../../lib/errors';
import { UsersRepo } from '../../../repositories/users-repo';
import { MembershipsRepo } from '../../../repositories/memberships-repo';
import { toMembership, toPublicUser } from '../_shared/issue-session';
import {
  compose,
  jsonResponse,
  withAuth,
  withErrorHandler,
  withRequestLogger,
  type LambdaHandler,
} from '../../../middlewares';
import type { MeResponse } from '@clouddocs/shared-types';

/**
 * Returns the authenticated user + their memberships, fresh from the DB.
 * We don't trust the memberships claim in the access token because membership
 * changes (org joined, role updated) shouldn't have to wait for the access
 * token to expire to take effect on the client.
 */
export const handler: LambdaHandler = withRequestLogger(
  compose(withErrorHandler)(
    withAuth(async (ctx) => {
      const user = await UsersRepo.findById(ctx.user.id);
      if (!user) throw new NotFoundError('User no longer exists.');
      const memberships = await MembershipsRepo.listForUser(user.id);
      const body: MeResponse = {
        user: toPublicUser(user),
        memberships: memberships.map(toMembership),
      };
      return jsonResponse(200, body);
    }),
  ),
);
