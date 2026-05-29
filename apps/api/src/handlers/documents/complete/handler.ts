import type { Document } from '@clouddocs/shared-types';

import { NotFoundError, ValidationError } from '../../../lib/errors';
import { ActivityRepo } from '../../../repositories/activity-repo';
import { DocumentsRepo, toDocument } from '../../../repositories/documents-repo';
import {
  compose,
  jsonResponse,
  withActiveOrg,
  withAuth,
  withErrorHandler,
  withRequestLogger,
  withSecrets,
  type LambdaHandler,
} from '../../../middlewares';

/**
 * POST /v1/documents/{id}/complete — the browser calls this after a successful
 * S3 PUT to flip the document from `pending_upload` to `uploaded`.
 */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const id = ctx.event.pathParameters?.['id'];
          if (!id) throw new ValidationError('Document id missing from path.');

          const repo = new DocumentsRepo(ctx.orgId);
          const existing = await repo.findById(id);
          if (!existing) throw new NotFoundError('Document not found.');
          if (existing.status !== 'pending_upload') {
            throw new ValidationError(`Document is already '${existing.status}'.`);
          }

          const updated = await repo.setStatus(id, 'uploaded');
          if (!updated) throw new NotFoundError('Document not found.');

          // Best-effort activity log — don't fail the upload if logging fails.
          ActivityRepo.log({
            orgId: ctx.orgId,
            userId: ctx.user?.id,
            action: 'document.uploaded',
            targetType: 'document',
            targetId: id,
            metadata: { filename: existing.filename },
          }).catch(() => undefined);

          const body: Document = toDocument(updated);
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
