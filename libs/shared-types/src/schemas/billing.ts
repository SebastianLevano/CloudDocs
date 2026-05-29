import { z } from 'zod';

export const PLAN_LIMITS = {
  free: {
    docsPerMonth: 10,
    aiAnalysesPerMonth: 50,
    storageBytes: 100 * 1024 * 1024, // 100 MB
  },
  pro: {
    docsPerMonth: 500,
    aiAnalysesPerMonth: 5000,
    storageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
  },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export const PlanSchema = z.enum(['free', 'pro']);

export const UsageSchema = z.object({
  plan: PlanSchema,
  period: z.string(), // YYYY-MM-DD (first day of month)
  docsUploaded: z.number().int().nonnegative(),
  aiAnalyses: z.number().int().nonnegative(),
  storageBytes: z.number().int().nonnegative(),
  limits: z.object({
    docsPerMonth: z.number().int(),
    aiAnalysesPerMonth: z.number().int(),
    storageBytes: z.number().int(),
  }),
});
export type Usage = z.infer<typeof UsageSchema>;

export const SubscriptionSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  stripeSubId: z.string(),
  stripePriceId: z.string(),
  status: z.enum(['active', 'past_due', 'canceled', 'trialing']),
  currentPeriodEnd: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const CheckoutResponseSchema = z.object({
  url: z.string().url(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const PortalResponseSchema = z.object({
  url: z.string().url(),
});
export type PortalResponse = z.infer<typeof PortalResponseSchema>;
