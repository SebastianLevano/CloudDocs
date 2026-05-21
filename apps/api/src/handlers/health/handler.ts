import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

interface HealthResponse {
  status: 'ok';
  service: 'clouddocs-api';
  version: string;
  timestamp: string;
  requestId: string;
}

export const handler = async (
  _event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  const body: HealthResponse = {
    status: 'ok',
    service: 'clouddocs-api',
    version: process.env['SERVICE_VERSION'] ?? '0.0.0',
    timestamp: new Date().toISOString(),
    requestId: context.awsRequestId,
  };

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
};
