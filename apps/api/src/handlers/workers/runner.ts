/**
 * Shared SQS worker runner for the document pipeline.
 *
 * All worker queues are fed by EventBridge (S3 events → ingest queue; our
 * `DocumentExtracted` event → analyze queues), so each SQS record body is an
 * EventBridge envelope. The runner:
 *   - loads Secrets Manager values into env (DB URL, OpenAI key) once per cold
 *     start, like the HTTP handlers' `withSecrets`;
 *   - processes each record independently and reports per-record failures via
 *     `batchItemFailures` so only failed messages are retried (the Lambda's
 *     event source must have ReportBatchItemFailures enabled).
 */
import type { SQSBatchResponse, SQSEvent, SQSHandler } from 'aws-lambda';

import { loadSecretsIntoEnv } from '../../lib/secrets';
import { createLogger, type RequestLogger } from '../../lib/logger';

export interface EventBridgeEnvelope {
  source: string;
  'detail-type': string;
  detail: unknown;
}

export type WorkerRecordHandler = (
  envelope: EventBridgeEnvelope,
  log: RequestLogger,
) => Promise<void>;

export function sqsWorker(workerName: string, handle: WorkerRecordHandler): SQSHandler {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    await loadSecretsIntoEnv();
    const log = createLogger({ worker: workerName });
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

    for (const record of event.Records) {
      try {
        const envelope = JSON.parse(record.body) as EventBridgeEnvelope;
        await handle(envelope, log);
      } catch (err) {
        log.error({ err, messageId: record.messageId }, `${workerName} failed a record`);
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
}
