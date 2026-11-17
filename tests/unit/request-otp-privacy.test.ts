import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequestGuestOtp = vi.fn();
const mockRequestOrderLookupOtp = vi.fn();
const mockVerifyQueueAccess = vi.fn();

vi.mock('@/server/database', () => ({ getDatabasePool: () => ({}) }));
vi.mock('@/server/guest-otp', () => ({
  extractClientIp: () => '127.0.0.1',
  requestGuestOtp: (...args: unknown[]) => mockRequestGuestOtp(...args),
}));
vi.mock('@/server/queue', () => ({ verifyQueueAccess: (...args: unknown[]) => mockVerifyQueueAccess(...args) }));
vi.mock('@/server/guest-order-lookup', () => ({
  requestOrderLookupOtp: (...args: unknown[]) => mockRequestOrderLookupOtp(...args),
}));

import { POST as requestCheckoutOtp } from '../../src/app/api/public/checkout/request-otp/route';
import { POST as requestOrderLookupOtp } from '../../src/app/api/public/orders/request-lookup-otp/route';

describe('OTP request response privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    mockVerifyQueueAccess.mockResolvedValue(true);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('does not expose buyer-specific cooldown or attempt state on checkout OTP requests', async () => {
    const body = {
      buyer: { name: 'Buyer', email: 'buyer@example.test', phone: '0812345678' },
      purpose: 'checkout',
    };
    mockRequestGuestOtp.mockResolvedValueOnce({ success: true, requestId: 'issued-request', cooldownSeconds: 17, expiresInSeconds: 210 });
    const success = await requestCheckoutOtp(new Request('http://localhost/api/public/checkout/request-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    mockRequestGuestOtp.mockResolvedValueOnce({
      success: false,
      error: 'wait 44 seconds',
      code: 'COOLDOWN',
      cooldownSeconds: 44,
    });
    const throttled = await requestCheckoutOtp(new Request('http://localhost/api/public/checkout/request-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));

    expect(success.status).toBe(200);
    expect(throttled.status).toBe(200);
    const successBody = await success.json();
    const throttledBody = await throttled.json();
    expect(successBody.message).toBe(throttledBody.message);
    expect(Object.keys(successBody).sort()).toEqual(Object.keys(throttledBody).sort());
    expect(successBody).not.toHaveProperty('code');
    expect(throttledBody).not.toHaveProperty('code');
    expect(successBody.cooldownSeconds).toBe(60);
    expect(throttledBody.cooldownSeconds).toBe(60);
    expect(throttled.headers.get('Cache-Control')).toBe('private, no-store, no-cache, must-revalidate');
  });

  it('uses the same public response for matching and non-matching order lookup requests', async () => {
    const body = { email: 'buyer@example.test', phone: '0812345678' };
    mockRequestOrderLookupOtp.mockResolvedValueOnce({ success: true, requestId: 'issued-request', cooldownSeconds: 12, expiresInSeconds: 180 });
    const found = await requestOrderLookupOtp(new Request('http://localhost/api/public/orders/request-lookup-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    mockRequestOrderLookupOtp.mockResolvedValueOnce({
      success: false,
      error: 'order does not exist',
      code: 'NOT_FOUND',
    });
    const missing = await requestOrderLookupOtp(new Request('http://localhost/api/public/orders/request-lookup-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));

    expect(found.status).toBe(200);
    expect(missing.status).toBe(200);
    const foundBody = await found.json();
    const missingBody = await missing.json();
    expect(foundBody.success).toBe(missingBody.success);
    expect(foundBody.message).toBe(missingBody.message);
    expect(Object.keys(foundBody).sort()).toEqual(Object.keys(missingBody).sort());
    expect(missingBody).not.toHaveProperty('code');
    expect(missingBody).not.toHaveProperty('error');
    expect(missing.headers.get('Cache-Control')).toBe('private, no-store, no-cache, must-revalidate');
  });
});
