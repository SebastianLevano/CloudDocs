import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('clouddocs-api'),
  version: z.string(),
  timestamp: z.string(),
  requestId: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
