import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordDelivery: vi.fn(),
  updateDelivery: vi.fn(),
  processEvent: vi.fn(),
  verifySignature: vi.fn(),
  pool: {},
}));

vi.mock('@/server/database', () => ({ getDatabasePool: () => mocks.pool }));
vi.mock('@/server/payment', () => ({
  recordStripeWebhookDelivery: mocks.recordDelivery,
  updateStripeWebhookDelivery: mocks.updateDelivery,
  processStripeSuccessEvent: mocks.processEvent,
}));
vi.mock('@/server/stripe', () => ({
  verifyStripeWebhookSignature: mocks.verifySignature,
}));

import { POST } from '../../src/app/api/webhooks/stripe/route';

const event = {
  id: 'evt_durable_1',
  type: 'payment_intent.succeeded',
  created: 1_800_000_000,
  livemode: false,
  data: { object: { id: 'pi_durable_1' } },
};

function webhookRequest() {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'valid-signature' },
    body: JSON.stringify(event),
  });
}

describe('Stripe webhook durable retry handling', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    mocks.recordDelivery.mockReset().mockResolvedValue('pending_review');
    mocks.updateDelivery.mockReset().mockResolvedValue(undefined);
    mocks.processEvent.mockReset();
    mocks.verifySignature.mockReset().mockReturnValue({ valid: true });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('persists the signed raw event before returning retryable 503 for pending review', async () => {
    mocks.processEvent.mockResolvedValue({
      success: false,
      status: 'pending_review',
      message: 'Stripe lookup timed out',
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordDelivery).toHaveBeenCalledWith(mocks.pool, event, JSON.stringify(event));
    expect(mocks.recordDelivery.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.processEvent.mock.invocationCallOrder[0],
    );
    expect(mocks.updateDelivery).toHaveBeenCalledWith(
      mocks.pool,
      event.id,
      'pending_review',
      'Stripe lookup timed out',
    );
  });

  it('leaves a durable pending review record and asks Stripe to retry after a processing exception', async () => {
    mocks.processEvent.mockRejectedValue(new Error('database transaction failed'));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordDelivery).toHaveBeenCalledOnce();
    expect(mocks.updateDelivery).toHaveBeenCalledWith(
      mocks.pool,
      event.id,
      'pending_review',
      'database transaction failed',
    );
  });

  it('does not process a delivery that is already durably completed', async () => {
    mocks.recordDelivery.mockResolvedValue('processed');

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.processEvent).not.toHaveBeenCalled();
  });
});
