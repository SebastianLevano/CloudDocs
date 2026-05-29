import { z } from 'zod';

export const ActivityLogSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  userId: z.uuid().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type ActivityLog = z.infer<typeof ActivityLogSchema>;

export const ActivityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
  action: z.string().min(1).optional(),
  targetType: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
export type ActivityListQuery = z.infer<typeof ActivityListQuerySchema>;

export const ActivityListResponseSchema = z.object({
  logs: z.array(ActivityLogSchema),
  nextCursor: z.uuid().nullable(),
});
export type ActivityListResponse = z.infer<typeof ActivityListResponseSchema>;
