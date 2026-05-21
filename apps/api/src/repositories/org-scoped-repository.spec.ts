import { describe, expect, it, vi } from 'vitest';

import { OrgScopedRepository } from './org-scoped-repository';
import type { TxClient } from '../lib/db/client';

class TestRepo extends OrgScopedRepository {
  public callScopedQuery(text: string, params: readonly unknown[] = [], tx?: TxClient) {
    return this.scopedQuery(text, params, tx);
  }
}

describe('OrgScopedRepository', () => {
  it('rejects empty orgId at construction', () => {
    expect(() => new TestRepo('')).toThrow();
  });

  it('prepends the orgId as $1 when running via a transaction client', async () => {
    const tx: TxClient = {
      query: vi.fn(async () => []) as TxClient['query'],
    };
    const repo = new TestRepo('org-123');
    await repo.callScopedQuery('SELECT * FROM docs WHERE org_id = $1 AND id = $2', ['doc-9'], tx);
    expect(tx.query).toHaveBeenCalledWith('SELECT * FROM docs WHERE org_id = $1 AND id = $2', [
      'org-123',
      'doc-9',
    ]);
  });
});
