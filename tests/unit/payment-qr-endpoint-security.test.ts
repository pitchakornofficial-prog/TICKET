import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET, POST } from '../../src/app/api/public/checkout/orders/[id]/payment-qr/route';
import * as paymentModule from '../../src/server/payment';
import type { PaymentChargeDetail } from '../../src/server/payment';

vi.mock('@/server/database', () => ({
  getDatabasePool: () => ({}),
}));

describe('GET & POST /api/public/checkout/orders/[id]/payment-qr Security Gate', () => {
  const mockCharge: PaymentChargeDetail = {
    id: 'pi_test_mock_123',
    orderId: 'ORD-TEST-001',
    amount: 250000,
    currency: 'thb',
    status: 'pending',
    qrCodeUrl: 'data:image/svg+xml;utf8,<svg></svg>',
    promptpayData: '000201010212...',
    expiresAt: '2026-11-20T12:15:00.000Z',
    createdAt: '2026-11-20T12:00:00.000Z',
    livemode: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET endpoint token enforcement', () => {
    it('rejects with 401 when no token is provided', async () => {
      const getChargeSpy = vi.spyOn(paymentModule, 'getPaymentChargeForOrder');

      const request = new Request('http://localhost/api/public/checkout/orders/ORD-TEST-001/payment-qr', {
        method: 'GET',
      });

      const response = await GET(request, {
        params: Promise.resolve({ id: 'ORD-TEST-001' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.message).toContain('OTP');
      expect(getChargeSpy).not.toHaveBeenCalled();
    });

    it('rejects with 401 when token is invalid or expired', async () => {
      vi.spyOn(paymentModule, 'getPaymentChargeForOrder').mockRejectedValue(
        new Error('กรุณายืนยันตัวตนผ่าน OTP ก่อนเข้าถึงข้อมูลการชำระเงิน (AC-12)'),
      );

      const request = new Request('http://localhost/api/public/checkout/orders/ORD-TEST-001/payment-qr', {
        method: 'GET',
        headers: {
          'x-guest-token': 'invalid-expired-token',
        },
      });

      const response = await GET(request, {
        params: Promise.resolve({ id: 'ORD-TEST-001' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.message).toContain('OTP');
    });

    it('rejects with 403 when token belongs to another buyer (cross-buyer)', async () => {
      vi.spyOn(paymentModule, 'getPaymentChargeForOrder').mockRejectedValue(
        new Error('ท่านไม่มีสิทธิ์ในการเข้าถึงข้อมูลการชำระเงินสำหรับคำสั่งซื้อนี้'),
      );

      const request = new Request('http://localhost/api/public/checkout/orders/ORD-TEST-001/payment-qr?token=other-buyer-token', {
        method: 'GET',
      });

      const response = await GET(request, {
        params: Promise.resolve({ id: 'ORD-TEST-001' }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.message).toContain('สิทธิ์');
    });

    it('returns 200 with charge details and Cache-Control: no-store when valid token is provided', async () => {
      vi.spyOn(paymentModule, 'getPaymentChargeForOrder').mockResolvedValue(mockCharge);

      const request = new Request('http://localhost/api/public/checkout/orders/ORD-TEST-001/payment-qr', {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid-guest-token',
        },
      });

      const response = await GET(request, {
        params: Promise.resolve({ id: 'ORD-TEST-001' }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const data = await response.json();
      expect(data.charge.id).toBe('pi_test_mock_123');
      expect(data.charge.amount).toBe(250000);
    });

    it('returns 404 when valid token is provided but charge does not exist', async () => {
      vi.spyOn(paymentModule, 'getPaymentChargeForOrder').mockResolvedValue(null);

      const request = new Request('http://localhost/api/public/checkout/orders/ORD-TEST-001/payment-qr?verifiedToken=valid-token', {
        method: 'GET',
      });

      const response = await GET(request, {
        params: Promise.resolve({ id: 'ORD-TEST-001' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.message).toContain('ยังไม่มีข้อมูล');
    });
  });

  describe('POST endpoint token enforcement', () => {
    it('rejects with 401 when no token is provided in body or headers', async () => {
      const createChargeSpy = vi.spyOn(paymentModule, 'createPaymentQr');

      const request = new Request('http://localhost/api/public/checkout/orders/ORD-TEST-001/payment-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: 'ORD-TEST-001' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.message).toContain('OTP');
      expect(createChargeSpy).not.toHaveBeenCalled();
    });

    it('creates and returns charge (200) when valid token is provided', async () => {
      vi.spyOn(paymentModule, 'createPaymentQr').mockResolvedValue(mockCharge);

      const request = new Request('http://localhost/api/public/checkout/orders/ORD-TEST-001/payment-qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guest-session': 'valid-session-token',
        },
        body: JSON.stringify({}),
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: 'ORD-TEST-001' }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const data = await response.json();
      expect(data.charge.id).toBe('pi_test_mock_123');
    });
  });
});
