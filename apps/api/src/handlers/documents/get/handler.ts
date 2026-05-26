import type { DocumentDetailResponse } from '@clouddocs/shared-types';

import { NotFoundError, ValidationError } from '../../../lib/errors';
import { DocumentsRepo, toDocument } from '../../../repositories/documents-repo';
import { AiAnalysesRepo, toAiAnalysis } from '../../../repositories/ai-analyses-repo';
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

/** GET /v1/documents/{id} — document detail with its AI analyses. */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const id = ctx.event.pathParameters?.['id'];
          if (!id) throw new ValidationError('Document id missing from path.');

          const doc = await new DocumentsRepo(ctx.orgId).findById(id);
          if (!doc) throw new NotFoundError('Document not found.');

          const analyses = await new AiAnalysesRepo(ctx.orgId).listForDocument(id);
          const body: DocumentDetailResponse = {
            document: toDocument(doc),
            analyses: analyses.map(toAiAnalysis),
          };
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
