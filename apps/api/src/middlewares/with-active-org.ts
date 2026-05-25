/**
 * Resolves the *active* org for routes that aren't nested under `/orgs/:orgId`
 * (e.g. `/v1/documents`). Unlike {@link withOrgScope} which reads a path param,
 * this reads the `X-Org-Id` request header — the SPA sends its currently
 * selected org. Membership is always verified against the access token, so a
 * client can't act on an org it doesn't belong to.
 *
 * Fallback: if the header is absent and the user belongs to exactly one org, we
 * use it (covers the common single-org case without forcing the header). With
 * multiple memberships and no header we 400, since the target is ambiguous.
 */
import { ForbiddenError, ValidationError } from '../lib/errors';
import type { AuthenticatedContext, AuthenticatedHandler } from './with-auth';
import type { OrgScopedContext, OrgScopedHandler } from './with-org-scope';

export const ORG_HEADER = 'x-org-id';

function readOrgHeader(ctx: AuthenticatedContext): string | undefined {
  return ctx.event.headers?.[ORG_HEADER] ?? ctx.event.headers?.['X-Org-Id'];
}

export function withActiveOrg(handler: OrgScopedHandler): AuthenticatedHandler {
  return async (ctx) => {
    const requested = readOrgHeader(ctx)?.trim();
    const { memberships } = ctx.user;

    let orgId: string;
    if (requested) {
      orgId = requested;
    } else if (memberships.length === 1 && memberships[0]) {
      orgId = memberships[0].orgId;
    } else {
      throw new ValidationError('Missing X-Org-Id header (multiple organizations).');
    }

    const membership = memberships.find((m) => m.orgId === orgId);
    if (!membership) throw new ForbiddenError('You are not a member of this organization.');

    const scoped: OrgScopedContext = { ...ctx, orgId, role: membership.role };
    return handler(scoped);
  };
}
