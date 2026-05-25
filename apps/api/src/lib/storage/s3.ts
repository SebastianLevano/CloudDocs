/**
 * S3 access for document uploads/downloads.
 *
 * The browser uploads raw bytes directly to S3 via a presigned PUT URL, so the
 * file never passes through Lambda (plan §2.2 — the big free-tier/latency win).
 * Reads are served the same way with a short-lived presigned GET.
 *
 * The client is created once per warm container (module scope) so concurrent
 * invocations reuse it.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** TTLs kept short — plan §13: 5 min to upload, 15 min to download. */
export const UPLOAD_URL_TTL_SECONDS = 5 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

let client: S3Client | undefined;

function s3(): S3Client {
  client ??= new S3Client({});
  return client;
}

function bucketName(): string {
  const name = process.env['UPLOADS_BUCKET'];
  if (!name) throw new Error('UPLOADS_BUCKET env var is not set.');
  return name;
}

/**
 * Object key for a raw upload. Prefixed per-org and per-document so keys are
 * not enumerable across tenants and map 1:1 to a documents row.
 */
export function buildRawKey(orgId: string, documentId: string, filename: string): string {
  // Strip any path components a client might smuggle in the filename.
  const safeName = filename.replace(/[/\\]/g, '_');
  return `raw-uploads/${orgId}/${documentId}/${safeName}`;
}

export interface PresignedPut {
  url: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/**
 * Presigned PUT URL. The Content-Type is bound into the signature, so the
 * browser MUST send the same `Content-Type` header on the PUT or S3 rejects it
 * — this stops a client from claiming a PDF and uploading something else.
 */
export async function presignUpload(key: string, contentType: string): Promise<PresignedPut> {
  const command = new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3(), command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return {
    url,
    headers: { 'Content-Type': contentType },
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  };
}

/** Presigned GET URL for downloading a stored object. */
export async function presignDownload(
  key: string,
  filename: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  const command = new GetObjectCommand({
    Bucket: bucketName(),
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
  });
  const url = await getSignedUrl(s3(), command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
}
