/**
 * Verify credentials and mint a new session. Returns the same shape as
 * register (`AuthSession` + Set-Cookie). Failed verification is a 401
 * with an opaque message — we deliberately don't differentiate "wrong
 * email" vs "wrong password" so attackers can't enumerate accounts.
 */
import { UnauthorizedError } from '../../../lib/errors';
import { verifyPassword } from '../../../lib/auth/password';
import { UsersRepo } from '../../../repositories/users-repo';
import { MembershipsRepo } from '../../../repositories/memberships-repo';
import { issueSession, type IssueSessionResult } from '../_shared/issue-session';
import type { LoginDto } from '@clouddocs/shared-types';

const INVALID = 'Invalid email or password.';

export interface LoginContext {
  userAgent?: string;
  ip?: string;
}

export async function loginUseCase(
  input: LoginDto,
  ctx: LoginContext = {},
): Promise<IssueSessionResult> {
  const user = await UsersRepo.findByEmail(input.email);
  if (!user) throw new UnauthorizedError(INVALID);

  const ok = await verifyPassword(user.password_hash, input.password);
  if (!ok) throw new UnauthorizedError(INVALID);

  const memberships = await MembershipsRepo.listForUser(user.id);
  return issueSession({ user, memberships, ...ctx });
}
