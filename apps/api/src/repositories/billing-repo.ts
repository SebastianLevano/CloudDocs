import type { Subscription, Usage } from '@clouddocs/shared-types';
import { PLAN_LIMITS } from '@clouddocs/shared-types';

import { query, queryOne } from '../lib/db/client';
import { OrgsRepo } from './orgs-repo';

export type SubscriptionRow = {
  id: string;
  org_id: string;
  stripe_sub_id: string;
  stripe_price_id: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  current_period_end: Date;
  created_at: Date;
  updated_at: Date;
};

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    orgId: row.org_id,
    stripeSubId: row.stripe_sub_id,
    stripePriceId: row.stripe_price_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function periodStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export const BillingRepo = {
  /** Atomically increment docs_uploaded for this org's current month. */
  async incrementDocs(orgId: string, delta = 1): Promise<void> {
    await query(
      `INSERT INTO usage_counters (org_id, period_start, docs_uploaded)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, period_start)
       DO UPDATE SET docs_uploaded = usage_counters.docs_uploaded + $3`,
      [orgId, periodStart(), delta],
    );
  },

  /** Atomically increment ai_analyses for this org's current month. */
  async incrementAiAnalyses(orgId: string, delta = 1): Promise<void> {
    await query(
      `INSERT INTO usage_counters (org_id, period_start, ai_analyses)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, period_start)
       DO UPDATE SET ai_analyses = usage_counters.ai_analyses + $3`,
      [orgId, periodStart(), delta],
    );
  },

  /** Atomically adjust storage_bytes for this org's current month. */
  async adjustStorage(orgId: string, bytes: number): Promise<void> {
    await query(
      `INSERT INTO usage_counters (org_id, period_start, storage_bytes)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, period_start)
       DO UPDATE SET storage_bytes = GREATEST(0, usage_counters.storage_bytes + $3)`,
      [orgId, periodStart(), bytes],
    );
  },

  /** Get current month's usage counters for an org. */
  async getUsage(orgId: string): Promise<Usage> {
    const org = await OrgsRepo.findById(orgId);
    if (!org) throw new Error(`Organization ${orgId} not found.`);

    const period = periodStart();
    const row = await queryOne<{
      docs_uploaded: string;
      ai_analyses: string;
      storage_bytes: string;
    }>(
      `SELECT docs_uploaded, ai_analyses, storage_bytes
       FROM usage_counters
       WHERE org_id = $1 AND period_start = $2`,
      [orgId, period],
    );

    const plan = org.plan as 'free' | 'pro';
    return {
      plan,
      period,
      docsUploaded: Number(row?.docs_uploaded ?? 0),
      aiAnalyses: Number(row?.ai_analyses ?? 0),
      storageBytes: Number(row?.storage_bytes ?? 0),
      limits: PLAN_LIMITS[plan],
    };
  },

  /** True if the org has NOT exceeded its monthly doc upload limit. */
  async canUploadDoc(orgId: string): Promise<boolean> {
    const usage = await this.getUsage(orgId);
    return usage.docsUploaded < usage.limits.docsPerMonth;
  },

  /** Upsert a subscription row from a Stripe event. */
  async upsertSubscription(input: {
    orgId: string;
    stripeSubId: string;
    stripePriceId: string;
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    currentPeriodEnd: Date;
  }): Promise<Subscription> {
    const rows = await query<SubscriptionRow>(
      `INSERT INTO subscriptions (org_id, stripe_sub_id, stripe_price_id, status, current_period_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (org_id)
       DO UPDATE SET
         stripe_sub_id      = EXCLUDED.stripe_sub_id,
         stripe_price_id    = EXCLUDED.stripe_price_id,
         status             = EXCLUDED.status,
         current_period_end = EXCLUDED.current_period_end,
         updated_at         = now()
       RETURNING *`,
      [input.orgId, input.stripeSubId, input.stripePriceId, input.status, input.currentPeriodEnd],
    );
    const row = rows[0];
    if (!row) throw new Error('Upsert subscription returned no row.');
    return toSubscription(row);
  },

  async getSubscription(orgId: string): Promise<Subscription | undefined> {
    const row = await queryOne<SubscriptionRow>('SELECT * FROM subscriptions WHERE org_id = $1', [
      orgId,
    ]);
    return row ? toSubscription(row) : undefined;
  },
};
