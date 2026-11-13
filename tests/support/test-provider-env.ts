/**
 * Clears real external provider credentials in Vitest runs so `.env.local`
 * values (SES, Stripe, R2) never trigger live third-party API calls during tests.
 */
export const ISOLATED_TEST_PROVIDER_ENV = {
  STRIPE_SECRET_KEY: '',
  STRIPE_PUBLISHABLE_KEY: '',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  STRIPE_LIVE_MODE: 'false',
  RESEND_API_KEY: '',
  SES_ACCESS_KEY_ID: '',
  SES_SECRET_ACCESS_KEY: '',
  SES_REGION: '',
  AWS_ACCESS_KEY_ID: '',
  AWS_SECRET_ACCESS_KEY: '',
  AWS_REGION: '',
  EMAIL_FROM: '',
  R2_ACCOUNT_ID: '',
  R2_ACCESS_KEY_ID: '',
  R2_SECRET_ACCESS_KEY: '',
  R2_BUCKET: '',
  R2_ENDPOINT: '',
  R2_PUBLIC_BASE_URL: '',
} as const;
