import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrderTicketAccessToken } from '../../src/server/order-access-token';

const mockQuery = vi.fn();
vi.mock('@/server/database', () => ({
  getDatabasePool: () => ({
    query: mockQuery,
  }),
}));

const mockRequestGuestOtp = vi.fn();
const mockVerifyGuestOtp = vi.fn();
vi.mock('@/server/guest-otp', () => ({
  ensureGuestOtpSchema: vi.fn(),
  getVerifiedGuestSession: vi.fn(),
  extractClientIp: () => '127.0.0.1',
  requestGuestOtp: (...args: unknown[]) => mockRequestGuestOtp(...args),
  verifyGuestOtp: (...args: unknown[]) => mockVerifyGuestOtp(...args),
}));

vi.mock('@/server/reservation', () => ({
  ensureReservationSchema: vi.fn(),
}));

vi.mock('@/server/tickets', () => ({
  ensureTicketSchema: vi.fn(),
  getOrderTickets: vi.fn(),
}));

vi.mock('@/server/ticket-delivery', () => ({
  ensureTicketDeliverySchema: vi.fn(),
  getOrderEmailDelivery: vi.fn(),
}));

import { POST as requestLinkOtpHandler } from '../../src/app/api/public/orders/link-otp/request/route';
import { POST as verifyLinkOtpHandler } from '../../src/app/api/public/orders/link-otp/verify/route';

describe('Order Email Link One-Step OTP Flow (AC-63, G-17)', () => {
  const buyerEmail = 'alice.buyer@ticket.invalid';
  const orderId = 'ORD-LINK-001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests OTP for a valid paid order link without exposing full email, phone, or devOtpCode', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: orderId,
          buyerName: 'คุณอลิซ',
          buyerEmail,
          buyerPhone: '0812345678',
          status: 'paid',
        },
      ],
    });
    mockRequestGuestOtp.mockResolvedValueOnce({
      success: true,
      requestId: 'req-link-1',
      cooldownSeconds: 60,
      expiresInSeconds: 300,
      devOtpCode: '654321',
    });

    const linkToken = createOrderTicketAccessToken(orderId, buyerEmail);
    const req = new Request('http://localhost/api/public/orders/link-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, linkToken }),
    });

    const res = await requestLinkOtpHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.requestId).toBe('req-link-1');
    expect(data.maskedEmail).toBe('al***@ticket.invalid');
    expect(data.devOtpCode).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain(buyerEmail);
    expect(JSON.stringify(data)).not.toContain('0812345678');
    expect(JSON.stringify(data)).not.toContain('654321');
  });

  it('rejects forged or mismatched order link tokens with 401', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: orderId,
          buyerName: 'คุณอลิซ',
          buyerEmail,
          buyerPhone: '0812345678',
          status: 'paid',
        },
      ],
    });

    const wrongToken = createOrderTicketAccessToken('ORD-OTHER-999', buyerEmail);
    const req = new Request('http://localhost/api/public/orders/link-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, linkToken: wrongToken }),
    });

    const res = await requestLinkOtpHandler(req);
    expect(res.status).toBe(401);
    expect(mockRequestGuestOtp).not.toHaveBeenCalled();
  });

  it('rejects unpaid orders with 403', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: orderId,
          buyerName: 'คุณอลิซ',
          buyerEmail,
          buyerPhone: '0812345678',
          status: 'reserved',
        },
      ],
    });

    const linkToken = createOrderTicketAccessToken(orderId, buyerEmail);
    const req = new Request('http://localhost/api/public/orders/link-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, linkToken }),
    });

    const res = await requestLinkOtpHandler(req);
    expect(res.status).toBe(403);
    expect(mockRequestGuestOtp).not.toHaveBeenCalled();
  });

  it('verifies 6-digit OTP from order link and issues a verified guest session token', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: orderId,
          buyerName: 'คุณอลิซ',
          buyerEmail,
          buyerPhone: '0812345678',
          status: 'paid',
        },
      ],
    });
    mockVerifyGuestOtp.mockResolvedValueOnce({
      success: true,
      verifiedToken: 'verified-session-uuid',
    });

    const linkToken = createOrderTicketAccessToken(orderId, buyerEmail);
    const req = new Request('http://localhost/api/public/orders/link-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        linkToken,
        code: '654321',
        requestId: 'req-link-1',
      }),
    });

    const res = await verifyLinkOtpHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBe('verified-session-uuid');
    expect(mockVerifyGuestOtp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        email: buyerEmail,
        code: '654321',
        requestId: 'req-link-1',
        purpose: 'order_lookup',
      }),
    );
  });

  it('verifies OrderSuccessView delegates ordtok_ links to OrderLinkOtpGate without calling order API with ordtok_', () => {
    const rootDir = process.cwd();
    const successView = readFileSync(join(rootDir, 'src/components/order-success-view.tsx'), 'utf8');
    const otpGate = readFileSync(join(rootDir, 'src/components/order-link-otp-gate.tsx'), 'utf8');

    expect(successView).toContain('OrderLinkOtpGate');
    expect(successView).toContain("urlToken.startsWith('ordtok_')");
    expect(successView).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(otpGate).toContain('/api/public/orders/link-otp/request');
    expect(otpGate).toContain('/api/public/orders/link-otp/verify');
    expect(otpGate).not.toContain('lookup-email');
    expect(otpGate).not.toContain('lookup-phone');
    expect(otpGate).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
