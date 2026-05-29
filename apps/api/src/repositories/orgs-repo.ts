/**
 * Organizations repository. Globally scoped (slug uniqueness is global), so
 * does not extend {@link OrgScopedRepository}.
 */
import { queryOne, type TxClient } from '../lib/db/client';

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro';
  stripe_customer_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export const OrgsRepo = {
  async findBySlug(slug: string): Promise<OrganizationRow | undefined> {
    return queryOne<OrganizationRow>('SELECT * FROM organizations WHERE slug = $1', [slug]);
  },

  async findById(id: string): Promise<OrganizationRow | undefined> {
    return queryOne<OrganizationRow>('SELECT * FROM organizations WHERE id = $1', [id]);
  },

  async setStripeCustomer(id: string, stripeCustomerId: string): Promise<void> {
    await queryOne('UPDATE organizations SET stripe_customer_id = $2 WHERE id = $1', [
      id,
      stripeCustomerId,
    ]);
  },

  async setPlan(id: string, plan: 'free' | 'pro'): Promise<void> {
    await queryOne('UPDATE organizations SET plan = $2 WHERE id = $1', [id, plan]);
  },

  async create(tx: TxClient, input: { name: string; slug: string }): Promise<OrganizationRow> {
    const rows = await tx.query<OrganizationRow>(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2)
       RETURNING *`,
      [input.name, input.slug],
    );
    const row = rows[0];
    if (!row) throw new Error('Insert into organizations returned no row.');
    return row;
  },
};
