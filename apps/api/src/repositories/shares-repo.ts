import type { Share } from '@clouddocs/shared-types';

import { OrgScopedRepository } from './org-scoped-repository';

export type ShareRow = {
  id: string;
  org_id: string;
  document_id: string;
  token: string;
  expires_at: Date | null;
  created_by: string;
  created_at: Date;
};

function toShare(row: ShareRow): Share {
  return {
    id: row.id,
    orgId: row.org_id,
    documentId: row.document_id,
    token: row.token,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export class SharesRepo extends OrgScopedRepository {
  async create(input: {
    documentId: string;
    createdBy: string;
    expiresAt?: string | null;
  }): Promise<Share> {
    const rows = await this.scopedQuery<ShareRow>(
      `INSERT INTO document_shares (org_id, document_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.documentId, input.createdBy, input.expiresAt ?? null],
    );
    const row = rows[0];
    if (!row) throw new Error('Insert into document_shares returned no row.');
    return toShare(row);
  }

  async listForDocument(documentId: string): Promise<Share[]> {
    const rows = await this.scopedQuery<ShareRow>(
      `SELECT * FROM document_shares
       WHERE org_id = $1 AND document_id = $2
       ORDER BY created_at DESC`,
      [documentId],
    );
    return rows.map(toShare);
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.scopedQuery<{ id: string }>(
      'DELETE FROM document_shares WHERE org_id = $1 AND id = $2 RETURNING id',
      [id],
    );
    return rows.length > 0;
  }
}

/**
 * Look up a share by its public token (no org scope — token is globally unique).
 * Returns null if not found or if the share has expired.
 */
export async function findShareByToken(token: string): Promise<ShareRow | null> {
  const { query } = await import('../lib/db/client');
  const rows = await query<ShareRow>(
    `SELECT * FROM document_shares
     WHERE token = $1
       AND (expires_at IS NULL OR expires_at > now())`,
    [token],
  );
  return rows[0] ?? null;
}
