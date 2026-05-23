import { RegisterDtoSchema } from '@clouddocs/shared-types';

import {
  compose,
  jsonResponse,
  withErrorHandler,
  withJsonBody,
  withRequestLogger,
  withSecrets,
  withValidation,
  type LambdaHandler,
} from '../../../middlewares';
import { registerUseCase } from './usecase';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(
      withErrorHandler,
      withJsonBody,
    )(
      withValidation(RegisterDtoSchema, async (ctx) => {
        const result = await registerUseCase(ctx.body, {
          userAgent: ctx.event.headers?.['user-agent'],
          ip: ctx.event.requestContext.http.sourceIp,
        });
        return jsonResponse(201, result.body, { cookies: [result.setCookie] });
      }),
    ),
  ),
);
