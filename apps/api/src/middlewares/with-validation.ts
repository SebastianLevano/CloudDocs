/**
 * Validates `ctx.body` against a zod schema. On success the parsed (and
 * therefore typed) value replaces the raw body. On failure we surface a
 * 400 with the zod issues as `details` so the frontend can highlight fields.
 */
import type { ZodType } from 'zod';

import { ValidationError } from '../lib/errors';
import type { Handler, RequestContext } from './types';

export interface ValidatedContext<T> extends RequestContext {
  body: T;
}

export type ValidatedHandler<T> = (ctx: ValidatedContext<T>) => ReturnType<Handler>;

export function withValidation<T>(schema: ZodType<T>, handler: ValidatedHandler<T>): Handler {
  return async (ctx) => {
    const parsed = schema.safeParse(ctx.body);
    if (!parsed.success) {
      throw new ValidationError('Request body failed validation.', parsed.error.issues);
    }
    return handler({ ...ctx, body: parsed.data });
  };
}
