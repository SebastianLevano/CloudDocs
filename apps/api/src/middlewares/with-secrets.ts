/**
 * Wraps a Lambda handler so AWS Secrets Manager values are loaded into
 * `process.env` before the handler runs. Outermost-of-outermost: composes
 * with raw `LambdaHandler`, not with the inner middleware `Handler`.
 *
 * On warm containers, the load is a no-op (cached promise).
 */
import { loadSecretsIntoEnv } from '../lib/secrets';
import type { LambdaHandler } from './types';

export function withSecrets(handler: LambdaHandler): LambdaHandler {
  return async (event, context) => {
    await loadSecretsIntoEnv();
    return handler(event, context);
  };
}
