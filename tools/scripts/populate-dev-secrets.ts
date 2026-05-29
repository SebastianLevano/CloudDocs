/**
 * Uploads DATABASE_URL + JWT_PRIVATE_KEY + JWT_PUBLIC_KEY (required) and
 * OPENAI_API_KEY (optional, Phase 4 AI workers) from `.env.local` into the AWS
 * Secrets Manager secret `clouddocs/{stage}/api`. Run after each CDK deploy
 * that touches the API stack:
 *
 *   AWS_PROFILE=clouddocs-dev pnpm secrets:put:dev
 *
 * Prereqs: `.env.local` exists with the required keys; AWS credentials in
 * scope; the secret already created by CDK.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SecretsManagerClient, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const STAGE = process.env.STAGE ?? 'dev';
const REGION = process.env.AWS_REGION ?? 'sa-east-1';
const SECRET_NAME = `clouddocs/${STAGE}/api`;
const REQUIRED_KEYS = ['DATABASE_URL', 'JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY'] as const;
/** Uploaded only when present in .env.local. */
const OPTIONAL_KEYS = [
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID',
] as const;

function parseEnvLocal(): Record<string, string> {
  const path = resolve(process.cwd(), '.env.local');
  const text = readFileSync(path, 'utf8');
  const env: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip a single layer of surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // dotenv-style escape: \n inside a quoted PEM becomes a real newline.
    value = value.replace(/\\n/g, '\n');
    env[key] = value;
  }
  return env;
}

async function main(): Promise<void> {
  const env = parseEnvLocal();
  const missing = REQUIRED_KEYS.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`.env.local is missing: ${missing.join(', ')}`);
  }
  const payload: Record<string, string> = {};
  for (const key of REQUIRED_KEYS) {
    const value = env[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Refusing to upload empty value for ${key}.`);
    }
    payload[key] = value;
  }
  const uploaded: string[] = [...REQUIRED_KEYS];
  for (const key of OPTIONAL_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value.length > 0) {
      payload[key] = value;
      uploaded.push(key);
    }
  }

  const client = new SecretsManagerClient({ region: REGION });
  await client.send(
    new PutSecretValueCommand({ SecretId: SECRET_NAME, SecretString: JSON.stringify(payload) }),
  );

  console.log(`Updated ${SECRET_NAME} in ${REGION} with: ${uploaded.join(', ')}`);
}

main().catch((err) => {
  console.error('populate-dev-secrets failed:', err);
  process.exit(1);
});
