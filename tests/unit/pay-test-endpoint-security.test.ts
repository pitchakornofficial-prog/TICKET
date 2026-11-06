import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST as handlePayTest } from '../../src/app/api/public/checkout/orders/[id]/pay-test/route';
import { getStripeClient, StripeContractDouble } from '../../src/server/stripe';
import type { PaymentChargeDetail, ProcessStripeEventResult } from '../../src/server/payment';

let mockCharge: PaymentChargeDetail | null = null;
let mockProcessResult: ProcessStripeEventResult = { status: 'paid', success: true, message: 'Success' };
let mockGetPaymentChargeThrows: Error | null = null;

vi.mock('@/server/database', () => ({
  getDatabasePool: () => ({}),
}));

vi.mock('@/server/payment', () => ({
  getPaymentChargeForOrder: async (_pool: unknown, _orderId: string, verifiedToken?: string) => {
    if (mockGetPaymentChargeThrows) {
      throw mockGetPaymentChargeThrows;
    }
    if (!verifiedToken) {
      return null;
    }
    return mockCharge;
  },
  processStripeSuccessEvent: async () => mockProcessResult,
}));

describe('POST /api/public/checkout/orders/[id]/pay-test Security Gate', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockGetPaymentChargeThrows = null;
    mockCharge = {
      id: 'ch_test_mock_123',
      orderId: 'ORD-SEC-001',
      amount: 150000,
      currency: 'thb',
      status: 'pending',
      qrCodeUrl: 'https://example.com/qr',
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      createdAt: new Date().toISOString(),
      livemode: false,
    };
    mockProcessResult = { status: 'paid', success: true, message: 'Success' };
    const stripe = getStripeClient();
    if (stripe instanceof StripeContractDouble) {
      stripe.setLiveMode(false);
    }
  });

  it('rejects in Live Mode with 403 (AC-123)', async () => {
    const stripe = getStripeClient() as StripeContractDouble;
    stripe.setLiveMode(true);

    try {
      const res = await handlePayTest(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/pay-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verifiedToken: 'valid-token' }),
        }),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toContain('Live Mode');
    } finally {
      stripe.setLiveMode(false);
    }
  });

  it('rejects in Production environment with 404', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENABLE_PAY_TEST', 'true');

    const res = await handlePayTest(
      new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/pay-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guest-token': 'valid-token',
        },
        body: JSON.stringify({ verifiedToken: 'valid-token' }),
      }),
      { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toContain('Production');
  });

  it('rejects when ENABLE_PAY_TEST is not true with 403', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_PAY_TEST', 'false');

    const res = await handlePayTest(
      new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/pay-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guest-token': 'valid-token',
        },
        body: JSON.stringify({ verifiedToken: 'valid-token' }),
      }),
      { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
    );

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.message).toContain('ENABLE_PAY_TEST');
  });

  it('rejects when order token / guest OTP token is missing with 403', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_PAY_TEST', 'true');

    const res = await handlePayTest(
      new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/pay-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
    );

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.message).toContain('order token หรือยืนยันตัวตนผ่าน OTP');
  });

  it('rejects when guest token does not own the order with 403', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_PAY_TEST', 'true');
    mockGetPaymentChargeThrows = new Error('ท่านไม่มีสิทธิ์ในการเข้าถึงข้อมูลการชำระเงินสำหรับคำสั่งซื้อนี้');

    const res = await handlePayTest(
      new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/pay-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guest-token': 'attacker-token',
        },
        body: JSON.stringify({ verifiedToken: 'attacker-token' }),
      }),
      { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
    );

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.message).toContain('สิทธิ์');
  });

  it('accepts simulation when ENABLE_PAY_TEST=true and valid guest token is provided', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_PAY_TEST', 'true');

    const stripe = getStripeClient();
    if (stripe instanceof StripeContractDouble) {
      const intent = await stripe.createPromptPayIntent({
        orderId: 'ORD-SEC-001',
        amountSatang: 150000,
        buyerEmail: 'test@buyer.com',
      });
      if (mockCharge) {
        mockCharge.id = intent.id;
      }
    }

    const res = await handlePayTest(
      new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/pay-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guest-token': 'valid-guest-token',
        },
        body: JSON.stringify({ verifiedToken: 'valid-guest-token' }),
      }),
      { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('paid');
  });
});
