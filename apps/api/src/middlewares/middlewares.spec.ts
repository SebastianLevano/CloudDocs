import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import { ConflictError, ValidationError } from '../lib/errors';
import { compose } from './types';
import { withErrorHandler } from './with-error-handler';
import { withJsonBody } from './with-json-body';
import { withRequestLogger } from './with-request-logger';
import { withValidation } from './with-validation';
import { withCsrf } from './with-csrf';
import { withActiveOrg } from './with-active-org';
import type { AuthenticatedContext } from './with-auth';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    routeKey: 'POST /v1/test',
    rawPath: '/v1/test',
    requestContext: {
      http: { method: 'POST', path: '/v1/test', protocol: 'HTTP/2', sourceIp: 'x', userAgent: 'x' },
    },
    headers: {},
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

const fakeContext = { awsRequestId: 'corr-1' } as Context;

describe('compose', () => {
  it('chains middlewares left-to-right (outer-first)', async () => {
    const calls: string[] = [];
    const mw = (label: string) => (next: any) => async (ctx: any) => {
      calls.push(`${label}:before`);
      const out = await next(ctx);
      calls.push(`${label}:after`);
      return out;
    };
    const handler = compose(
      mw('a'),
      mw('b'),
      mw('c'),
    )(async () => {
      calls.push('handler');
      return { statusCode: 200, body: '' };
    });
    await handler({
      event: {} as APIGatewayProxyEventV2,
      lambdaContext: fakeContext,
      correlationId: 'x',
      log: { info: () => undefined, error: () => undefined } as any,
    });
    expect(calls).toEqual([
      'a:before',
      'b:before',
      'c:before',
      'handler',
      'c:after',
      'b:after',
      'a:after',
    ]);
  });
});

describe('withErrorHandler', () => {
  it('maps AppError subclasses to their statusCode and code', async () => {
    const handler = withRequestLogger(
      compose(withErrorHandler)(async () => {
        throw new ConflictError('Email already in use.');
      }),
    );
    const result: any = await handler(makeEvent(), fakeContext);
    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('conflict');
    expect(body.error.correlationId).toBe('corr-1');
  });

  it('maps unknown errors to a 500 internal_error', async () => {
    const handler = withRequestLogger(
      compose(withErrorHandler)(async () => {
        throw new Error('boom');
      }),
    );
    const result: any = await handler(makeEvent(), fakeContext);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error.code).toBe('internal_error');
  });
});

describe('withJsonBody + withValidation', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('parses JSON body and runs schema validation', async () => {
    const handlerSpy = vi.fn(async (ctx: any) => ({
      statusCode: 200,
      body: JSON.stringify({ ok: true, name: ctx.body.name }),
    }));
    const handler = withRequestLogger(
      compose(withErrorHandler, withJsonBody)(withValidation(schema, handlerSpy)),
    );
    const result: any = await handler(
      makeEvent({ body: JSON.stringify({ name: 'Sebastián' }) }),
      fakeContext,
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).name).toBe('Sebastián');
    expect(handlerSpy).toHaveBeenCalled();
  });

  it('rejects malformed JSON with a 400 ValidationError', async () => {
    const handler = withRequestLogger(
      compose(
        withErrorHandler,
        withJsonBody,
      )(withValidation(schema, async () => ({ statusCode: 200, body: '' }))),
    );
    const result: any = await handler(makeEvent({ body: 'not-json' }), fakeContext);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('validation_error');
  });

  it('rejects schema mismatches with the validation issues attached', async () => {
    const handler = withRequestLogger(
      compose(
        withErrorHandler,
        withJsonBody,
      )(withValidation(schema, async () => ({ statusCode: 200, body: '' }))),
    );
    const result: any = await handler(
      makeEvent({ body: JSON.stringify({ name: '' }) }),
      fakeContext,
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('validation_error');
    expect(Array.isArray(body.error.details)).toBe(true);
  });
});

describe('withCsrf', () => {
  const ok = async () => ({ statusCode: 204 });

  it('rejects requests without the X-CDX-Client header (403 forbidden)', async () => {
    const handler = withRequestLogger(compose(withErrorHandler, withCsrf)(ok));
    const result: any = await handler(makeEvent({ headers: {} }), fakeContext);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error.code).toBe('forbidden');
  });

  it('rejects an empty header value', async () => {
    const handler = withRequestLogger(compose(withErrorHandler, withCsrf)(ok));
    const result: any = await handler(
      makeEvent({ headers: { 'x-cdx-client': '  ' } }),
      fakeContext,
    );
    expect(result.statusCode).toBe(403);
  });

  it('passes through when the header is present', async () => {
    const handler = withRequestLogger(compose(withErrorHandler, withCsrf)(ok));
    const result: any = await handler(
      makeEvent({ headers: { 'x-cdx-client': 'web' } }),
      fakeContext,
    );
    expect(result.statusCode).toBe(204);
  });
});

describe('withActiveOrg', () => {
  const ORG_A = '11111111-1111-4111-8111-111111111111';
  const ORG_B = '22222222-2222-4222-8222-222222222222';

  function ctxWith(
    memberships: Array<{ orgId: string; role: 'owner' | 'admin' | 'member' | 'viewer' }>,
    headers: Record<string, string> = {},
  ): AuthenticatedContext {
    return {
      event: makeEvent({ headers }),
      lambdaContext: fakeContext,
      correlationId: 'x',
      log: { info: () => undefined, error: () => undefined } as any,
      user: { id: 'u1', email: 'u@test.com', memberships },
    } as AuthenticatedContext;
  }

  const echoOrg = withActiveOrg(async (ctx) => ({
    statusCode: 200,
    body: JSON.stringify({ orgId: ctx.orgId, role: ctx.role }),
  }));

  it('resolves the org from the X-Org-Id header and checks membership', async () => {
    const res: any = await echoOrg(
      ctxWith(
        [
          { orgId: ORG_A, role: 'owner' },
          { orgId: ORG_B, role: 'viewer' },
        ],
        { 'x-org-id': ORG_B },
      ),
    );
    expect(JSON.parse(res.body)).toEqual({ orgId: ORG_B, role: 'viewer' });
  });

  it('falls back to the sole membership when no header is sent', async () => {
    const res: any = await echoOrg(ctxWith([{ orgId: ORG_A, role: 'owner' }]));
    expect(JSON.parse(res.body).orgId).toBe(ORG_A);
  });

  it('rejects an org the user is not a member of (403)', async () => {
    await expect(
      echoOrg(ctxWith([{ orgId: ORG_A, role: 'owner' }], { 'x-org-id': ORG_B })),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('400s when multiple memberships and no header (ambiguous)', async () => {
    await expect(
      echoOrg(
        ctxWith([
          { orgId: ORG_A, role: 'owner' },
          { orgId: ORG_B, role: 'member' },
        ]),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('ValidationError instance', () => {
  it('carries the right statusCode + code', () => {
    const err = new ValidationError('Bad body.');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('validation_error');
  });
});
