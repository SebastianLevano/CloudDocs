/**
 * Create-document use case: register a `pending_upload` row and hand back a
 * presigned PUT URL the browser uploads the bytes to directly. The document id
 * is generated here so it can be embedded in the S3 key before the row exists.
 */
import { randomUUID } from 'node:crypto';

import type { CreateDocumentDto, CreateDocumentResponse } from '@clouddocs/shared-types';

import { DocumentsRepo, toDocument } from '../../../repositories/documents-repo';
import { buildRawKey, presignUpload } from '../../../lib/storage/s3';

export async function createDocumentUseCase(
  orgId: string,
  userId: string,
  dto: CreateDocumentDto,
): Promise<CreateDocumentResponse> {
  const id = randomUUID();
  const s3Key = buildRawKey(orgId, id, dto.filename);

  const repo = new DocumentsRepo(orgId);
  const row = await repo.create({
    id,
    uploadedBy: userId,
    filename: dto.filename,
    mimeType: dto.mimeType,
    sizeBytes: dto.sizeBytes,
    s3Key,
  });

  const upload = await presignUpload(s3Key, dto.mimeType);
  return { document: toDocument(row), upload };
}
