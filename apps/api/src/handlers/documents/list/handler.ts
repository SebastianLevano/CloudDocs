import { DocumentListQuerySchema, type DocumentListResponse } from '@clouddocs/shared-types';

import { ValidationError } from '../../../lib/errors';
import { DocumentsRepo, toDocument } from '../../../repositories/documents-repo';
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

/** GET /v1/documents — keyset-paginated list, newest first, scoped to the active org. */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const parsed = DocumentListQuerySchema.safeParse(ctx.event.queryStringParameters ?? {});
          if (!parsed.success) {
            throw new ValidationError('Invalid query parameters.', parsed.error.issues);
          }

          const repo = new DocumentsRepo(ctx.orgId);
          const { rows, nextCursor } = await repo.list(parsed.data.limit, parsed.data.cursor);
          const body: DocumentListResponse = { documents: rows.map(toDocument), nextCursor };
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
