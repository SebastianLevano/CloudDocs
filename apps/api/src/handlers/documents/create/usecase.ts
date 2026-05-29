/**
 * Create-document use case: register a `pending_upload` row and hand back a
 * presigned PUT URL the browser uploads the bytes to directly. The document id
 * is generated here so it can be embedded in the S3 key before the row exists.
 */
import { randomUUID } from 'node:crypto';

import type { CreateDocumentDto, CreateDocumentResponse } from '@clouddocs/shared-types';

import { AppError } from '../../../lib/errors';
import { buildRawKey, presignUpload } from '../../../lib/storage/s3';
import { BillingRepo } from '../../../repositories/billing-repo';
import { DocumentsRepo, toDocument } from '../../../repositories/documents-repo';

export async function createDocumentUseCase(
  orgId: string,
  userId: string,
  dto: CreateDocumentDto,
): Promise<CreateDocumentResponse> {
  // Feature gate: enforce monthly doc upload limit based on the org's plan.
  const allowed = await BillingRepo.canUploadDoc(orgId);
  if (!allowed) {
    throw new AppError(
      'PLAN_LIMIT_EXCEEDED',
      'Monthly document limit reached. Upgrade to Pro for more uploads.',
      429,
    );
  }

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
    folderId: dto.folderId ?? null,
  });

  // Track usage: increment docs count and storage for this month.
  await Promise.all([
    BillingRepo.incrementDocs(orgId),
    BillingRepo.adjustStorage(orgId, dto.sizeBytes),
  ]);

  const upload = await presignUpload(s3Key, dto.mimeType);
  return { document: toDocument(row), upload };
}
