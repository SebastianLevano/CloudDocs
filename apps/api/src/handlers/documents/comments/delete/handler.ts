import { ForbiddenError, NotFoundError } from '../../../../lib/errors';
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
          const { id: documentId, commentId } = ctx.event.pathParameters ?? {};
          if (!documentId || !commentId) throw new NotFoundError('Comment not found.');

          const repo = new CommentsRepo(ctx.orgId);
          const comment = await repo.findById(commentId);
          if (!comment) throw new NotFoundError('Comment not found.');
          if (comment.user_id !== ctx.user.id)
            throw new ForbiddenError('You can only delete your own comments.');

          await repo.delete(commentId);
          return jsonResponse(204, null);
        }),
      ),
    ),
  ),
);
