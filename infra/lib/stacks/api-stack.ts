import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';
import type { InfraConfig } from '../config';
import { NodejsHandler } from '../constructs/nodejs-handler';

export interface ApiStackProps extends cdk.StackProps {
  readonly config: InfraConfig;
}

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const HEALTH_HANDLER_ENTRY = path.join(
  WORKSPACE_ROOT,
  'apps',
  'api',
  'src',
  'handlers',
  'health',
  'handler.ts',
);

export class ApiStack extends cdk.Stack {
  readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config } = props;

    const health = new NodejsHandler(this, 'Health', {
      functionName: `${config.resourcePrefix}-health`,
      entry: HEALTH_HANDLER_ENTRY,
      environment: {
        SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
        STAGE: config.stage,
      },
      minify: config.stage === 'prod',
      sourceMap: config.stage !== 'prod',
      logRetention: logs.RetentionDays.TWO_WEEKS,
      logRemovalPolicy:
        config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `${config.resourcePrefix}-api`,
      description: 'CloudDocs public HTTP API (v2).',
      corsPreflight: {
        // TODO Phase 6: replace with the actual Vercel frontend origin.
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type', 'x-request-id'],
        maxAge: cdk.Duration.hours(1),
      },
      disableExecuteApiEndpoint: false,
    });

    this.httpApi.addRoutes({
      path: '/v1/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('HealthIntegration', health.function),
    });

    // TODO Phase 6: bind custom domain (api-dev.<domain>) via DomainName + ApiMapping.
    if (config.customDomain.enabled) {
      throw new Error('Custom domain wiring not implemented yet — see Phase 6.');
    }

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: 'Base URL of the HTTP API. Append /v1/health to verify.',
      exportName: `${config.resourcePrefix}-http-api-url`,
    });

    new cdk.CfnOutput(this, 'HealthCheckUrl', {
      value: `${this.httpApi.apiEndpoint}/v1/health`,
      description: 'Curl this after deploy to verify the slice end-to-end.',
    });
  }
}
