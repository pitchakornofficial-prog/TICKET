import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStripeClient, HttpStripeClient, isStripeLiveMode, resetStripeClient } from '../../src/server/stripe';

afterEach(() => {
  resetStripeClient();
  vi.unstubAllEnvs();
});

describe('restricted Stripe keys', () => {
  it('uses the real Stripe client and live safeguards for live restricted keys', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_live_fixture');
    vi.stubEnv('STRIPE_LIVE_MODE', 'false');
    expect(getStripeClient()).toBeInstanceOf(HttpStripeClient);
    expect(isStripeLiveMode()).toBe(true);
    expect(getStripeClient().isLiveMode()).toBe(true);
  });

  it('uses the real Stripe client without live mode for test restricted keys', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture');
    vi.stubEnv('STRIPE_LIVE_MODE', 'false');
    expect(getStripeClient()).toBeInstanceOf(HttpStripeClient);
    expect(isStripeLiveMode()).toBe(false);
    expect(getStripeClient().isLiveMode()).toBe(false);
  });
});
