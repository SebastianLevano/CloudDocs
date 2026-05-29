import type { FolderListResponse } from '@clouddocs/shared-types';

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
          const repo = new FoldersRepo(ctx.orgId);
          const folders = await repo.list();
          const body: FolderListResponse = { folders };
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
