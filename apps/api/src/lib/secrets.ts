/**
 * Loads a JSON secret from AWS Secrets Manager into `process.env` once per
 * Lambda container (cold-start init pattern from the plan §6.5). Subsequent
 * invocations on a warm container are a no-op — the SDK call only happens
 * on the first request after each cold start.
 *
 * Locally (no `SECRET_ARN` set), this is a silent no-op so `.env.local`
 * stays authoritative for dev.
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let loadPromise: Promise<void> | undefined;

async function loadOnce(): Promise<void> {
  const arn = process.env['SECRET_ARN'];
  if (!arn) return;

  const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'];
  const client = new SecretsManagerClient(region ? { region } : {});
  const result = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!result.SecretString) {
    throw new Error('SECRET_ARN points to a non-string secret; expected JSON.');
  }
  const parsed = JSON.parse(result.SecretString) as Record<string, unknown>;
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string' && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Cached so concurrent invocations during a cold start share one fetch.
 */
export function loadSecretsIntoEnv(): Promise<void> {
  if (!loadPromise) loadPromise = loadOnce();
  return loadPromise;
}
