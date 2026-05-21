import { z } from 'zod';
import { MembershipSchema, OrgSlugSchema } from './orgs';

export const PasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(200, 'Password must be at most 200 characters.');

export const EmailSchema = z.email().max(254);

export const RegisterDtoSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: z.string().min(1).max(120).optional(),
  orgName: z.string().min(1).max(120),
  orgSlug: OrgSlugSchema,
});
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});
export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const PublicUserSchema = z.object({
  id: z.uuid(),
  email: EmailSchema,
  displayName: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const AuthSessionSchema = z.object({
  user: PublicUserSchema,
  memberships: z.array(MembershipSchema),
  tokens: AuthTokensSchema,
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export const MeResponseSchema = z.object({
  user: PublicUserSchema,
  memberships: z.array(MembershipSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
