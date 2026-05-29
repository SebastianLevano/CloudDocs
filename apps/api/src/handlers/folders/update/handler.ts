import { UpdateFolderDtoSchema } from '@clouddocs/shared-types';

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
import { FoldersRepo } from '../../../repositories/folders-repo';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(
      withErrorHandler,
      withJsonBody,
    )(
      withAuth(
        withActiveOrg(
          withValidation(UpdateFolderDtoSchema, async (ctx) => {
            const orgId = ctx.orgId;
            if (!orgId) throw new Error('Auth/org context missing — middleware bug.');
            const id = ctx.event.pathParameters?.id;
            if (!id) throw new NotFoundError('Folder not found.');
            const repo = new FoldersRepo(orgId);
            const folder = await repo.update(id, ctx.body);
            if (!folder) throw new NotFoundError('Folder not found.');
            return jsonResponse(200, folder);
          }),
        ),
      ),
    ),
  ),
);
