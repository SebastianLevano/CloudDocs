import { z } from 'zod';

export const RoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

export const OrgSlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase, hyphen-separated.');

export const OrgPlanSchema = z.enum(['free', 'pro']);
export type OrgPlan = z.infer<typeof OrgPlanSchema>;

export const OrganizationSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  slug: OrgSlugSchema,
  plan: OrgPlanSchema,
  createdAt: z.iso.datetime(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const MembershipSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  role: RoleSchema,
  organization: OrganizationSchema,
});
export type Membership = z.infer<typeof MembershipSchema>;
