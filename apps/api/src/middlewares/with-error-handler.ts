/**
 * Converts thrown errors into stable JSON responses. AppError subclasses
 * become structured `{ error: { code, message, correlationId, details? } }`
 * bodies; anything else is logged and surfaced as 500 `internal_error` so we
 * never leak stack traces to clients.
 */
import { AppError } from '../lib/errors';
import { jsonResponse } from './http';
import type { Handler } from './types';

export function withErrorHandler(handler: Handler): Handler {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return jsonResponse(err.statusCode, {
          error: {
            code: err.code,
            message: err.message,
            correlationId: ctx.correlationId,
            ...(err.details !== undefined ? { details: err.details } : {}),
          },
        });
      }
      ctx.log.error({ err }, 'unhandled_error');
      return jsonResponse(500, {
        error: {
          code: 'internal_error',
          message: 'Something went wrong. Reference the correlation id when contacting support.',
          correlationId: ctx.correlationId,
        },
      });
    }
  };
}
