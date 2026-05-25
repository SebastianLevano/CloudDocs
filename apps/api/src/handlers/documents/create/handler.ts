import { CreateDocumentDtoSchema } from '@clouddocs/shared-types';

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
import { createDocumentUseCase } from './usecase';

/**
 * POST /v1/documents — register a document and return a presigned PUT URL.
 * Auth → active org (membership-checked) → validated body.
 */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(
      withErrorHandler,
      withJsonBody,
    )(
      withAuth(
        withActiveOrg(
          withValidation(CreateDocumentDtoSchema, async (ctx) => {
            // user + orgId are guaranteed by withAuth + withActiveOrg upstream.
            const user = ctx.user;
            const orgId = ctx.orgId;
            if (!user || !orgId) throw new Error('Auth/org context missing — middleware bug.');
            const result = await createDocumentUseCase(orgId, user.id, ctx.body);
            return jsonResponse(201, result);
          }),
        ),
      ),
    ),
  ),
);
