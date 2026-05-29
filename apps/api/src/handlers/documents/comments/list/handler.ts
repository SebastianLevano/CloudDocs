import type { CommentListResponse } from '@clouddocs/shared-types';

import { NotFoundError } from '../../../../lib/errors';
import {
  compose,
  jsonResponse,
  withActiveOrg,
  withAuth,
  withErrorHandler,
  withRequestLogger,
  withSecrets,
  type LambdaHandler,
} from '../../../../middlewares';
import { CommentsRepo } from '../../../../repositories/comments-repo';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const documentId = ctx.event.pathParameters?.id;
          if (!documentId) throw new NotFoundError('Document not found.');

          const repo = new CommentsRepo(ctx.orgId);
          const comments = await repo.listForDocument(documentId);
          const body: CommentListResponse = { comments };
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
