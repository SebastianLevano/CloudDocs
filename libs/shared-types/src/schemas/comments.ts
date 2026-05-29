import { z } from 'zod';

export const CommentSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  documentId: z.uuid(),
  userId: z.uuid(),
  /** Display name of the commenter (joined at query time). */
  authorName: z.string(),
  body: z.string().min(1).max(2000),
  parentId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Comment = z.infer<typeof CommentSchema>;

export const CreateCommentDtoSchema = z.object({
  body: z.string().min(1).max(2000),
  parentId: z.uuid().nullable().optional(),
});
export type CreateCommentDto = z.infer<typeof CreateCommentDtoSchema>;

export const CommentListResponseSchema = z.object({
  comments: z.array(CommentSchema),
});
export type CommentListResponse = z.infer<typeof CommentListResponseSchema>;
