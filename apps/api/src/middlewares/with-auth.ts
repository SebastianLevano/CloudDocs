/**
 * Verifies the `Authorization: Bearer <jwt>` header and exposes the decoded
 * user (id, email, memberships) on `ctx.user`. Any handler downstream can
 * assume `ctx.user` is non-null.
 */
import { verifyAccessToken } from '../lib/auth/jwt';
import { UnauthorizedError } from '../lib/errors';
import type { Handler, RequestContext } from './types';

export interface AuthenticatedContext extends RequestContext {
  user: NonNullable<RequestContext['user']>;
}

export type AuthenticatedHandler = (ctx: AuthenticatedContext) => ReturnType<Handler>;

const BEARER = /^Bearer\s+(.+)$/i;

export function withAuth(handler: AuthenticatedHandler): Handler {
  return async (ctx) => {
    const header = ctx.event.headers?.['authorization'] ?? ctx.event.headers?.['Authorization'];
    const match = header ? BEARER.exec(header) : null;
    if (!match || !match[1]) throw new UnauthorizedError('Missing bearer token.');
    let claims;
    try {
      claims = await verifyAccessToken(match[1]);
    } catch {
      throw new UnauthorizedError('Invalid or expired token.');
    }
    return handler({
      ...ctx,
      user: {
        id: claims.sub,
        email: claims.email,
        memberships: claims.memberships,
      },
    });
  };
}
