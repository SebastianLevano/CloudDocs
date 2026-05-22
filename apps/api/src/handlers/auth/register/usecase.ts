/**
 * Register a new user, create their default organization, and grant them
 * owner membership. The three writes happen inside a single transaction so
 * a half-created user can never be observed.
 *
 * Conflicts:
 * - 409 conflict if the email is already in use.
 * - 409 conflict if the org slug is taken (globally unique).
 *
 * After the writes succeed, an access token and refresh token are issued
 * — caller wraps the result with the Set-Cookie header and returns 201.
 */
import { ConflictError } from '../../../lib/errors';
import { hashPassword } from '../../../lib/auth/password';
import { withTransaction } from '../../../lib/db/client';
import { OrgsRepo } from '../../../repositories/orgs-repo';
import { UsersRepo } from '../../../repositories/users-repo';
import { MembershipsRepo, type MembershipWithOrg } from '../../../repositories/memberships-repo';
import { issueSession, type IssueSessionResult } from '../_shared/issue-session';
import type { RegisterDto } from '@clouddocs/shared-types';

export interface RegisterContext {
  userAgent?: string;
  ip?: string;
}

export async function registerUseCase(
  input: RegisterDto,
  ctx: RegisterContext = {},
): Promise<IssueSessionResult> {
  // Lowercase the slug client-side already; the schema enforces it. Defensive
  // double-check in case the schema is bypassed in tests.
  const slug = input.orgSlug.toLowerCase();

  const { user, memberships } = await withTransaction(async (tx) => {
    const existingUser = await UsersRepo.findByEmail(input.email);
    if (existingUser) throw new ConflictError('Email is already registered.');

    const existingOrg = await OrgsRepo.findBySlug(slug);
    if (existingOrg) throw new ConflictError('Organization slug is taken.');

    const passwordHash = await hashPassword(input.password);
    const newUser = await UsersRepo.create(tx, {
      email: input.email,
      passwordHash,
      ...(input.displayName ? { displayName: input.displayName } : {}),
    });
    const newOrg = await OrgsRepo.create(tx, { name: input.orgName, slug });
    await MembershipsRepo.create(tx, {
      userId: newUser.id,
      orgId: newOrg.id,
      role: 'owner',
    });

    // Hydrate the membership-with-org shape that downstream code expects,
    // without an extra round trip: we just created the row, the org details
    // are at hand.
    const membershipRow: MembershipWithOrg = {
      id: '', // not exposed; issueSession only reads org_*
      user_id: newUser.id,
      org_id: newOrg.id,
      role: 'owner',
      created_at: newUser.created_at,
      org_name: newOrg.name,
      org_slug: newOrg.slug,
      org_plan: newOrg.plan,
      org_created_at: newOrg.created_at,
    };
    return { user: newUser, memberships: [membershipRow] };
  });

  // issueSession persists the refresh token outside the transaction — that's
  // intentional. If issuance fails the user still exists; they can log in.
  return issueSession({ user, memberships, ...ctx });
}
