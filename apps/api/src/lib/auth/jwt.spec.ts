import { generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { generateRefreshToken, hashRefreshToken, signAccessToken, verifyAccessToken } from './jwt';

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  process.env['JWT_PRIVATE_KEY'] = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env['JWT_PUBLIC_KEY'] = publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

describe('access tokens', () => {
  const baseInput = {
    userId: '11111111-1111-1111-1111-111111111111',
    email: 'demo@test.com',
    memberships: [{ orgId: '22222222-2222-2222-2222-222222222222', role: 'owner' as const }],
  };

  it('signs and verifies a token round trip', async () => {
    const { token, expiresAt } = await signAccessToken(baseInput);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe(baseInput.userId);
    expect(claims.email).toBe(baseInput.email);
    expect(claims.memberships).toEqual(baseInput.memberships);
  });

  it('rejects a tampered token', async () => {
    const { token } = await signAccessToken(baseInput);
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });
});

describe('refresh tokens', () => {
  it('produces a token + hash + future expiry', () => {
    const { token, tokenHash, expiresAt } = generateRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rehashes the same token deterministically', () => {
    const { token, tokenHash } = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(tokenHash);
  });
});
