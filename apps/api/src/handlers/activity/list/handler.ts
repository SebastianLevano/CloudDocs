/**
 * GET /v1/activity
 * Returns the org's activity log, newest first, with optional filters.
 * Pass ?format=csv to get a CSV download instead of JSON.
 */
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

import { ActivityListQuerySchema, type ActivityListResponse } from '@clouddocs/shared-types';

import { ValidationError } from '../../../lib/errors';
import { ActivityRepo } from '../../../repositories/activity-repo';
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

function toCsv(logs: ActivityListResponse['logs']): string {
  const header = 'id,action,targetType,targetId,userId,createdAt,metadata';
  const rows = logs.map((l) =>
    [
      l.id,
      l.action,
      l.targetType ?? '',
      l.targetId ?? '',
      l.userId ?? '',
      l.createdAt,
      JSON.stringify(l.metadata).replace(/"/g, '""'),
    ]
      .map((v) => `"${v}"`)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

export const handler: LambdaHandler = withSecrets(
  withRequestLogger(
    compose(withErrorHandler)(
      withAuth(
        withActiveOrg(async (ctx) => {
          const parsed = ActivityListQuerySchema.safeParse(ctx.event.queryStringParameters ?? {});
          if (!parsed.success) {
            throw new ValidationError('Invalid query parameters.', parsed.error.issues);
          }
          const opts = parsed.data;
          const { rows, nextCursor } = await ActivityRepo.list(ctx.orgId, opts);

          if (opts.format === 'csv') {
            const csvResponse: APIGatewayProxyStructuredResultV2 = {
              statusCode: 200,
              headers: {
                'content-type': 'text/csv',
                'content-disposition': 'attachment; filename="activity.csv"',
                'cache-control': 'no-store',
              },
              body: toCsv(rows),
            };
            return csvResponse;
          }

          const body: ActivityListResponse = { logs: rows, nextCursor };
          return jsonResponse(200, body);
        }),
      ),
    ),
  ),
);
