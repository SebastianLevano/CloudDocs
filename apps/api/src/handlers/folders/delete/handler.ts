import { NotFoundError } from '../../../lib/errors';
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
import { FoldersRepo } from '../../../repositories/folders-repo';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const id = ctx.event.pathParameters?.id;
          if (!id) throw new NotFoundError('Folder not found.');
          const repo = new FoldersRepo(ctx.orgId);
          const deleted = await repo.delete(id);
          if (!deleted) throw new NotFoundError('Folder not found.');
          return jsonResponse(204, null);
        }),
      ),
    ),
  ),
);
