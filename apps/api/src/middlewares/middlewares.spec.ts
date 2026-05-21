import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import { ConflictError, ValidationError } from '../lib/errors';
import { compose } from './types';
import { withErrorHandler } from './with-error-handler';
import { withJsonBody } from './with-json-body';
import { withRequestLogger } from './with-request-logger';
import { withValidation } from './with-validation';

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

describe('ValidationError instance', () => {
  it('carries the right statusCode + code', () => {
    const err = new ValidationError('Bad body.');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('validation_error');
  });
});
