/**
 * Document AI pipeline integration test against a real Postgres.
 *
 * Same safety gate as the other suites (RUN_INTEGRATION=1 + localhost DB). S3,
 * the text extractor and EventBridge are mocked, and the AI provider falls back
 * to the deterministic MockAiProvider (no OPENAI_API_KEY), so the suite is
 * offline and free — it exercises the worker → DB wiring and the ready-join.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context, SQSEvent } from 'aws-lambda';

const RUN = process.env['RUN_INTEGRATION'] === '1';
const INTEGRATION_URL =
  process.env['INTEGRATION_DATABASE_URL'] ??
  'postgres://clouddocs:clouddocs@localhost:5434/clouddocs';
const LOCAL_HOST_RE = /(?:^|@|\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|\/|$)/;
const URL_LOCAL = LOCAL_HOST_RE.test(INTEGRATION_URL);

if (RUN && URL_LOCAL) {
  process.env['DATABASE_URL'] = INTEGRATION_URL;
  process.env['UPLOADS_BUCKET'] = 'test-bucket';
  // Force the mock AI provider regardless of what .env.local carries.
  delete process.env['OPENAI_API_KEY'];
}

const EXTRACTED_TEXT = 'This is an INVOICE for consulting services. Total due: $1000.';

vi.mock('../../lib/storage/s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage/s3')>();
  return {
    ...actual,
    getObjectBytes: vi.fn(async () => Buffer.from('%PDF-1.4 fake')),
    getObjectText: vi.fn(async () => EXTRACTED_TEXT),
    putText: vi.fn(async () => undefined),
  };
});
vi.mock('../../lib/extract/text-extractor', () => ({
  extractText: vi.fn(async () => ({ text: EXTRACTED_TEXT, pageCount: 2 })),
}));
vi.mock('../../lib/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/events')>();
  return { ...actual, publishDocumentExtracted: vi.fn(async () => undefined) };
});

import { closePool, query } from '../../lib/db/client';
import { buildRawKey, buildTextKey } from '../../lib/storage/s3';
import { DOCUMENT_EXTRACTED, EVENT_SOURCE } from '../../lib/events';
import { DocumentsRepo } from '../../repositories/documents-repo';
import { AiAnalysesRepo } from '../../repositories/ai-analyses-repo';
import { handler as extractHandler } from './extract/handler';
import { handler as summarizeHandler } from './summarize/handler';
import { handler as classifyHandler } from './classify/handler';

const lambdaCtx = {} as Context;
const noCb = undefined as never;

/** Wrap an EventBridge envelope as a one-record SQS event. */
function sqsEventFor(envelope: unknown): SQSEvent {
  return {
    Records: [
      {
        messageId: 'm1',
        receiptHandle: 'r1',
        body: JSON.stringify(envelope),
        attributes: {} as never,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:test',
        awsRegion: 'sa-east-1',
      },
    ],
  };
}

async function seedDoc(): Promise<{ orgId: string; docId: string; s3Key: string }> {
  const orgs = await query<{ id: string }>(
    `INSERT INTO organizations (name, slug) VALUES ('Acme', 'acme') RETURNING id`,
  );
  const orgId = orgs[0]!.id;
  const users = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ('demo@test.com', 'x') RETURNING id`,
  );
  const userId = users[0]!.id;
  await query(`INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, 'owner')`, [
    userId,
    orgId,
  ]);
  const repo = new DocumentsRepo(orgId);
  const crypto = await import('node:crypto');
  const docId = crypto.randomUUID();
  const s3Key = buildRawKey(orgId, docId, 'invoice.pdf');
  await repo.create({
    id: docId,
    uploadedBy: userId,
    filename: 'invoice.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1234,
    s3Key,
  });
  await repo.setStatus(docId, 'uploaded');
  return { orgId, docId, s3Key };
}

describe.skipIf(!RUN || !URL_LOCAL)('document AI pipeline', () => {
  beforeAll(() => {
    if (!process.env['JWT_PRIVATE_KEY'] || !process.env['JWT_PUBLIC_KEY']) {
      throw new Error('JWT keys must be set for integration tests.');
    }
  });

  beforeEach(async () => {
    await query(
      'TRUNCATE ai_analyses, documents, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it('extract → summarize → classify → ready', async () => {
    const { orgId, docId, s3Key } = await seedDoc();

    // 1. extract: S3 ObjectCreated envelope
    await extractHandler(
      sqsEventFor({
        source: 'aws.s3',
        'detail-type': 'Object Created',
        detail: { bucket: { name: 'test-bucket' }, object: { key: s3Key } },
      }),
      lambdaCtx,
      noCb,
    );

    const docs = new DocumentsRepo(orgId);
    let doc = await docs.findById(docId);
    expect(doc?.status).toBe('extracted');
    expect(doc?.text_s3_key).toBe(buildTextKey(orgId, docId));
    expect(doc?.page_count).toBe(2);

    // 2. analyze fan-out: DocumentExtracted envelope to both workers
    const extractedEnvelope = {
      source: EVENT_SOURCE,
      'detail-type': DOCUMENT_EXTRACTED,
      detail: { orgId, documentId: docId, textS3Key: buildTextKey(orgId, docId) },
    };
    await summarizeHandler(sqsEventFor(extractedEnvelope), lambdaCtx, noCb);
    await classifyHandler(sqsEventFor(extractedEnvelope), lambdaCtx, noCb);

    // 3. assert: ready, classified, two analyses
    doc = await docs.findById(docId);
    expect(doc?.status).toBe('ready');
    expect(doc?.category).toBe('Invoice'); // mock detects "invoice" in the text
    expect(doc?.tags.length).toBeGreaterThan(0);

    const analyses = await new AiAnalysesRepo(orgId).listForDocument(docId);
    expect(analyses.map((a) => a.kind).sort()).toEqual(['classification', 'summary']);
  });

  it('extract marks the document failed when extraction throws', async () => {
    const { orgId, docId, s3Key } = await seedDoc();
    const extractor = await import('../../lib/extract/text-extractor');
    vi.mocked(extractor.extractText).mockRejectedValueOnce(new Error('corrupt pdf'));

    await extractHandler(
      sqsEventFor({
        source: 'aws.s3',
        'detail-type': 'Object Created',
        detail: { bucket: { name: 'test-bucket' }, object: { key: s3Key } },
      }),
      lambdaCtx,
      noCb,
    );

    const doc = await new DocumentsRepo(orgId).findById(docId);
    expect(doc?.status).toBe('failed');
  });
});
