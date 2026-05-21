/**
 * Parses the request body as JSON and stashes it on the context. Empty bodies
 * are allowed; downstream middlewares (typically `withValidation`) enforce
 * shape. Malformed JSON is rejected with 400 so the handler never sees junk.
 */
import { ValidationError } from '../lib/errors';
import type { Handler } from './types';

export function withJsonBody(handler: Handler): Handler {
  return async (ctx) => {
    const raw = ctx.event.body;
    if (!raw) {
      ctx.body = undefined;
      return handler(ctx);
    }
    const text = ctx.event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
    try {
      ctx.body = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      throw new ValidationError('Request body is not valid JSON.');
    }
    return handler(ctx);
  };
}
