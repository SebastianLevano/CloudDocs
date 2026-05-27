import { DocumentListQuerySchema, type DocumentListResponse } from '@clouddocs/shared-types';

import { ValidationError } from '../../../lib/errors';
import { getAiProvider } from '../../../lib/ai';
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

/**
 * GET /v1/documents — browse or search.
 *
 * - No `q`: keyset-paginated list, newest first, with optional status/category
 *   filters.
 * - With `q`: hybrid search — the query is embedded and fused (RRF) with the
 *   full-text ranking, returning documents by relevance (single page, no
 *   cursor). If embedding the query fails we degrade gracefully to the
 *   keyword-only keyset list so search never hard-fails.
 */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const parsed = DocumentListQuerySchema.safeParse(ctx.event.queryStringParameters ?? {});
          if (!parsed.success) {
            throw new ValidationError('Invalid query parameters.', parsed.error.issues);
          }
          const query = parsed.data;
          const repo = new DocumentsRepo(ctx.orgId);

          if (query.q) {
            try {
              const { vectors } = await getAiProvider().embed([query.q]);
              const rows = await repo.hybridSearch({
                q: query.q,
                queryVector: vectors[0] ?? [],
                ...(query.status ? { status: query.status } : {}),
                ...(query.category ? { category: query.category } : {}),
                limit: query.limit,
              });
              const body: DocumentListResponse = {
                documents: rows.map(toDocument),
                nextCursor: null,
              };
              return jsonResponse(200, body);
            } catch (err) {
              ctx.log.warn({ err }, 'hybrid search failed; falling back to keyword list');
              // fall through to the keyword list below
            }
          }

          const { rows, nextCursor } = await repo.list(query);
          const body: DocumentListResponse = { documents: rows.map(toDocument), nextCursor };
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
