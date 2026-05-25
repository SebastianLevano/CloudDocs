import { buildClearedRefreshCookie, readRefreshCookie } from '../../../lib/auth/cookies';
import { hashRefreshToken } from '../../../lib/auth/jwt';
import { RefreshTokensRepo } from '../../../repositories/refresh-tokens-repo';
import {
  compose,
  emptyResponse,
  withCsrf,
  withErrorHandler,
  withRequestLogger,
  withSecrets,
  type LambdaHandler,
} from '../../../middlewares';

/**
 * Logout is intentionally idempotent: even if the cookie is missing or the
 * token is already revoked we return 204 and clear the cookie, so the
 * client never has to handle a logout-specific error path.
 */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(
      withErrorHandler,
      withCsrf,
    )(async (ctx) => {
      const cookieToken = readRefreshCookie(ctx.event.cookies);
      if (cookieToken) {
        const row = await RefreshTokensRepo.findActiveByHash(hashRefreshToken(cookieToken));
        if (row) await RefreshTokensRepo.revoke(row.id);
      }
      return emptyResponse(204, { cookies: [buildClearedRefreshCookie()] });
    }),
  ),
);
