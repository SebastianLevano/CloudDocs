import { z } from 'zod';

export const ShareSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  documentId: z.uuid(),
  token: z.string(),
  expiresAt: z.iso.datetime().nullable(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type Share = z.infer<typeof ShareSchema>;

export const CreateShareDtoSchema = z.object({
  /** ISO datetime; omit for no expiry. */
  expiresAt: z.iso.datetime().nullable().optional(),
});
export type CreateShareDto = z.infer<typeof CreateShareDtoSchema>;

/** Returned by the public (unauthenticated) share endpoint. */
export const PublicShareResponseSchema = z.object({
  documentId: z.uuid(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  /** Short-lived presigned GET URL for the file. */
  downloadUrl: z.string().url(),
  expiresAt: z.iso.datetime().nullable(),
});
export type PublicShareResponse = z.infer<typeof PublicShareResponseSchema>;

export const ShareListResponseSchema = z.object({
  shares: z.array(ShareSchema),
});
export type ShareListResponse = z.infer<typeof ShareListResponseSchema>;
