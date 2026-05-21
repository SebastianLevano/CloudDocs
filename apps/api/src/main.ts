/**
 * Local entrypoint — invokes the `health` handler against a fake event so we can
 * sanity-check the bundle outside of AWS. The real Lambda binding happens in
 * `infra/` (CDK) which points API Gateway routes at each handler file.
 */
import { randomUUID } from 'node:crypto';
import { handler as healthHandler } from './handlers/health/handler';

async function main(): Promise<void> {
  const fakeContext = {
    awsRequestId: randomUUID(),
    functionName: 'health',
    functionVersion: '0',
    invokedFunctionArn: 'arn:aws:lambda:local:0:function:health',
    memoryLimitInMB: '128',
    logGroupName: '/local/clouddocs-api',
    logStreamName: 'local',
    getRemainingTimeInMillis: () => 30_000,
    callbackWaitsForEmptyEventLoop: false,
    done: () => undefined,
    fail: () => undefined,
    succeed: () => undefined,
  } as unknown as import('aws-lambda').Context;

  const response = await healthHandler(
    {} as import('aws-lambda').APIGatewayProxyEventV2,
    fakeContext,
  );

  console.log('[clouddocs-api] health response:', response);
}

void main();
