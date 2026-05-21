/**
 * JWT signing and verification using EdDSA (Ed25519) keys via `jose`.
 *
 * - Access tokens: 15 min TTL, carry `sub` (userId), `oid` (active org id) and
 *   `mb` (memberships array). Sent in `Authorization: Bearer <token>`.
 * - Refresh tokens: 30 day TTL, opaque random string (not a JWT) — stored
 *   hashed in `refresh_tokens` so they can be revoked. Generated here for
 *   convenience.
 *
 * Keys are loaded from env at module init. In Lambda these come from Secrets
 * Manager via cold-start env injection.
 */
import { randomBytes, createHash } from 'node:crypto';
import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload, type KeyObject } from 'jose';

import type { Role } from '@clouddocs/shared-types';

const ALG = 'EdDSA';
const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  email: string;
  memberships: Array<{ orgId: string; role: Role }>;
}

let privateKey: KeyObject | CryptoKey | undefined;
let publicKey: KeyObject | CryptoKey | undefined;

async function getPrivateKey(): Promise<KeyObject | CryptoKey> {
  if (privateKey) return privateKey;
  const pem = process.env['JWT_PRIVATE_KEY'];
  if (!pem) throw new Error('JWT_PRIVATE_KEY is not set.');
  privateKey = await importPKCS8(pem, ALG);
  return privateKey;
}

async function getPublicKey(): Promise<KeyObject | CryptoKey> {
  if (publicKey) return publicKey;
  const pem = process.env['JWT_PUBLIC_KEY'];
  if (!pem) throw new Error('JWT_PUBLIC_KEY is not set.');
  publicKey = await importSPKI(pem, ALG);
  return publicKey;
}

export interface SignAccessTokenInput {
  userId: string;
  email: string;
  memberships: Array<{ orgId: string; role: Role }>;
}

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

export async function signAccessToken(input: SignAccessTokenInput): Promise<SignedAccessToken> {
  const expiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000);
  const token = await new SignJWT({
    email: input.email,
    memberships: input.memberships,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setIssuer('clouddocs-api')
    .setAudience('clouddocs-web')
    .sign(await getPrivateKey());
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, await getPublicKey(), {
    issuer: 'clouddocs-api',
    audience: 'clouddocs-web',
  });
  return payload as AccessTokenClaims;
}

/**
 * Generates an opaque refresh token (256 bits, base64url) plus the SHA-256
 * hash to store in the DB. The plaintext token only ever lives in the
 * httpOnly cookie; the DB never sees it.
 */
export function generateRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  return { token, tokenHash, expiresAt };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
