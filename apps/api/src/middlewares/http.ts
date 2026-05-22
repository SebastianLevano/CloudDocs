/**
 * Tiny HTTP helpers shared by middlewares and handlers.
 */
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export function jsonResponse(
  statusCode: number,
  body: unknown,
  options: {
    headers?: Record<string, string>;
    cookies?: readonly string[];
  } = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...options.headers,
    },
    ...(options.cookies && options.cookies.length > 0 ? { cookies: [...options.cookies] } : {}),
    body: JSON.stringify(body),
  };
}

export function emptyResponse(
  statusCode: number,
  options: { cookies?: readonly string[] } = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    ...(options.cookies && options.cookies.length > 0 ? { cookies: [...options.cookies] } : {}),
  };
}
