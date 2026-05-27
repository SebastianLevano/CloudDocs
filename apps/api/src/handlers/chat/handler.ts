import { ChatRequestSchema } from '@clouddocs/shared-types';

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
} from '../../middlewares';
import { chatUseCase } from './usecase';

/**
 * POST /v1/chat — RAG chat over the active org's documents (optionally scoped to
 * one document). Stateless: the client sends the recent conversation.
 */
export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(
      withErrorHandler,
      withJsonBody,
    )(
      withAuth(
        withActiveOrg(
          withValidation(ChatRequestSchema, async (ctx) => {
            const orgId = ctx.orgId;
            if (!orgId) throw new Error('Org context missing — middleware bug.');
            const result = await chatUseCase(orgId, ctx.body);
            return jsonResponse(200, result);
          }),
        ),
      ),
    ),
  ),
);
