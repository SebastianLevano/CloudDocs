/**
 * Structured logger built on `pino`. Every entry gets `service`, the Lambda
 * request id (when available) and any contextual fields callers attach via
 * {@link createLogger}.
 *
 * In CloudWatch, pino's JSON output is parsed automatically, so we keep the
 * format minimal — no pretty transports in prod.
 */
import { pino, type Logger } from 'pino';

const base = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  base: { service: 'clouddocs-api' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash'],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type RequestLogger = Logger;

export function createLogger(bindings: Record<string, unknown> = {}): RequestLogger {
  return base.child(bindings);
}
