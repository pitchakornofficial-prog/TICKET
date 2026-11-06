import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/webhooks/stripe/route';
import * as paymentModule from '../../src/server/payment';
import { generateStripeSignatureHeader } from '../../src/server/stripe';

vi.mock('@/server/database', () => ({
  getDatabasePool: () => ({}),
}));

describe('POST /api/webhooks/stripe Route Security (Fail-Closed)', () => {
  const originalEnv = { ...process.env };
  const mockSecret = 'whsec_custom_secure_secret_12345';

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('fails closed (500) when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const processSpy = vi.spyOn(paymentModule, 'processStripeSuccessEvent');

    const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
    const request = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1730300000,v1=any_signature',
      },
      body: rawBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe('Stripe webhook secret is not configured');
    expect(processSpy).not.toHaveBeenCalled();
  });

  it('rejects (400) when stripe-signature header is missing', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = mockSecret;

    const processSpy = vi.spyOn(paymentModule, 'processStripeSuccessEvent');

    const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
    const request = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('Missing Stripe-Signature header');
    expect(processSpy).not.toHaveBeenCalled();
  });

  it('rejects (400) when signature does not match configured secret', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = mockSecret;

    const processSpy = vi.spyOn(paymentModule, 'processStripeSuccessEvent');

    const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
    const forgedHeader = generateStripeSignatureHeader(rawBody, 'wrong_secret');

    const request = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': forgedHeader,
      },
      body: rawBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('No matching signature found');
    expect(processSpy).not.toHaveBeenCalled();
  });

  it('processes event (200) when signature matches configured secret', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = mockSecret;

    const mockEvent = {
      id: 'evt_1',
      type: 'payment_intent.succeeded' as const,
      data: {
        object: {
          id: 'pi_test_123',
          object: 'payment_intent' as const,
          amount: 150000,
          amount_received: 150000,
          currency: 'thb',
          status: 'succeeded' as const,
          client_secret: 'pi_test_123_secret',
          livemode: false,
          payment_method_types: ['promptpay'],
          created: 1730300000,
        },
      },
      livemode: false,
      created: 1730300000,
      api_version: '2024-06-20',
    };

    const processSpy = vi.spyOn(paymentModule, 'processStripeSuccessEvent').mockResolvedValue({
      success: true,
      status: 'paid',
      orderId: 'ORD-001',
      tickets: [{ id: 'TKT-1' } as never],
      duplicate: false,
      message: 'Tickets issued successfully',
    });

    const rawBody = JSON.stringify(mockEvent);
    const validHeader = generateStripeSignatureHeader(rawBody, mockSecret);

    const request = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': validHeader,
      },
      body: rawBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.received).toBe(true);
    expect(data.status).toBe('paid');
    expect(data.orderId).toBe('ORD-001');
    expect(data.ticketCount).toBe(1);
    expect(processSpy).toHaveBeenCalledTimes(1);
  });
});
