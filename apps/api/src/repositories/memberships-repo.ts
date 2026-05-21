/**
 * Memberships repository. Memberships are inherently dual-keyed (user_id,
 * org_id); we expose lookup-by-user (used by `/auth/me`) globally, and
 * mutations are gated by an explicit `orgId` arg.
 */
import { query, queryOne, type TxClient } from '../lib/db/client';
import type { Role } from '@clouddocs/shared-types';

export interface MembershipRow {
  id: string;
  user_id: string;
  org_id: string;
  role: Role;
  created_at: Date;
}

export interface MembershipWithOrg extends MembershipRow {
  org_name: string;
  org_slug: string;
  org_plan: 'free' | 'pro';
  org_created_at: Date;
}

export const MembershipsRepo = {
  async listForUser(userId: string): Promise<MembershipWithOrg[]> {
    return query<MembershipWithOrg>(
      `SELECT m.id, m.user_id, m.org_id, m.role, m.created_at,
              o.name AS org_name,
              o.slug AS org_slug,
              o.plan AS org_plan,
              o.created_at AS org_created_at
       FROM memberships m
       JOIN organizations o ON o.id = m.org_id
       WHERE m.user_id = $1
       ORDER BY m.created_at ASC`,
      [userId],
    );
  },

  async findForUserInOrg(userId: string, orgId: string): Promise<MembershipRow | undefined> {
    return queryOne<MembershipRow>('SELECT * FROM memberships WHERE user_id = $1 AND org_id = $2', [
      userId,
      orgId,
    ]);
  },

  async create(
    tx: TxClient,
    input: { userId: string; orgId: string; role: Role },
  ): Promise<MembershipRow> {
    const rows = await tx.query<MembershipRow>(
      `INSERT INTO memberships (user_id, org_id, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.userId, input.orgId, input.role],
    );
    const row = rows[0];
    if (!row) throw new Error('Insert into memberships returned no row.');
    return row;
  },
};
