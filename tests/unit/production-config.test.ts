import { describe, expect, it } from 'vitest';
import { productionConfigErrors } from '../../scripts/check-production-env.mjs';

const valid = {
  DATABASE_URL: 'postgresql://user:password@database.internal/ticket',
  BETTER_AUTH_URL: 'https://tickets.company.com',
  BETTER_AUTH_SECRET: 'a'.repeat(48),
  SES_ACCESS_KEY_ID: 'AKIA_PRODUCTION_FIXTURE',
  SES_SECRET_ACCESS_KEY: 'a'.repeat(40),
  SES_REGION: 'ap-southeast-1',
  EMAIL_FROM: 'TICKET <tickets@company.com>',
  STRIPE_SECRET_KEY: 'sk_live_fixture',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
  R2_ACCESS_KEY_ID: 'fixture',
  R2_SECRET_ACCESS_KEY: 'fixture',
  R2_BUCKET: 'ticket',
  R2_ACCOUNT_ID: 'fixture',
};

describe('production configuration gate', () => {
  it('accepts complete production-shaped configuration without making network requests', () => {
    expect(productionConfigErrors(valid)).toEqual([]);
  });
  it('accepts standard AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY as SES credentials', () => {
    const { SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY, SES_REGION, ...rest } = valid;
    expect(
      productionConfigErrors({
        ...rest,
        AWS_ACCESS_KEY_ID: 'AKIA_AWS_CREDENTIAL',
        AWS_SECRET_ACCESS_KEY: 'b'.repeat(40),
        AWS_REGION: 'ap-southeast-1',
      }),
    ).toEqual([]);
  });
  it('rejects absent providers, test payments, local database and insecure auth', () => {
    const errors = productionConfigErrors({
      ...valid,
      DATABASE_URL: 'postgresql://localhost/ticket',
      BETTER_AUTH_URL: 'http://tickets.company.com',
      STRIPE_SECRET_KEY: 'sk_test_fixture',
      SES_ACCESS_KEY_ID: '',
      SES_SECRET_ACCESS_KEY: '',
      EMAIL_FROM: 'noreply@ticket.invalid',
    });
    expect(errors.join('\n')).toContain('PostgreSQL');
    expect(errors.join('\n')).toContain('HTTPS origin');
    expect(errors.join('\n')).toContain('Live mode');
    expect(errors.join('\n')).toContain('Amazon SES');
    expect(errors.join('\n')).toContain('EMAIL_FROM');
  });
  it('reports variable names without leaking supplied secrets', () => {
    const errors = productionConfigErrors({
      ...valid,
      STRIPE_SECRET_KEY: 'private-invalid-key',
      SES_ACCESS_KEY_ID: 'INVALID_PREFIX_SECRET_KEY',
    });
    expect(errors.join('\n')).not.toContain('private-invalid-key');
    expect(errors.join('\n')).toContain('STRIPE_SECRET_KEY');
    expect(errors.join('\n')).toContain('SES_ACCESS_KEY_ID');
  });
  it('accepts only matching test keys in explicitly selected staging', () => {
    const staging = {
      ...valid,
      TICKET_DEPLOY_ENV: 'staging',
      STRIPE_SECRET_KEY: 'sk_test_fixture',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_fixture',
    };
    expect(productionConfigErrors(staging)).toEqual([]);
    expect(
      productionConfigErrors({ ...staging, STRIPE_PUBLISHABLE_KEY: 'pk_live_fixture' }).join('\n'),
    ).toContain('Test mode');
    expect(productionConfigErrors({ ...staging, STRIPE_LIVE_MODE: 'true' }).join('\n')).toContain(
      'STRIPE_LIVE_MODE',
    );
    expect(
      productionConfigErrors({ ...staging, TICKET_DEPLOY_ENV: 'invalid' }).join('\n'),
    ).toContain('TICKET_DEPLOY_ENV');
    expect(
      productionConfigErrors({ ...staging, TICKET_DEPLOY_ENV: undefined }).join('\n'),
    ).toContain('Live mode');
  });
  it('accepts restricted keys only in their matching environment', () => {
    expect(productionConfigErrors({ ...valid, STRIPE_SECRET_KEY: 'rk_live_fixture' })).toEqual([]);
    const staging = {
      ...valid,
      TICKET_DEPLOY_ENV: 'staging',
      STRIPE_SECRET_KEY: 'rk_test_fixture',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_fixture',
    };
    expect(productionConfigErrors(staging)).toEqual([]);
    expect(
      productionConfigErrors({ ...valid, STRIPE_SECRET_KEY: 'rk_test_fixture' }).join('\n'),
    ).toContain('Live mode');
    expect(
      productionConfigErrors({ ...staging, STRIPE_SECRET_KEY: 'rk_live_fixture' }).join('\n'),
    ).toContain('Test mode');
  });
  it('rejects ENABLE_PAY_TEST=true in production environment', () => {
    const errors = productionConfigErrors({ ...valid, ENABLE_PAY_TEST: 'true' });
    expect(errors.join('\n')).toContain('ENABLE_PAY_TEST must not be true in production');
  });
  it('rejects ENABLE_DEV_MAIL_PREVIEW=true in production environment', () => {
    const errors = productionConfigErrors({ ...valid, ENABLE_DEV_MAIL_PREVIEW: 'true' });
    expect(errors.join('\n')).toContain('ENABLE_DEV_MAIL_PREVIEW must not be true in production');
  });
});
