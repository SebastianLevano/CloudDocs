import { readRefreshCookie } from '../../../lib/auth/cookies';
import {
  compose,
  jsonResponse,
  withErrorHandler,
  withRequestLogger,
  withSecrets,
  type LambdaHandler,
} from '../../../middlewares';
import { refreshUseCase } from './usecase';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(async (ctx) => {
      const cookieToken = readRefreshCookie(ctx.event.cookies);
      const result = await refreshUseCase(cookieToken, {
        userAgent: ctx.event.headers?.['user-agent'],
        ip: ctx.event.requestContext.http.sourceIp,
      });
      return jsonResponse(200, result.body, { cookies: [result.setCookie] });
    }),
  ),
);
