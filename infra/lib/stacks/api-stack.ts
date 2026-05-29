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
    id: 'Stats',
    handlerDir: 'stats',
    method: apigwv2.HttpMethod.GET,
    // Literal segment — HTTP API prioritises this over the `{id}` route below.
    path: '/v1/documents/stats',
    description: 'Aggregate document counters for the dashboard.',
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

interface FolderRoute {
  readonly id: string;
  readonly handlerDir: string;
  readonly method: apigwv2.HttpMethod;
  readonly path: string;
}

const FOLDER_ROUTES: readonly FolderRoute[] = [
  {
    id: 'Create',
    handlerDir: 'folders/create',
    method: apigwv2.HttpMethod.POST,
    path: '/v1/folders',
  },
  { id: 'List', handlerDir: 'folders/list', method: apigwv2.HttpMethod.GET, path: '/v1/folders' },
  {
    id: 'Get',
    handlerDir: 'folders/get',
    method: apigwv2.HttpMethod.GET,
    path: '/v1/folders/{id}',
  },
  {
    id: 'Update',
    handlerDir: 'folders/update',
    method: apigwv2.HttpMethod.PATCH,
    path: '/v1/folders/{id}',
  },
  {
    id: 'Delete',
    handlerDir: 'folders/delete',
    method: apigwv2.HttpMethod.DELETE,
    path: '/v1/folders/{id}',
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
        // with allowOrigins '*'. Origins come from config.webOrigins: localhost
        // always + the deployed frontend origin via the WEB_ORIGIN env var.
        allowOrigins: config.webOrigins,
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

    // Chat Lambda — RAG over embeddings (DB + OpenAI via the shared secret). No
    // bucket access: it reads chunks from Postgres, not S3. Longer timeout since
    // it does retrieval + a chat completion.
    const chat = new NodejsHandler(this, 'Chat', {
      functionName: `${config.resourcePrefix}-chat`,
      entry: path.join(HANDLERS_ROOT, 'chat', 'handler.ts'),
      environment: {
        STAGE: config.stage,
        SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
        SECRET_ARN: this.apiSecret.secretArn,
        LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
      },
      timeout: cdk.Duration.seconds(30),
      minify: config.stage === 'prod',
      sourceMap: config.stage !== 'prod',
      logRetention: logs.RetentionDays.TWO_WEEKS,
      logRemovalPolicy:
        config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
    this.apiSecret.grantRead(chat.function);
    this.httpApi.addRoutes({
      path: '/v1/chat',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('ChatIntegration', chat.function),
    });

    // Folder Lambdas — DB access only (no S3 presigning needed for folder metadata).
    for (const route of FOLDER_ROUTES) {
      const folderHandler = new NodejsHandler(this, `Folder${route.id}`, {
        functionName: `${config.resourcePrefix}-folders-${route.id.toLowerCase()}`,
        entry: path.join(HANDLERS_ROOT, route.handlerDir, 'handler.ts'),
        environment: {
          STAGE: config.stage,
          SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
          SECRET_ARN: this.apiSecret.secretArn,
          LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
        },
        timeout: cdk.Duration.seconds(15),
        minify: config.stage === 'prod',
        sourceMap: config.stage !== 'prod',
        logRetention: logs.RetentionDays.TWO_WEEKS,
        logRemovalPolicy:
          config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });
      this.apiSecret.grantRead(folderHandler.function);
      this.httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: new HttpLambdaIntegration(
          `Folder${route.id}Integration`,
          folderHandler.function,
        ),
      });
    }

    // Share Lambdas — authenticated create/delete + public unauthenticated GET.
    const shareEnv = {
      STAGE: config.stage,
      SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
      SECRET_ARN: this.apiSecret.secretArn,
      UPLOADS_BUCKET: props.uploadsBucket.bucketName,
      LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
    };
    const shareHandlerOpts = {
      timeout: cdk.Duration.seconds(15),
      minify: config.stage === 'prod',
      sourceMap: config.stage !== 'prod',
      logRetention: logs.RetentionDays.TWO_WEEKS,
      logRemovalPolicy:
        config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    };

    const shareCreate = new NodejsHandler(this, 'ShareCreate', {
      functionName: `${config.resourcePrefix}-shares-create`,
      entry: path.join(HANDLERS_ROOT, 'shares', 'create', 'handler.ts'),
      environment: shareEnv,
      ...shareHandlerOpts,
    });
    this.apiSecret.grantRead(shareCreate.function);
    this.httpApi.addRoutes({
      path: '/v1/documents/{id}/shares',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('ShareCreateIntegration', shareCreate.function),
    });

    const shareDelete = new NodejsHandler(this, 'ShareDelete', {
      functionName: `${config.resourcePrefix}-shares-delete`,
      entry: path.join(HANDLERS_ROOT, 'shares', 'delete', 'handler.ts'),
      environment: shareEnv,
      ...shareHandlerOpts,
    });
    this.apiSecret.grantRead(shareDelete.function);
    this.httpApi.addRoutes({
      path: '/v1/documents/{id}/shares/{shareId}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('ShareDeleteIntegration', shareDelete.function),
    });

    // Public share — no JWT required; needs S3 presign for download URL.
    const sharePublicGet = new NodejsHandler(this, 'SharePublicGet', {
      functionName: `${config.resourcePrefix}-shares-public-get`,
      entry: path.join(HANDLERS_ROOT, 'shares', 'public-get', 'handler.ts'),
      environment: shareEnv,
      ...shareHandlerOpts,
    });
    this.apiSecret.grantRead(sharePublicGet.function);
    props.uploadsBucket.grantRead(sharePublicGet.function);
    this.httpApi.addRoutes({
      path: '/v1/public/shares/{token}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('SharePublicGetIntegration', sharePublicGet.function),
    });

    // Comment Lambdas — nested under /v1/documents/{id}/comments.
    const commentEnv = {
      STAGE: config.stage,
      SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
      SECRET_ARN: this.apiSecret.secretArn,
      LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
    };
    const commentHandlerOpts = { ...shareHandlerOpts };

    const commentCreate = new NodejsHandler(this, 'CommentCreate', {
      functionName: `${config.resourcePrefix}-comments-create`,
      entry: path.join(HANDLERS_ROOT, 'documents', 'comments', 'create', 'handler.ts'),
      environment: commentEnv,
      ...commentHandlerOpts,
    });
    this.apiSecret.grantRead(commentCreate.function);
    this.httpApi.addRoutes({
      path: '/v1/documents/{id}/comments',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('CommentCreateIntegration', commentCreate.function),
    });

    const commentList = new NodejsHandler(this, 'CommentList', {
      functionName: `${config.resourcePrefix}-comments-list`,
      entry: path.join(HANDLERS_ROOT, 'documents', 'comments', 'list', 'handler.ts'),
      environment: commentEnv,
      ...commentHandlerOpts,
    });
    this.apiSecret.grantRead(commentList.function);
    this.httpApi.addRoutes({
      path: '/v1/documents/{id}/comments',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('CommentListIntegration', commentList.function),
    });

    const commentDelete = new NodejsHandler(this, 'CommentDelete', {
      functionName: `${config.resourcePrefix}-comments-delete`,
      entry: path.join(HANDLERS_ROOT, 'documents', 'comments', 'delete', 'handler.ts'),
      environment: commentEnv,
      ...commentHandlerOpts,
    });
    this.apiSecret.grantRead(commentDelete.function);
    this.httpApi.addRoutes({
      path: '/v1/documents/{id}/comments/{commentId}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('CommentDeleteIntegration', commentDelete.function),
    });

    // Billing Lambdas — Stripe checkout, portal, usage (owner-gated, need DB) and
    // webhook (no JWT, needs raw body for signature verification).
    const billingEnv = {
      STAGE: config.stage,
      SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
      SECRET_ARN: this.apiSecret.secretArn,
      FRONTEND_URL: process.env['WEB_ORIGIN'] ?? 'http://localhost:4200',
      LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
    };
    const billingOpts = {
      timeout: cdk.Duration.seconds(15),
      minify: config.stage === 'prod',
      sourceMap: config.stage !== 'prod',
      logRetention: logs.RetentionDays.TWO_WEEKS,
      logRemovalPolicy:
        config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    };

    const billingCheckout = new NodejsHandler(this, 'BillingCheckout', {
      functionName: `${config.resourcePrefix}-billing-checkout`,
      entry: path.join(HANDLERS_ROOT, 'billing', 'checkout', 'handler.ts'),
      environment: billingEnv,
      ...billingOpts,
    });
    this.apiSecret.grantRead(billingCheckout.function);
    this.httpApi.addRoutes({
      path: '/v1/billing/checkout',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'BillingCheckoutIntegration',
        billingCheckout.function,
      ),
    });

    const billingPortal = new NodejsHandler(this, 'BillingPortal', {
      functionName: `${config.resourcePrefix}-billing-portal`,
      entry: path.join(HANDLERS_ROOT, 'billing', 'portal', 'handler.ts'),
      environment: billingEnv,
      ...billingOpts,
    });
    this.apiSecret.grantRead(billingPortal.function);
    this.httpApi.addRoutes({
      path: '/v1/billing/portal',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('BillingPortalIntegration', billingPortal.function),
    });

    const billingUsage = new NodejsHandler(this, 'BillingUsage', {
      functionName: `${config.resourcePrefix}-billing-usage`,
      entry: path.join(HANDLERS_ROOT, 'billing', 'usage', 'handler.ts'),
      environment: billingEnv,
      ...billingOpts,
    });
    this.apiSecret.grantRead(billingUsage.function);
    this.httpApi.addRoutes({
      path: '/v1/billing/usage',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('BillingUsageIntegration', billingUsage.function),
    });

    // Webhook has no JWT. API Gateway delivers the raw body intact (no
    // transformation) so Stripe signature verification works.
    const billingWebhook = new NodejsHandler(this, 'BillingWebhook', {
      functionName: `${config.resourcePrefix}-billing-webhook`,
      entry: path.join(HANDLERS_ROOT, 'billing', 'webhook', 'handler.ts'),
      environment: billingEnv,
      ...billingOpts,
    });
    this.apiSecret.grantRead(billingWebhook.function);
    this.httpApi.addRoutes({
      path: '/v1/billing/webhook',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('BillingWebhookIntegration', billingWebhook.function),
    });

    // Activity log Lambda — org-scoped, supports ?format=csv.
    const activityList = new NodejsHandler(this, 'ActivityList', {
      functionName: `${config.resourcePrefix}-activity-list`,
      entry: path.join(HANDLERS_ROOT, 'activity', 'list', 'handler.ts'),
      environment: {
        STAGE: config.stage,
        SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
        SECRET_ARN: this.apiSecret.secretArn,
        LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
      },
      timeout: cdk.Duration.seconds(15),
      minify: config.stage === 'prod',
      sourceMap: config.stage !== 'prod',
      logRetention: logs.RetentionDays.TWO_WEEKS,
      logRemovalPolicy:
        config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
    this.apiSecret.grantRead(activityList.function);
    this.httpApi.addRoutes({
      path: '/v1/activity',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ActivityListIntegration', activityList.function),
    });

    // Notification Lambdas.
    const notifEnv = {
      STAGE: config.stage,
      SERVICE_VERSION: process.env.SERVICE_VERSION ?? '0.1.0',
      SECRET_ARN: this.apiSecret.secretArn,
      LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
    };
    const notifOpts = {
      timeout: cdk.Duration.seconds(15),
      minify: config.stage === 'prod',
      sourceMap: config.stage !== 'prod',
      logRetention: logs.RetentionDays.TWO_WEEKS,
      logRemovalPolicy:
        config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    };

    const notifList = new NodejsHandler(this, 'NotifList', {
      functionName: `${config.resourcePrefix}-notifications-list`,
      entry: path.join(HANDLERS_ROOT, 'notifications', 'list', 'handler.ts'),
      environment: notifEnv,
      ...notifOpts,
    });
    this.apiSecret.grantRead(notifList.function);
    this.httpApi.addRoutes({
      path: '/v1/notifications',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('NotifListIntegration', notifList.function),
    });

    // Literal segment /read-all must be listed before the /{id}/read route.
    const notifReadAll = new NodejsHandler(this, 'NotifReadAll', {
      functionName: `${config.resourcePrefix}-notifications-read-all`,
      entry: path.join(HANDLERS_ROOT, 'notifications', 'read-all', 'handler.ts'),
      environment: notifEnv,
      ...notifOpts,
    });
    this.apiSecret.grantRead(notifReadAll.function);
    this.httpApi.addRoutes({
      path: '/v1/notifications/read-all',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('NotifReadAllIntegration', notifReadAll.function),
    });

    const notifRead = new NodejsHandler(this, 'NotifRead', {
      functionName: `${config.resourcePrefix}-notifications-read`,
      entry: path.join(HANDLERS_ROOT, 'notifications', 'read', 'handler.ts'),
      environment: notifEnv,
      ...notifOpts,
    });
    this.apiSecret.grantRead(notifRead.function);
    this.httpApi.addRoutes({
      path: '/v1/notifications/{id}/read',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('NotifReadIntegration', notifRead.function),
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

    new cdk.CfnOutput(this, 'ApiSecretArn', {
      value: this.apiSecret.secretArn,
      description: 'Secrets Manager ARN — populate with `aws secretsmanager put-secret-value`.',
      exportName: `${config.resourcePrefix}-api-secret-arn`,
    });
  }
}
