import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';
import type { InfraConfig } from '../config';
import { NodejsHandler } from '../constructs/nodejs-handler';

export interface ApiStackProps extends cdk.StackProps {
  readonly config: InfraConfig;
  /** Uploads bucket (from StorageStack) the document Lambdas presign against. */
  readonly uploadsBucket: s3.IBucket;
}

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const HANDLERS_ROOT = path.join(WORKSPACE_ROOT, 'apps', 'api', 'src', 'handlers');
const HEALTH_HANDLER_ENTRY = path.join(HANDLERS_ROOT, 'health', 'handler.ts');

interface AuthRoute {
  readonly id: string;
  readonly handlerDir: string;
  readonly method: apigwv2.HttpMethod;
  readonly path: string;
  readonly description: string;
}

const AUTH_ROUTES: readonly AuthRoute[] = [
  {
    id: 'Register',
    handlerDir: 'register',
    method: apigwv2.HttpMethod.POST,
    path: '/v1/auth/register',
    description: 'Create user + default org + owner membership. Issues access + refresh tokens.',
  },
  {
    id: 'Login',
    handlerDir: 'login',
    method: apigwv2.HttpMethod.POST,
    path: '/v1/auth/login',
    description: 'Verify credentials and issue a new session.',
  },
  {
    id: 'Refresh',
    handlerDir: 'refresh',
    method: apigwv2.HttpMethod.POST,
    path: '/v1/auth/refresh',
    description: 'Rotate refresh cookie + issue new access token.',
  },
  {
    id: 'Logout',
    handlerDir: 'logout',
    method: apigwv2.HttpMethod.POST,
    path: '/v1/auth/logout',
    description: 'Revoke refresh token (idempotent) + clear cookie.',
  },
  {
    id: 'Me',
    handlerDir: 'me',
    method: apigwv2.HttpMethod.GET,
    path: '/v1/auth/me',
    description: 'Return authenticated user + memberships.',
  },
];

interface DocRoute {
  readonly id: string;
  /** Path under handlers/documents/ for the handler.ts file. */
  readonly handlerDir: string;
  readonly method: apigwv2.HttpMethod;
  readonly path: string;
  readonly description: string;
}

const DOC_ROUTES: readonly DocRoute[] = [
  {
    id: 'Create',
    handlerDir: 'create',
    method: apigwv2.HttpMethod.POST,
    path: '/v1/documents',
    description: 'Register a document and return a presigned S3 PUT URL.',
  },
  {
    id: 'List',
    handlerDir: 'list',
    method: apigwv2.HttpMethod.GET,
    path: '/v1/documents',
    description: 'Keyset-paginated list of the active org documents.',
  },
  {
    id: 'Get',
    handlerDir: 'get',
    method: apigwv2.HttpMethod.GET,
    path: '/v1/documents/{id}',
    description: 'Document detail with its AI analyses.',
  },
  {
    id: 'Complete',
    handlerDir: 'complete',
    method: apigwv2.HttpMethod.POST,
    path: '/v1/documents/{id}/complete',
    description: 'Mark a document uploaded after the browser PUT succeeds.',
  },
  {
    id: 'Download',
    handlerDir: 'download',
    method: apigwv2.HttpMethod.GET,
    path: '/v1/documents/{id}/download',
    description: 'Return a short-lived presigned GET URL for the object.',
  },
];

export class ApiStack extends cdk.Stack {
  readonly httpApi: apigwv2.HttpApi;
  readonly apiSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Single JSON secret holding all runtime values the API Lambdas need:
    // DATABASE_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY. Populated out-of-band
    // (`pnpm secrets:put:dev`) so values never touch CloudFormation.
    this.apiSecret = new secretsmanager.Secret(this, 'ApiSecret', {
      secretName: `clouddocs/${config.stage}/api`,
      description:
        'CloudDocs API runtime secrets (DATABASE_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY). ' +
        'Populated outside CDK; CDK manages the resource lifecycle only.',
      removalPolicy: config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

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
        // allowCredentials=true (needed for the refresh cookie) is incompatible
        // with allowOrigins '*'. Enumerate explicit origins per stage.
        // TODO Phase 6: add the prod Vercel + custom domain origins here.
        allowOrigins: ['http://localhost:4200'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        // `x-cdx-client` is the CSRF marker header required by refresh/logout
        // (see apps/api middlewares/with-csrf.ts); `x-org-id` selects the active
        // org for document routes (middlewares/with-active-org.ts). Listing them
        // here makes the browser preflight succeed for allowed origins only.
        allowHeaders: ['authorization', 'content-type', 'x-request-id', 'x-cdx-client', 'x-org-id'],
        allowCredentials: true,
        maxAge: cdk.Duration.hours(1),
      },
      disableExecuteApiEndpoint: false,
    });

    this.httpApi.addRoutes({
      path: '/v1/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('HealthIntegration', health.function),
    });

    // Auth Lambdas — one bundle per route so each can scale, log and be
    // updated independently. They all share the same secret and runtime env.
    for (const route of AUTH_ROUTES) {
      const handler = new NodejsHandler(this, `Auth${route.id}`, {
        functionName: `${config.resourcePrefix}-auth-${route.handlerDir}`,
        entry: path.join(HANDLERS_ROOT, 'auth', route.handlerDir, 'handler.ts'),
        environment: {
          STAGE: config.stage,
          SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
          SECRET_ARN: this.apiSecret.secretArn,
          COOKIE_SECURE: 'true',
          LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
        },
        memorySize: 512, // argon2 (WASM) needs ~70 MiB free; bump from 256.
        timeout: cdk.Duration.seconds(15),
        minify: config.stage === 'prod',
        sourceMap: config.stage !== 'prod',
        logRetention: logs.RetentionDays.TWO_WEEKS,
        logRemovalPolicy:
          config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });

      this.apiSecret.grantRead(handler.function);

      this.httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: new HttpLambdaIntegration(`Auth${route.id}Integration`, handler.function),
      });
    }

    // Document Lambdas — DB access (via the shared secret) plus read/write on the
    // uploads bucket so they can presign PUT/GET URLs. The bytes flow browser↔S3
    // directly; these functions only sign URLs and touch metadata.
    for (const route of DOC_ROUTES) {
      const handler = new NodejsHandler(this, `Doc${route.id}`, {
        functionName: `${config.resourcePrefix}-documents-${route.handlerDir}`,
        entry: path.join(HANDLERS_ROOT, 'documents', route.handlerDir, 'handler.ts'),
        environment: {
          STAGE: config.stage,
          SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
          SECRET_ARN: this.apiSecret.secretArn,
          UPLOADS_BUCKET: props.uploadsBucket.bucketName,
          LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
        },
        timeout: cdk.Duration.seconds(15),
        minify: config.stage === 'prod',
        sourceMap: config.stage !== 'prod',
        logRetention: logs.RetentionDays.TWO_WEEKS,
        logRemovalPolicy:
          config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });

      this.apiSecret.grantRead(handler.function);
      props.uploadsBucket.grantReadWrite(handler.function);

      this.httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: new HttpLambdaIntegration(`Doc${route.id}Integration`, handler.function),
      });
    }

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

    new cdk.CfnOutput(this, 'ApiSecretArn', {
      value: this.apiSecret.secretArn,
      description: 'Secrets Manager ARN — populate with `aws secretsmanager put-secret-value`.',
      exportName: `${config.resourcePrefix}-api-secret-arn`,
    });
  }
}
