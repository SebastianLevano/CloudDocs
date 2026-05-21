/**
 * Base class for repositories whose every query MUST filter by `org_id`.
 *
 * The plan calls this out as the primary cross-tenant safeguard (§13, §16):
 * forgetting a `WHERE org_id = $orgId` is the easiest way to leak data
 * between tenants. Subclasses use {@link scopedQuery} which always prepends
 * the org filter and parameter, so writing the wrong filter manually is hard.
 */
import { query, type TxClient } from '../lib/db/client';

type Row = Record<string, unknown>;

export abstract class OrgScopedRepository {
  constructor(protected readonly orgId: string) {
    if (!orgId) throw new Error('OrgScopedRepository requires a non-empty orgId.');
  }

  /**
   * Run a SELECT/UPDATE that is constrained to this org. Callers write the
   * query body and reference the org via `$1`; additional params start at
   * `$2`.
   *
   * Example:
   *   scopedQuery('SELECT * FROM documents WHERE org_id = $1 AND id = $2', [docId])
   */
  protected async scopedQuery<T extends Row = Row>(
    text: string,
    params: readonly unknown[] = [],
    tx?: TxClient,
  ): Promise<T[]> {
    const runner = tx ? tx.query.bind(tx) : query;
    return runner<T>(text, [this.orgId, ...params]);
  }
}
