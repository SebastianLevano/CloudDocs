import { CreateFolderDtoSchema } from '@clouddocs/shared-types';

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
          withValidation(CreateFolderDtoSchema, async (ctx) => {
            const user = ctx.user;
            const orgId = ctx.orgId;
            if (!user || !orgId) throw new Error('Auth/org context missing — middleware bug.');
            const repo = new FoldersRepo(orgId);
            const folder = await repo.create({
              name: ctx.body.name,
              parentId: ctx.body.parentId ?? null,
              createdBy: user.id,
            });
            return jsonResponse(201, folder);
          }),
        ),
      ),
    ),
  ),
);
