import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET as getOrderHandler } from '../../src/app/api/public/checkout/orders/[id]/route';
import { GET as getTicketsHandler } from '../../src/app/api/public/checkout/orders/[id]/tickets/route';
import type { OrderReservationDetail } from '../../src/server/reservation';
import type { TicketDetail } from '../../src/server/tickets';
import type { GuestVerifiedSession } from '../../src/server/guest-otp';

let mockReservation: OrderReservationDetail | null = null;
let mockTickets: TicketDetail[] = [];
let mockSession: GuestVerifiedSession | null = null;

vi.mock('@/server/database', () => ({
  getDatabasePool: () => ({}),
}));

vi.mock('@/server/guest-otp', () => ({
  getVerifiedGuestSession: async (_pool: unknown, token: string) => {
    if (token === 'valid-token') {
      return mockSession;
    }
    return null;
  },
}));

vi.mock('@/server/reservation', () => ({
  getOrderReservation: async (_pool: unknown, orderId: string) => {
    if (orderId === 'ORD-NOT-FOUND') return null;
    return mockReservation;
  },
}));

vi.mock('@/server/tickets', () => ({
  getOrderTickets: async () => mockTickets,
}));

describe('Checkout Orders & Tickets Authorization Security Gate', () => {
  beforeEach(() => {
    mockSession = {
      token: 'valid-token',
      email: 'buyer@ticket.invalid',
      name: 'คุณสมชาย ซื้อบัตร',
      phone: '0812345678',
      purpose: 'checkout',
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    mockReservation = {
      id: 'ORD-SEC-001',
      eventId: 'evt-001',
      sessionId: 'ses-001',
      buyerEmail: 'buyer@ticket.invalid',
      buyerName: 'คุณสมชาย ซื้อบัตร',
      buyerPhone: '0812345678',
      status: 'reserved',
      items: [],
      subtotal: 1000,
      discountAmount: 0,
      customerFeeMode: 'percentage',
      customerFeeRate: 5,
      customerFee: 50,
      total: 1050,
      reservedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    };

    mockTickets = [
      {
        id: 'tkt-001',
        orderId: 'ORD-SEC-001',
        orderItemId: 'oi-001',
        eventId: 'evt-001',
        sessionId: 'ses-001',
        ticketTypeId: 'tt-001',
        ticketTypeName: 'VIP',
        ticketPrice: 1000,
        ticketCode: 'TCK-001',
        qrPayload: 'qr-payload-secret',
        qrCodeUrl: 'data:image/svg+xml;utf8,<svg></svg>',
        status: 'valid',
        admissionStatus: 'outside',
        buyerName: 'คุณสมชาย ซื้อบัตร',
        buyerEmail: 'buyer@ticket.invalid',
        buyerPhone: '0812345678',
        sessionStartTime: new Date().toISOString(),
        sessionEndTime: new Date().toISOString(),
        location: 'อิมแพ็ค',
        eventTitle: 'คอนเสิร์ตใหญ่',
        ticketTemplateUrl: null,
        eventPosterUrl: null,
        createdAt: new Date().toISOString(),
      },
    ];
  });

  describe('GET /api/public/checkout/orders/[id]', () => {
    it('rejects with 401 when token is missing', async () => {
      const res = await getOrderHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001'),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.message).toContain('OTP');
    });

    it('rejects with 401 when token is invalid or expired', async () => {
      const res = await getOrderHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001', {
          headers: { 'x-guest-token': 'invalid-token' },
        }),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.message).toContain('หมดอายุ');
    });

    it('returns 404 when order does not exist', async () => {
      const res = await getOrderHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-NOT-FOUND', {
          headers: { 'x-guest-token': 'valid-token' },
        }),
        { params: Promise.resolve({ id: 'ORD-NOT-FOUND' }) },
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.message).toContain('ไม่พบรายการคำสั่งซื้อ');
    });

    it('rejects with 403 when session email does not match order buyerEmail', async () => {
      if (mockSession) {
        mockSession.email = 'attacker@ticket.invalid';
      }

      const res = await getOrderHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001', {
          headers: { 'x-guest-token': 'valid-token' },
        }),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toContain('ท่านไม่มีสิทธิ์');
    });

    it('returns 200 with reservation when token is valid and matches buyerEmail', async () => {
      const res = await getOrderHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001', {
          headers: { 'x-guest-token': 'valid-token' },
        }),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reservation.id).toBe('ORD-SEC-001');
      expect(data.reservation.buyerEmail).toBe('buyer@ticket.invalid');
    });
  });

  describe('GET /api/public/checkout/orders/[id]/tickets', () => {
    it('rejects with 401 when token is missing', async () => {
      const res = await getTicketsHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/tickets'),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.message).toContain('OTP');
    });

    it('rejects with 401 when token is invalid or expired', async () => {
      const res = await getTicketsHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/tickets', {
          headers: { 'x-guest-token': 'invalid-token' },
        }),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.message).toContain('หมดอายุ');
    });

    it('rejects with 403 when session email does not match order buyerEmail', async () => {
      if (mockSession) {
        mockSession.email = 'attacker@ticket.invalid';
      }

      const res = await getTicketsHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/tickets', {
          headers: { 'x-guest-token': 'valid-token' },
        }),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toContain('ท่านไม่มีสิทธิ์');
    });

    it('returns 400 when order is not yet paid (AC-16)', async () => {
      if (mockReservation) {
        mockReservation.status = 'reserved';
      }

      const res = await getTicketsHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/tickets', {
          headers: { 'x-guest-token': 'valid-token' },
        }),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('ยังไม่ได้รับการยืนยันการชำระเงิน');
    });

    it('returns 200 with tickets and QR data when order is paid and token is valid', async () => {
      if (mockReservation) {
        mockReservation.status = 'paid';
      }

      const res = await getTicketsHandler(
        new Request('http://localhost/api/public/checkout/orders/ORD-SEC-001/tickets', {
          headers: { 'x-guest-token': 'valid-token' },
        }),
        { params: Promise.resolve({ id: 'ORD-SEC-001' }) },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tickets).toHaveLength(1);
      expect(data.tickets[0].qrPayload).toBe('qr-payload-secret');
      expect(data.tickets[0].ticketCode).toBe('TCK-001');
    });
  });
});
