import type { DocumentStats } from '@clouddocs/shared-types';

import { DocumentsRepo } from '../../../repositories/documents-repo';
import { AiAnalysesRepo } from '../../../repositories/ai-analyses-repo';
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

/** GET /v1/documents/stats — aggregate counters for the dashboard. */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const stats = await new DocumentsRepo(ctx.orgId).getStats();
          const analysesThisMonth = await new AiAnalysesRepo(ctx.orgId).countThisMonth();
          const body: DocumentStats = { ...stats, analysesThisMonth };
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
