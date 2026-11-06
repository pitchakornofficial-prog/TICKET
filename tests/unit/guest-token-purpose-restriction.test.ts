import { describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { getVerifiedGuestSession } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr } from '../../src/server/payment';
import { lookupGuestOrders, getGuestOrderDetail } from '../../src/server/guest-order-lookup';
import { submitRefundRequest } from '../../src/server/refunds';

describe('Issue #15: Guest Token Purpose Restriction & Cross-Workflow Protection', () => {
  function createMockPoolWithSessions(
    sessions: Record<string, { email: string; name: string; phone: string; purpose: string; expiresAt: Date }>,
  ) {
    const mockClient = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes('SELECT token, email, name, phone, purpose')) {
          const token = params[0] as string;
          const s = sessions[token];
          if (s && s.expiresAt > new Date()) {
            return {
              rowCount: 1,
              rows: [{
                token,
                email: s.email,
                name: s.name,
                phone: s.phone,
                purpose: s.purpose,
                verifiedAt: new Date(),
                expiresAt: s.expiresAt,
              }],
            };
          }
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes('SELECT "buyerEmail" FROM orders')) {
          const orderId = params[0] as string;
          if (orderId === 'ORD-BUYER-1') {
            return { rowCount: 1, rows: [{ buyerEmail: 'buyer1@ticket.invalid' }] };
          }
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes('FROM orders o') && sql.includes('WHERE o.id = $1')) {
          const orderId = params[0] as string;
          if (orderId === 'ORD-BUYER-1') {
            return {
              rowCount: 1,
              rows: [{
                id: 'ORD-BUYER-1',
                eventId: 'evt-1',
                sessionId: 'ses-1',
                buyerName: 'คุณผู้ซื้อ หนึ่ง',
                buyerEmail: 'buyer1@ticket.invalid',
                buyerPhone: '0812345678',
                status: 'paid',
                subtotal: 1000,
                discountAmount: 0,
                customerFee: 0,
                total: 1000,
                customerFeeMode: 'absorbed',
                customerFeeRate: 0,
                reservedAt: new Date(),
                expiresAt: new Date(),
                createdAt: new Date(),
                eventTitle: 'Event 1',
                location: 'Hall 1',
                posterUrl: null,
                sessionStartTime: new Date(),
                sessionEndTime: new Date(),
              }],
            };
          }
          if (orderId === 'ORD-OTHER') {
            return {
              rowCount: 1,
              rows: [{
                id: 'ORD-OTHER',
                eventId: 'evt-1',
                sessionId: 'ses-1',
                buyerName: 'คุณผู้ซื้อ สอง',
                buyerEmail: 'other@ticket.invalid',
                buyerPhone: '0899999999',
                status: 'paid',
                subtotal: 1000,
                discountAmount: 0,
                customerFee: 0,
                total: 1000,
                customerFeeMode: 'absorbed',
                customerFeeRate: 0,
                reservedAt: new Date(),
                expiresAt: new Date(),
                createdAt: new Date(),
                eventTitle: 'Event 1',
                location: 'Hall 1',
                posterUrl: null,
                sessionStartTime: new Date(),
                sessionEndTime: new Date(),
              }],
            };
          }
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
      release: () => {},
    };

    return {
      query: mockClient.query,
      connect: async () => mockClient as unknown as PoolClient,
    } as unknown as Pool;
  }

  const futureDate = new Date(Date.now() + 1800 * 1000);
  const mockPool = createMockPoolWithSessions({
    'token-checkout-valid': {
      email: 'buyer1@ticket.invalid',
      name: 'คุณผู้ซื้อ หนึ่ง',
      phone: '0812345678',
      purpose: 'checkout',
      expiresAt: futureDate,
    },
    'token-lookup-valid': {
      email: 'buyer1@ticket.invalid',
      name: 'คุณผู้ซื้อ หนึ่ง',
      phone: '0812345678',
      purpose: 'order_lookup',
      expiresAt: futureDate,
    },
  });

  describe('1. getVerifiedGuestSession purpose enforcement', () => {
    it('returns session when purpose matches expectedPurpose', async () => {
      const session = await getVerifiedGuestSession(mockPool, 'token-checkout-valid', new Date(), 'checkout');
      expect(session).not.toBeNull();
      expect(session?.purpose).toBe('checkout');
    });

    it('returns null when purpose does NOT match expectedPurpose', async () => {
      const session = await getVerifiedGuestSession(mockPool, 'token-lookup-valid', new Date(), 'checkout');
      expect(session).toBeNull();
    });

    it('returns session without purpose check when expectedPurpose is omitted', async () => {
      const session = await getVerifiedGuestSession(mockPool, 'token-lookup-valid', new Date());
      expect(session).not.toBeNull();
      expect(session?.purpose).toBe('order_lookup');
    });
  });

  describe('2. createReservation & payment reject order_lookup tokens', () => {
    it('rejects order_lookup token when attempting to create reservation', async () => {
      await expect(
        createReservation(mockPool, {
          eventId: 'evt-1',
          sessionId: 'ses-1',
          verifiedToken: 'token-lookup-valid',
          items: [{ ticketTypeId: 'tt-1', quantity: 1 }],
        }),
      ).rejects.toThrow('กรุณายืนยันตัวตนผ่าน OTP ก่อนดำเนินการกันบัตร');
    });

    it('rejects order_lookup token when attempting to create payment QR', async () => {
      await expect(
        createPaymentQr(mockPool, {
          orderId: 'ORD-BUYER-1',
          verifiedToken: 'token-lookup-valid',
        }),
      ).rejects.toThrow('กรุณายืนยันตัวตนผ่าน OTP ก่อนขอรับ QR ชำระเงิน (AC-12)');
    });
  });

  describe('3. lookupGuestOrders & getGuestOrderDetail authorization and purpose enforcement', () => {
    it('rejects checkout token from listing guest orders with UNAUTHORIZED', async () => {
      const result = await lookupGuestOrders(mockPool, {
        verifiedToken: 'token-checkout-valid',
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(result.orders).toBeUndefined();
    });

    it('rejects unverified or invalid token from viewing order detail with UNAUTHORIZED', async () => {
      const result = await getGuestOrderDetail(mockPool, {
        verifiedToken: 'token-invalid',
        orderId: 'ORD-BUYER-1',
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(result.order).toBeUndefined();
    });

    it('rejects session from accessing order of different buyer with FORBIDDEN', async () => {
      const result = await getGuestOrderDetail(mockPool, {
        verifiedToken: 'token-checkout-valid',
        orderId: 'ORD-OTHER',
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
      expect(result.order).toBeUndefined();
    });

    it('allows verified session to view their own order detail', async () => {
      const result = await getGuestOrderDetail(mockPool, {
        verifiedToken: 'token-checkout-valid',
        orderId: 'ORD-BUYER-1',
      });
      expect(result.success).toBe(true);
      expect(result.order?.id).toBe('ORD-BUYER-1');
    });
  });

  describe('4. submitRefundRequest rejects checkout tokens', () => {
    it('rejects checkout token from submitting refund request with UNAUTHORIZED', async () => {
      const result = await submitRefundRequest(mockPool, {
        verifiedToken: 'token-checkout-valid',
        orderId: 'ORD-BUYER-1',
        ticketIds: ['tkt-1'],
        reason: 'เปลี่ยนใจ',
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });
  });
});
