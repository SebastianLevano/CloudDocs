import { describe, expect, it } from 'vitest';
import { handler } from './handler';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const fakeContext = {
  awsRequestId: 'test-request-id',
} as unknown as Context;

describe('health handler', () => {
  it('returns a 200 with the service identity', async () => {
    const response = await handler({} as APIGatewayProxyEventV2, fakeContext);

    expect(response).toMatchObject({
      statusCode: 200,
      headers: expect.objectContaining({
        'content-type': 'application/json',
      }),
    });

    const body = JSON.parse((response as { body: string }).body);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'clouddocs-api',
      requestId: 'test-request-id',
    });
    expect(typeof body.timestamp).toBe('string');
  });
});
