/**
 * Shared types for the middleware pipeline. Handlers receive a `Ctx` object
 * that middlewares progressively populate (correlationId from the logger,
 * `user` from `withAuth`, etc.). Keeping the context shape in one place lets
 * us add fields without sprawling generic gymnastics in every handler.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

import type { RequestLogger } from '../lib/logger';
import type { Role } from '@clouddocs/shared-types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  memberships: Array<{ orgId: string; role: Role }>;
}

export interface RequestContext {
  event: APIGatewayProxyEventV2;
  lambdaContext: Context;
  correlationId: string;
  log: RequestLogger;
  /** Populated by `withAuth`. */
  user?: AuthenticatedUser;
  /** Populated by `withJsonBody` / `withValidation`. */
  body?: unknown;
  /** Populated by `withOrgScope`. */
  orgId?: string;
  role?: Role;
}

export type Handler<TResult = APIGatewayProxyResultV2> = (ctx: RequestContext) => Promise<TResult>;

export type Middleware = (next: Handler) => Handler;

/**
 * Composes middlewares left-to-right: `compose(a, b, c)(h) === a(b(c(h)))`.
 * This means the leftmost middleware is the outermost wrapper (runs first on
 * the way in, last on the way out).
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return (handler) => middlewares.reduceRight((next, mw) => mw(next), handler);
}

/**
 * Adapts a {@link Handler} into a raw Lambda handler so API Gateway can call
 * it directly. The composed middleware chain is responsible for building the
 * full {@link RequestContext}.
 */
export type LambdaHandler = (
  event: APIGatewayProxyEventV2,
  context: Context,
) => Promise<APIGatewayProxyResultV2>;
