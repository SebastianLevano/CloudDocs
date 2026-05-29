/**
 * EventBridge publishing for the document pipeline. The extract worker emits a
 * `DocumentExtracted` event; an EventBridge rule fans it out to the summarize
 * and classify queues (see infra/pipeline-stack). Keeping the source/detail-type
 * constants here means producer and the CDK rule can't drift.
 */
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

export const EVENT_SOURCE = 'clouddocs.documents';
export const DOCUMENT_EXTRACTED = 'DocumentExtracted';
export const DOCUMENT_NEEDS_OCR = 'DocumentNeedsOcr';

export interface DocumentExtractedDetail {
  orgId: string;
  documentId: string;
  textS3Key: string;
}

let client: EventBridgeClient | undefined;

function bus(): EventBridgeClient {
  client ??= new EventBridgeClient({});
  return client;
}

export interface DocumentNeedsOcrDetail {
  orgId: string;
  documentId: string;
  s3Key: string;
}

export async function publishDocumentNeedsOcr(detail: DocumentNeedsOcrDetail): Promise<void> {
  await bus().send(
    new PutEventsCommand({
      Entries: [
        { Source: EVENT_SOURCE, DetailType: DOCUMENT_NEEDS_OCR, Detail: JSON.stringify(detail) },
      ],
    }),
  );
}

export async function publishDocumentExtracted(detail: DocumentExtractedDetail): Promise<void> {
  await bus().send(
    new PutEventsCommand({
      Entries: [
        {
          Source: EVENT_SOURCE,
          DetailType: DOCUMENT_EXTRACTED,
          Detail: JSON.stringify(detail),
          // Default bus; the rule lives there too.
        },
      ],
    }),
  );
}
