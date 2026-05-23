/**
 * Argon2id password hashing via `hash-wasm`.
 *
 * Why `hash-wasm` over native argon2 libs (`argon2`, `@node-rs/argon2`):
 *   - Pure WASM with the binary inlined as base64. `esbuild --bundle` packs
 *     it as plain JS, so there's nothing platform-specific in the Lambda
 *     deployment — no Docker bundling, no Lambda Layer.
 *   - Same algorithm (Argon2id, RFC 9106), same PHC-encoded output:
 *     `$argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>`.
 *
 * Performance trade-off: ~2-3× slower than native argon2 (~200 ms on
 * Lambda Graviton vs ~70 ms). Acceptable for auth flows in a portfolio /
 * MVP; if traffic grows, swap to `@node-rs/argon2` with a Lambda Layer.
 *
 * Parameters: OWASP 2024 floor for Argon2id (memory ≥ 19 MiB, iterations
 * ≥ 2, parallelism = 1) with comfortable margin: 64 MiB / 3 iters / 1
 * thread.
 */
import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

const PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 64 * 1024, // KiB
  hashLength: 32,
  outputType: 'encoded' as const,
};
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  return argon2id({ password, salt, ...PARAMS });
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash: storedHash });
  } catch {
    return false;
  }
}
