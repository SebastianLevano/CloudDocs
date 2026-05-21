import { describe, expect, it } from 'vitest';

import { LoginDtoSchema, RegisterDtoSchema } from './auth';
import { OrgSlugSchema } from './orgs';

describe('RegisterDtoSchema', () => {
  const valid = {
    email: 'demo@test.com',
    password: 'correct-horse-battery-staple',
    orgName: 'Acme Corp',
    orgSlug: 'acme-corp',
  };

  it('accepts a well-formed payload', () => {
    expect(RegisterDtoSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects short passwords', () => {
    expect(RegisterDtoSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });

  it('rejects malformed emails', () => {
    expect(RegisterDtoSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });
});

describe('LoginDtoSchema', () => {
  it('accepts minimal valid input', () => {
    expect(LoginDtoSchema.safeParse({ email: 'demo@test.com', password: 'x' }).success).toBe(true);
  });
});

describe('OrgSlugSchema', () => {
  it.each([
    ['acme', true],
    ['acme-corp', true],
    ['acme-corp-2', true],
    ['Acme', false],
    ['acme_corp', false],
    ['ac', false],
    ['-acme', false],
  ])('slug "%s" → valid=%s', (slug, expected) => {
    expect(OrgSlugSchema.safeParse(slug).success).toBe(expected);
  });
});
