/**
 * Resolves the org context for a route. Reads the `orgId` path parameter,
 * verifies the authenticated user holds a membership in that org, and
 * populates `ctx.orgId` + `ctx.role`. Pair with {@link withRole} to gate by
 * permission level.
 *
 * Cross-tenant leak prevention: handlers downstream that touch
 * org-scoped data MUST construct their repos with `ctx.orgId`, not with an
 * id derived from the request body.
 */
import { ForbiddenError, NotFoundError } from '../lib/errors';
import type { AuthenticatedContext, AuthenticatedHandler } from './with-auth';
import type { Role } from '@clouddocs/shared-types';

export interface OrgScopedContext extends AuthenticatedContext {
  orgId: string;
  role: Role;
}

export type OrgScopedHandler = (ctx: OrgScopedContext) => ReturnType<AuthenticatedHandler>;

export function withOrgScope(handler: OrgScopedHandler): AuthenticatedHandler {
  return async (ctx) => {
    const orgId = ctx.event.pathParameters?.['orgId'];
    if (!orgId) throw new NotFoundError('Org id missing from path.');
    const membership = ctx.user.memberships.find((m) => m.orgId === orgId);
    if (!membership) throw new ForbiddenError('You are not a member of this organization.');
    return handler({ ...ctx, orgId, role: membership.role });
  };
}

export function withRole(allowed: readonly Role[], handler: OrgScopedHandler): OrgScopedHandler {
  const set = new Set(allowed);
  return async (ctx) => {
    if (!set.has(ctx.role)) {
      throw new ForbiddenError(`Role '${ctx.role}' is not allowed for this action.`);
    }
    return handler(ctx);
  };
}
