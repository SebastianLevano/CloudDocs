/**
 * Embeddings + hybrid search integration tests against a real Postgres+pgvector.
 * Same gate as the other suites. The MockAiProvider produces deterministic
 * bag-of-words vectors (shared vocabulary → higher cosine), so semantic ranking
 * is meaningful and offline.
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
  delete process.env['OPENAI_API_KEY']; // force MockAiProvider
}

const EXTRACTED_TEXT =
  'This invoice bills consulting services. Amount due 6000 USD. Payment terms net 30.';

vi.mock('../../lib/storage/s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage/s3')>();
  return { ...actual, getObjectText: vi.fn(async () => EXTRACTED_TEXT) };
});

import { closePool, query } from '../../lib/db/client';
import { getAiProvider } from '../../lib/ai';
import { DocumentsRepo } from '../../repositories/documents-repo';
import { EmbeddingsRepo } from '../../repositories/embeddings-repo';
import { handler as embedHandler } from '../workers/embed/handler';
import { DOCUMENT_EXTRACTED, EVENT_SOURCE } from '../../lib/events';

const lambdaCtx = {} as Context;
const noCb = undefined as never;

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

async function seedOrg(): Promise<string> {
  const orgs = await query<{ id: string }>(
    `INSERT INTO organizations (name, slug) VALUES ('Acme', 'acme') RETURNING id`,
  );
  return orgs[0]!.id;
}

async function insertDoc(orgId: string, filename: string): Promise<string> {
  const users = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
    [`${filename}@test.com`],
  );
  const rows = await query<{ id: string }>(
    `INSERT INTO documents (org_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
     VALUES ($1, $2, $3, 'application/pdf', 10, $4, 'ready') RETURNING id`,
    [orgId, users[0]!.id, filename, `raw-uploads/x/${filename}/a.pdf`],
  );
  return rows[0]!.id;
}

describe.skipIf(!RUN || !URL_LOCAL)('embeddings + hybrid search', () => {
  beforeAll(() => {
    if (!process.env['JWT_PRIVATE_KEY'] || !process.env['JWT_PUBLIC_KEY']) {
      throw new Error('JWT keys must be set for integration tests.');
    }
  });

  beforeEach(async () => {
    await query(
      'TRUNCATE embeddings, ai_analyses, documents, refresh_tokens, invitations, memberships, organizations, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it('embed-worker chunks + stores vectors for a document', async () => {
    const orgId = await seedOrg();
    const docId = await insertDoc(orgId, 'invoice.pdf');

    await embedHandler(
      sqsEventFor({
        source: EVENT_SOURCE,
        'detail-type': DOCUMENT_EXTRACTED,
        detail: { orgId, documentId: docId, textS3Key: 'extracted-text/x/d.txt' },
      }),
      lambdaCtx,
      noCb,
    );

    const count = await new EmbeddingsRepo(orgId).countForDocument(docId);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('hybrid search ranks the semantically-closest document first', async () => {
    const orgId = await seedOrg();
    const invoiceId = await insertDoc(orgId, 'acme.pdf');
    const poemId = await insertDoc(orgId, 'poem.pdf');

    const provider = getAiProvider();
    const repo = new EmbeddingsRepo(orgId);
    const [invoiceVec] = (await provider.embed(['invoice billing payment amount due'])).vectors;
    const [poemVec] = (await provider.embed(['mountains rivers clouds poem nature'])).vectors;
    await repo.replaceForDocument(invoiceId, [
      { chunkIndex: 0, chunkText: 'invoice billing payment amount due', embedding: invoiceVec! },
    ]);
    await repo.replaceForDocument(poemId, [
      { chunkIndex: 0, chunkText: 'mountains rivers clouds poem nature', embedding: poemVec! },
    ]);

    // Query about billing → should rank the invoice first even though neither
    // filename nor query share exact words with the chunk beyond "billing".
    const { vectors } = await provider.embed(['how much money do I owe for billing']);
    const results = await new DocumentsRepo(orgId).hybridSearch({
      q: 'how much money do I owe for billing',
      queryVector: vectors[0]!,
      limit: 10,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe(invoiceId);
  });
});
