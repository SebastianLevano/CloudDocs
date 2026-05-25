import type { DownloadResponse } from '@clouddocs/shared-types';

import { NotFoundError, ValidationError } from '../../../lib/errors';
import { DocumentsRepo } from '../../../repositories/documents-repo';
import { presignDownload } from '../../../lib/storage/s3';
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

/** GET /v1/documents/{id}/download — short-lived presigned GET URL for the object. */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const id = ctx.event.pathParameters?.['id'];
          if (!id) throw new ValidationError('Document id missing from path.');

          const repo = new DocumentsRepo(ctx.orgId);
          const doc = await repo.findById(id);
          if (!doc) throw new NotFoundError('Document not found.');
          if (doc.status === 'pending_upload') {
            throw new ValidationError('Document has not finished uploading.');
          }

          const body: DownloadResponse = await presignDownload(doc.s3_key, doc.filename);
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
