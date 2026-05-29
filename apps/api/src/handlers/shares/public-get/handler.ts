import type { PublicShareResponse } from '@clouddocs/shared-types';

import { NotFoundError } from '../../../lib/errors';
import { presignDownload } from '../../../lib/storage/s3';
import {
  jsonResponse,
  withErrorHandler,
  withRequestLogger,
  withSecrets,
} from '../../../middlewares';
import { compose } from '../../../middlewares';
import type { LambdaHandler } from '../../../middlewares';
import { DocumentsRepo } from '../../../repositories/documents-repo';
import { findShareByToken } from '../../../repositories/shares-repo';

/**
 * GET /v1/public/shares/{token} — unauthenticated. Returns document metadata
 * and a short-lived presigned download URL. Anyone with the token can download.
 */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(async (ctx) => {
      const token = ctx.event.pathParameters?.token;
      if (!token) throw new NotFoundError('Share not found.');

      const share = await findShareByToken(token);
      if (!share) throw new NotFoundError('Share link not found or has expired.');

      // DocumentsRepo needs an orgId — use the one from the share record.
      const docsRepo = new DocumentsRepo(share.org_id);
      const doc = await docsRepo.findById(share.document_id);
      if (!doc) throw new NotFoundError('Document not found.');

      const { url } = await presignDownload(doc.s3_key, doc.filename);

      const body: PublicShareResponse = {
        documentId: doc.id,
        filename: doc.filename,
        mimeType: doc.mime_type,
        sizeBytes: Number(doc.size_bytes),
        downloadUrl: url,
        expiresAt: share.expires_at ? share.expires_at.toISOString() : null,
      };
      return jsonResponse(200, body);
    }),
  ),
);
