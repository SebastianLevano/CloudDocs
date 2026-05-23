import { LoginDtoSchema } from '@clouddocs/shared-types';

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
import { loginUseCase } from './usecase';

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(
      withErrorHandler,
      withJsonBody,
    )(
      withValidation(LoginDtoSchema, async (ctx) => {
        const result = await loginUseCase(ctx.body, {
          userAgent: ctx.event.headers?.['user-agent'],
          ip: ctx.event.requestContext.http.sourceIp,
        });
        return jsonResponse(200, result.body, { cookies: [result.setCookie] });
      }),
    ),
  ),
);
