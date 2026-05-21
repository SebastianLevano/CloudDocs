/**
 * Generates an Ed25519 keypair and prints PEM-encoded keys ready to paste into
 * `.env.local` (dev) or upload to AWS Secrets Manager (prod). The private key
 * is PKCS8, public key is SPKI — the formats `jose` expects.
 *
 *   pnpm tsx tools/scripts/generate-jwt-keys.ts
 *   # or, without tsx: node --experimental-strip-types tools/scripts/generate-jwt-keys.ts
 */
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const escapeEnv = (pem: string) => pem.trim().replace(/\n/g, '\\n');

process.stdout.write(`JWT_PRIVATE_KEY="${escapeEnv(privatePem)}"\n`);
process.stdout.write(`JWT_PUBLIC_KEY="${escapeEnv(publicPem)}"\n`);
