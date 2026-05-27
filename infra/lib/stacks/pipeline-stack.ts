import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { InfraConfig } from '../config';
import { NodejsHandler } from '../constructs/nodejs-handler';

export interface PipelineStackProps extends cdk.StackProps {
  readonly config: InfraConfig;
  readonly uploadsBucket: s3.IBucket;
  readonly apiSecret: secretsmanager.ISecret;
}

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const HANDLERS_ROOT = path.join(WORKSPACE_ROOT, 'apps', 'api', 'src', 'handlers');

// Mirror of apps/api/src/lib/events.ts (separate build, can't import across it).
const EVENT_SOURCE = 'clouddocs.documents';
const DOCUMENT_EXTRACTED = 'DocumentExtracted';

/**
 * Async AI pipeline (plan §2.2):
 *   S3 ObjectCreated → EventBridge → ingest queue → extract-worker
 *     → `DocumentExtracted` event → EventBridge fan-out → summarize + classify
 *       queues → workers → ai_analyses → document `ready`.
 *
 * Each queue has a dead-letter queue (maxReceiveCount 3); the workers report
 * per-record failures so only the failed message is retried.
 */
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { config, uploadsBucket, apiSecret } = props;
    const prefix = config.resourcePrefix;

    const makeQueue = (name: string): sqs.Queue => {
      const dlq = new sqs.Queue(this, `${name}Dlq`, {
        queueName: `${prefix}-${name}-dlq`,
        retentionPeriod: cdk.Duration.days(14),
      });
      return new sqs.Queue(this, `${name}Queue`, {
        queueName: `${prefix}-${name}`,
        // Generous: a worker may wait on OpenAI. Keep > worker timeout.
        visibilityTimeout: cdk.Duration.seconds(120),
        deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
      });
    };

    const ingestQueue = makeQueue('doc-ingest');
    const summarizeQueue = makeQueue('doc-summarize');
    const classifyQueue = makeQueue('doc-classify');
    const embedQueue = makeQueue('doc-embed');

    // S3 ObjectCreated (raw-uploads/) → ingest queue.
    new events.Rule(this, 'DocUploadedRule', {
      ruleName: `${prefix}-doc-uploaded`,
      description: 'Route new raw uploads to the extract worker.',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [uploadsBucket.bucketName] },
          object: { key: [{ prefix: 'raw-uploads/' }] },
        },
      },
      targets: [new targets.SqsQueue(ingestQueue)],
    });

    // DocumentExtracted → fan out to the analysis + embedding queues.
    new events.Rule(this, 'DocExtractedRule', {
      ruleName: `${prefix}-doc-extracted`,
      description: 'Fan out extracted documents to summarize + classify + embed.',
      eventPattern: {
        source: [EVENT_SOURCE],
        detailType: [DOCUMENT_EXTRACTED],
      },
      targets: [
        new targets.SqsQueue(summarizeQueue),
        new targets.SqsQueue(classifyQueue),
        new targets.SqsQueue(embedQueue),
      ],
    });

    const defaultBus = events.EventBus.fromEventBusName(this, 'DefaultBus', 'default');

    const makeWorker = (
      id: string,
      handlerDir: string,
      queue: sqs.Queue,
      opts: { memorySize: number; canWriteBucket: boolean; canPutEvents: boolean },
    ): void => {
      const fn = new NodejsHandler(this, id, {
        functionName: `${prefix}-worker-${handlerDir}`,
        entry: path.join(HANDLERS_ROOT, 'workers', handlerDir, 'handler.ts'),
        environment: {
          STAGE: config.stage,
          SECRET_ARN: apiSecret.secretArn,
          UPLOADS_BUCKET: uploadsBucket.bucketName,
          LOG_LEVEL: config.stage === 'prod' ? 'info' : 'debug',
        },
        memorySize: opts.memorySize,
        timeout: cdk.Duration.seconds(90),
        minify: config.stage === 'prod',
        sourceMap: config.stage !== 'prod',
        logRetention: logs.RetentionDays.TWO_WEEKS,
        logRemovalPolicy:
          config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });

      apiSecret.grantRead(fn.function);
      if (opts.canWriteBucket) uploadsBucket.grantReadWrite(fn.function);
      else uploadsBucket.grantRead(fn.function);
      if (opts.canPutEvents) defaultBus.grantPutEventsTo(fn.function);

      fn.function.addEventSource(
        new SqsEventSource(queue, { batchSize: 1, reportBatchItemFailures: true }),
      );
    };

    // extract reads raw bytes, writes extracted text, and emits an event.
    makeWorker('ExtractWorker', 'extract', ingestQueue, {
      memorySize: 1024, // pdf-parse/pdfjs is memory-hungry
      canWriteBucket: true,
      canPutEvents: true,
    });
    // analysis workers only read the extracted text + call OpenAI.
    makeWorker('SummarizeWorker', 'summarize', summarizeQueue, {
      memorySize: 512,
      canWriteBucket: false,
      canPutEvents: false,
    });
    makeWorker('ClassifyWorker', 'classify', classifyQueue, {
      memorySize: 512,
      canWriteBucket: false,
      canPutEvents: false,
    });
    // embed worker reads the extracted text + calls the embeddings API.
    makeWorker('EmbedWorker', 'embed', embedQueue, {
      memorySize: 512,
      canWriteBucket: false,
      canPutEvents: false,
    });

    new cdk.CfnOutput(this, 'IngestQueueUrl', { value: ingestQueue.queueUrl });
  }
}
