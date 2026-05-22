/**
 * Shared logic for the three endpoints that mint a new session
 * (`register`, `login`, `refresh`):
 *
 *   1. Build an access token from the user's current memberships.
 *   2. Generate + persist a fresh refresh token (stored hashed).
 *   3. Return everything the caller needs to construct the HTTP response,
 *      including the Set-Cookie value for the refresh token.
 *
 * Keeps the three handlers from drifting in subtle ways (e.g. cookie
 * attributes diverging between login and refresh).
 */
import { REFRESH_TTL_SECONDS, generateRefreshToken, signAccessToken } from '../../../lib/auth/jwt';
import { buildRefreshCookie } from '../../../lib/auth/cookies';
import { RefreshTokensRepo } from '../../../repositories/refresh-tokens-repo';
import type { MembershipWithOrg } from '../../../repositories/memberships-repo';
import type { UserRow } from '../../../repositories/users-repo';

import type {
  AuthSession,
  AuthTokens,
  Membership,
  Organization,
  PublicUser,
} from '@clouddocs/shared-types';

export interface IssueSessionInput {
  user: UserRow;
  memberships: MembershipWithOrg[];
  userAgent?: string;
  ip?: string;
}

export interface IssueSessionResult {
  body: AuthSession;
  setCookie: string;
}

export async function issueSession(input: IssueSessionInput): Promise<IssueSessionResult> {
  const { user, memberships } = input;

  const accessToken = await signAccessToken({
    userId: user.id,
    email: user.email,
    memberships: memberships.map((m) => ({ orgId: m.org_id, role: m.role })),
  });

  const refresh = generateRefreshToken();
  await RefreshTokensRepo.create({
    userId: user.id,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
    userAgent: input.userAgent,
    ip: input.ip,
  });

  return {
    body: {
      user: toPublicUser(user),
      memberships: memberships.map(toMembership),
      tokens: {
        accessToken: accessToken.token,
        accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
      } satisfies AuthTokens,
    },
    setCookie: buildRefreshCookie(refresh.token, REFRESH_TTL_SECONDS),
  };
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    emailVerified: row.email_verified,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function toMembership(row: MembershipWithOrg): Membership {
  const org: Organization = {
    id: row.org_id,
    name: row.org_name,
    slug: row.org_slug,
    plan: row.org_plan,
    createdAt: new Date(row.org_created_at).toISOString(),
  };
  return { id: row.id, orgId: row.org_id, role: row.role, organization: org };
}
