import type { Comment } from '@clouddocs/shared-types';

import { OrgScopedRepository } from './org-scoped-repository';

export type CommentRow = {
  id: string;
  org_id: string;
  document_id: string;
  user_id: string;
  author_name: string; // joined from users.display_name (or email fallback)
  body: string;
  parent_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    orgId: row.org_id,
    documentId: row.document_id,
    userId: row.user_id,
    authorName: row.author_name,
    body: row.body,
    parentId: row.parent_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class CommentsRepo extends OrgScopedRepository {
  async create(input: {
    documentId: string;
    userId: string;
    body: string;
    parentId?: string | null;
  }): Promise<Comment> {
    const rows = await this.scopedQuery<CommentRow>(
      `WITH inserted AS (
         INSERT INTO document_comments (org_id, document_id, user_id, body, parent_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *
       )
       SELECT i.*, COALESCE(u.display_name, split_part(u.email, '@', 1)) AS author_name
       FROM inserted i
       JOIN users u ON u.id = i.user_id`,
      [input.documentId, input.userId, input.body, input.parentId ?? null],
    );
    const row = rows[0];
    if (!row) throw new Error('Insert into document_comments returned no row.');
    return toComment(row);
  }

  async listForDocument(documentId: string): Promise<Comment[]> {
    const rows = await this.scopedQuery<CommentRow>(
      `SELECT c.*, COALESCE(u.display_name, split_part(u.email, '@', 1)) AS author_name
       FROM document_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.org_id = $1 AND c.document_id = $2
       ORDER BY c.created_at ASC`,
      [documentId],
    );
    return rows.map(toComment);
  }

  async findById(id: string): Promise<CommentRow | undefined> {
    const rows = await this.scopedQuery<CommentRow>(
      `SELECT c.*, COALESCE(u.display_name, split_part(u.email, '@', 1)) AS author_name
       FROM document_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.org_id = $1 AND c.id = $2`,
      [id],
    );
    return rows[0];
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.scopedQuery<{ id: string }>(
      'DELETE FROM document_comments WHERE org_id = $1 AND id = $2 RETURNING id',
      [id],
    );
    return rows.length > 0;
  }
}
