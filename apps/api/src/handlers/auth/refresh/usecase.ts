/**
 * Rotate a refresh token and mint a fresh access token. The old refresh
 * token is revoked atomically so a replay of the old cookie value fails on
 * the next call.
 */
import { UnauthorizedError } from '../../../lib/errors';
import { hashRefreshToken } from '../../../lib/auth/jwt';
import { RefreshTokensRepo } from '../../../repositories/refresh-tokens-repo';
import { UsersRepo } from '../../../repositories/users-repo';
import { MembershipsRepo } from '../../../repositories/memberships-repo';
import { issueSession, type IssueSessionResult } from '../_shared/issue-session';

const INVALID = 'Refresh token is invalid or expired.';

export interface RefreshContext {
  userAgent?: string;
  ip?: string;
}

export async function refreshUseCase(
  cookieToken: string | undefined,
  ctx: RefreshContext = {},
): Promise<IssueSessionResult> {
  if (!cookieToken) throw new UnauthorizedError(INVALID);

  const row = await RefreshTokensRepo.findActiveByHash(hashRefreshToken(cookieToken));
  if (!row) throw new UnauthorizedError(INVALID);

  const user = await UsersRepo.findById(row.user_id);
  if (!user) throw new UnauthorizedError(INVALID);

  await RefreshTokensRepo.revoke(row.id);

  const memberships = await MembershipsRepo.listForUser(user.id);
  return issueSession({ user, memberships, ...ctx });
}
