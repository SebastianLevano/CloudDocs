import { CreateCommentDtoSchema } from '@clouddocs/shared-types';

import { NotFoundError } from '../../../../lib/errors';
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
} from '../../../../middlewares';
import { CommentsRepo } from '../../../../repositories/comments-repo';
import { DocumentsRepo } from '../../../../repositories/documents-repo';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(
      withErrorHandler,
      withJsonBody,
    )(
      withAuth(
        withActiveOrg(
          withValidation(CreateCommentDtoSchema, async (ctx) => {
            const user = ctx.user;
            const orgId = ctx.orgId;
            if (!user || !orgId) throw new Error('Auth/org context missing — middleware bug.');
            const documentId = ctx.event.pathParameters?.id;
            if (!documentId) throw new NotFoundError('Document not found.');

            const docsRepo = new DocumentsRepo(orgId);
            const doc = await docsRepo.findById(documentId);
            if (!doc) throw new NotFoundError('Document not found.');

            const repo = new CommentsRepo(orgId);
            const comment = await repo.create({
              documentId,
              userId: user.id,
              body: ctx.body.body,
              parentId: ctx.body.parentId ?? null,
            });
            return jsonResponse(201, comment);
          }),
        ),
      ),
    ),
  ),
);
