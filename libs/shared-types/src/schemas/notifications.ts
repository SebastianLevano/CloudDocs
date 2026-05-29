import { z } from 'zod';

export const NotificationSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  userId: z.uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  documentId: z.uuid().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationListResponseSchema = z.object({
  notifications: z.array(NotificationSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;
