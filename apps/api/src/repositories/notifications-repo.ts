import type { Notification } from '@clouddocs/shared-types';

import { query, queryOne } from '../lib/db/client';

export type NotificationRow = {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  document_id: string | null;
  read_at: Date | null;
  created_at: Date;
};

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    documentId: row.document_id,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

export const NotificationsRepo = {
  async create(input: {
    orgId: string;
    userId: string;
    type: string;
    title: string;
    body?: string;
    documentId?: string | null;
  }): Promise<Notification> {
    const row = await queryOne<NotificationRow>(
      `INSERT INTO notifications (org_id, user_id, type, title, body, document_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.orgId,
        input.userId,
        input.type,
        input.title,
        input.body ?? '',
        input.documentId ?? null,
      ],
    );
    if (!row) throw new Error('Insert into notifications returned no row.');
    return toNotification(row);
  },

  async listForUser(
    userId: string,
    orgId: string,
    limit = 20,
  ): Promise<{ notifications: Notification[]; unreadCount: number }> {
    const rows = await query<NotificationRow>(
      `SELECT * FROM notifications
       WHERE user_id = $1 AND org_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, orgId, limit],
    );
    const unread = await queryOne<{ count: string }>(
      'SELECT count(*) AS count FROM notifications WHERE user_id = $1 AND org_id = $2 AND read_at IS NULL',
      [userId, orgId],
    );
    return {
      notifications: rows.map(toNotification),
      unreadCount: Number(unread?.count ?? 0),
    };
  },

  async markRead(id: string, userId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE notifications SET read_at = now()
       WHERE id = $1 AND user_id = $2 AND read_at IS NULL
       RETURNING id`,
      [id, userId],
    );
    return rows.length > 0;
  },

  async markAllRead(userId: string, orgId: string): Promise<void> {
    await query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND org_id = $2 AND read_at IS NULL`,
      [userId, orgId],
    );
  },

  /** Create a document.ready notification for all org members when a doc finishes. */
  async notifyDocReady(input: {
    orgId: string;
    documentId: string;
    filename: string;
  }): Promise<void> {
    const members = await query<{ user_id: string }>(
      'SELECT user_id FROM memberships WHERE org_id = $1',
      [input.orgId],
    );
    if (!members.length) return;

    const values = members
      .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
      .join(', ');
    const params = members.flatMap((m) => [
      input.orgId,
      m.user_id,
      'document.ready',
      `"${input.filename}" is ready`,
      input.documentId,
    ]);
    await query(
      `INSERT INTO notifications (org_id, user_id, type, title, document_id) VALUES ${values}`,
      params,
    );
  },
};
