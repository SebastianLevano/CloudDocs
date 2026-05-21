/**
 * Users repository. Not org-scoped (users exist outside any single org).
 * Membership-related queries live in {@link MembershipsRepo}.
 */
import { queryOne, type TxClient } from '../lib/db/client';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  avatar_url: string | null;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export const UsersRepo = {
  async findByEmail(email: string): Promise<UserRow | undefined> {
    return queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  },

  async findById(id: string): Promise<UserRow | undefined> {
    return queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  },

  async create(
    tx: TxClient,
    input: { email: string; passwordHash: string; displayName?: string },
  ): Promise<UserRow> {
    const rows = await tx.query<UserRow>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.email, input.passwordHash, input.displayName ?? null],
    );
    const row = rows[0];
    if (!row) throw new Error('Insert into users returned no row.');
    return row;
  },
};
