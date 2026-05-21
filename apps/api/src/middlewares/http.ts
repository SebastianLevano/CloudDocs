/**
 * Tiny HTTP helpers shared by middlewares and handlers.
 */
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export function jsonResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}
