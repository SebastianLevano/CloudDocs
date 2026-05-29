import { CreateShareDtoSchema, type ShareListResponse } from '@clouddocs/shared-types';

import { NotFoundError } from '../../../lib/errors';
import {
  compose,
  jsonResponse,
  withActiveOrg,
  withAuth,
  withErrorHandler,
  withJsonBody,
  withRequestLogger,
  withSecrets,
  withValidation,
  type LambdaHandler,
} from '../../../middlewares';
import { DocumentsRepo } from '../../../repositories/documents-repo';
import { SharesRepo } from '../../../repositories/shares-repo';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(
      withErrorHandler,
      withJsonBody,
    )(
      withAuth(
        withActiveOrg(
          withValidation(CreateShareDtoSchema, async (ctx) => {
            const user = ctx.user;
            const orgId = ctx.orgId;
            if (!user || !orgId) throw new Error('Auth/org context missing — middleware bug.');
            const documentId = ctx.event.pathParameters?.id;
            if (!documentId) throw new NotFoundError('Document not found.');

            const docsRepo = new DocumentsRepo(orgId);
            const doc = await docsRepo.findById(documentId);
            if (!doc) throw new NotFoundError('Document not found.');

            const sharesRepo = new SharesRepo(orgId);
            await sharesRepo.create({
              documentId,
              createdBy: user.id,
              expiresAt: ctx.body.expiresAt ?? null,
            });

            // Return updated list of shares for this document.
            const shares = await sharesRepo.listForDocument(documentId);
            const body: ShareListResponse = { shares };
            return jsonResponse(201, body);
          }),
        ),
      ),
    ),
  ),
);
