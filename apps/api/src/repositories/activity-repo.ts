import type { ActivityLog, ActivityListQuery } from '@clouddocs/shared-types';

import { query } from '../lib/db/client';

type ActivityRow = {
  id: string;
  org_id: string;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
};

function toLog(row: ActivityRow): ActivityLog {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export const ActivityRepo = {
  async log(input: {
    orgId: string;
    userId?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await query(
      `INSERT INTO activity_logs (org_id, user_id, action, target_type, target_id, metadata, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.orgId,
        input.userId ?? null,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.ip ?? null,
        input.userAgent ?? null,
      ],
    );
  },

  async list(
    orgId: string,
    opts: ActivityListQuery,
  ): Promise<{ rows: ActivityLog[]; nextCursor: string | null }> {
    const where = ['org_id = $1'];
    const params: unknown[] = [orgId]; // $1 = orgId
    let p = 1;
    const add = (v: unknown) => {
      params.push(v);
      return `$${++p}`;
    };

    if (opts.action) where.push(`action = ${add(opts.action)}`);
    if (opts.targetType) where.push(`target_type = ${add(opts.targetType)}`);
    if (opts.from) where.push(`created_at >= ${add(opts.from)}`);
    if (opts.to) where.push(`created_at <= ${add(opts.to)}`);
    if (opts.cursor) {
      where.push(
        `(created_at, id) < (SELECT created_at, id FROM activity_logs WHERE id = ${add(opts.cursor)} AND org_id = $1)`,
      );
    }
    const limitP = add(opts.limit + 1);

    const rows = await query<ActivityRow>(
      `SELECT * FROM activity_logs WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ${limitP}`,
      params,
    );

    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    return {
      rows: page.map(toLog),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  },
};
