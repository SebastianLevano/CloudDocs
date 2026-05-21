/**
 * Argon2id password hashing. Parameters chosen per OWASP 2024 guidance for
 * Argon2id (memory ≥ 19 MiB, time ≥ 2, parallelism = 1) — a comfortable
 * margin above the floor while keeping latency under ~80 ms on Lambda ARM64.
 */
import argon2 from 'argon2';

const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
