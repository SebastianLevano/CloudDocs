/**
 * Database client — single facade over either `pg` (local Docker) or
 * `@neondatabase/serverless` (Lambda + Neon). Both expose pg-compatible APIs,
 * so callers always see the same {@link query} and {@link withTransaction}
 * helpers.
 *
 * The pool is built lazily on first use so Lambda cold starts can read
 * `DATABASE_URL` from Secrets Manager during init before any handler runs.
 */
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';

// Rows come from pg/Neon as plain objects. We deliberately do NOT constrain
// them to `Record<string, unknown>` so callers can declare strongly-typed row
// interfaces (e.g. `UserRow`) without adding noise index signatures.
type Row = object;

interface PoolLike {
  query<T = unknown>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  connect(): Promise<ClientLike>;
  end(): Promise<void>;
}

interface ClientLike {
  query<T = unknown>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  release(): void;
}

export interface TxClient {
  query<T extends Row = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
}

let pool: PoolLike | undefined;

const LOCAL_HOST_RE = /(?:^|@|\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|\/|$)/;

function isLocalUrl(url: string): boolean {
  return LOCAL_HOST_RE.test(url);
}

function buildPool(): PoolLike {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Configure it via .env.local locally or Secrets Manager in Lambda.',
    );
  }

  if (isLocalUrl(url)) {
    return new PgPool({ connectionString: url, max: 5 }) as unknown as PoolLike;
  }

  // Neon's WebSocket driver auto-detects Node 22's native WebSocket. We only
  // need to opt in to pooled queries-over-HTTP for the single-shot case.
  neonConfig.poolQueryViaFetch = true;
  return new NeonPool({ connectionString: url }) as unknown as PoolLike;
}

export function getPool(): PoolLike {
  if (!pool) pool = buildPool();
  return pool;
}

export async function query<T extends Row = Row>(
  text: string,
  params?: readonly unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends Row = Row>(
  text: string,
  params?: readonly unknown[],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const txClient: TxClient = {
      async query<R extends Row = Row>(text: string, params?: readonly unknown[]): Promise<R[]> {
        const result = await client.query<R>(text, params);
        return result.rows;
      },
    };
    const out = await fn(txClient);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test/teardown helper. Closes the pool so the process can exit cleanly. Safe
 * to call when no pool was ever created.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
