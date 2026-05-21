/**
 * Initialises the `RequestContext` with a logger child-bound to the Lambda
 * request id (which we surface as `correlationId`). Must be the outermost
 * middleware — every other middleware expects `ctx.log` to exist.
 */
import { randomUUID } from 'node:crypto';

import { createLogger } from '../lib/logger';
import type { Handler, LambdaHandler, RequestContext } from './types';

const HEADER = 'x-correlation-id';

export function withRequestLogger(handler: Handler): LambdaHandler {
  return async (event, context) => {
    const correlationId =
      (event.headers?.[HEADER] as string | undefined) ?? context.awsRequestId ?? randomUUID();
    const log = createLogger({ correlationId, route: event.routeKey });
    const ctx: RequestContext = {
      event,
      lambdaContext: context,
      correlationId,
      log,
    };
    log.info({ method: event.requestContext.http.method, path: event.rawPath }, 'request:start');
    const start = Date.now();
    try {
      const result = await handler(ctx);
      log.info({ ms: Date.now() - start }, 'request:end');
      return result;
    } catch (err) {
      log.error({ ms: Date.now() - start, err }, 'request:error');
      throw err;
    }
  };
}
