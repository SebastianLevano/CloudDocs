/**
 * Refresh tokens repository. Tokens are stored only as SHA-256 hashes; the
 * plaintext lives in the user's httpOnly cookie. Active = not revoked AND
 * not expired.
 */
import { query, queryOne } from '../lib/db/client';

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  user_agent: string | null;
  ip: string | null;
  created_at: Date;
}

export const RefreshTokensRepo = {
  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<RefreshTokenRow> {
    const rows = await query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.userId, input.tokenHash, input.expiresAt, input.userAgent ?? null, input.ip ?? null],
    );
    const row = rows[0];
    if (!row) throw new Error('Insert into refresh_tokens returned no row.');
    return row;
  },

  async findActiveByHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
    return queryOne<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > now()`,
      [tokenHash],
    );
  },

  async revoke(id: string): Promise<void> {
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [id]);
  },

  async revokeAllForUser(userId: string): Promise<void> {
    await query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
  },
};
