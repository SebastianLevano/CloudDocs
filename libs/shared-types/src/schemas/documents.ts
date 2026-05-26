import { z } from 'zod';

/**
 * Document lifecycle. Phase 3 only produces `pending_upload` → `uploaded`
 * (and `failed`); the extraction/analysis states are reserved for Phase 4's
 * async pipeline but live here so the type is stable across phases.
 */
export const DocumentStatusSchema = z.enum([
  'pending_upload',
  'uploaded',
  'extracting',
  'extracted',
  'analyzing',
  'ready',
  'failed',
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/** MIME types accepted for upload in the MVP (PDF + DOCX). */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/** Max upload size for the MVP: 10 MB (plan §8 feature #3). */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const UploadMimeSchema = z.enum(ALLOWED_UPLOAD_MIME_TYPES);

export const DocumentSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  uploadedBy: z.uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  status: DocumentStatusSchema,
  error: z.string().nullable(),
  // Populated by the AI pipeline (Phase 4); null until processed.
  category: z.string().nullable(),
  tags: z.array(z.string()),
  language: z.string().nullable(),
  pageCount: z.number().int().nonnegative().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Document = z.infer<typeof DocumentSchema>;

/**
 * Client sends the file's metadata; the server creates a `pending_upload` row
 * and returns a presigned PUT URL the browser uploads to directly (the file
 * bytes never pass through Lambda — plan §2.2).
 */
export const CreateDocumentDtoSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: UploadMimeSchema,
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_SIZE_BYTES, 'File exceeds the 10 MB limit.'),
});
export type CreateDocumentDto = z.infer<typeof CreateDocumentDtoSchema>;

/** Presigned S3 PUT the browser uploads the raw bytes to. */
export const PresignedUploadSchema = z.object({
  url: z.string().url(),
  /** Headers the browser must send with the PUT (e.g. Content-Type). */
  headers: z.record(z.string(), z.string()),
  expiresInSeconds: z.number().int().positive(),
});
export type PresignedUpload = z.infer<typeof PresignedUploadSchema>;

export const CreateDocumentResponseSchema = z.object({
  document: DocumentSchema,
  upload: PresignedUploadSchema,
});
export type CreateDocumentResponse = z.infer<typeof CreateDocumentResponseSchema>;

export const DocumentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});
export type DocumentListQuery = z.infer<typeof DocumentListQuerySchema>;

export const DocumentListResponseSchema = z.object({
  documents: z.array(DocumentSchema),
  /** `id` to pass back as `cursor` for the next page; null when exhausted. */
  nextCursor: z.uuid().nullable(),
});
export type DocumentListResponse = z.infer<typeof DocumentListResponseSchema>;

export const DownloadResponseSchema = z.object({
  url: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
});
export type DownloadResponse = z.infer<typeof DownloadResponseSchema>;
