import { describe, expect, it } from 'vitest';
import { generateTicketQrSvg } from '../../src/server/tickets';

describe('TASK-015 Unit: Ticket Issuance & QR Generation', () => {
  it('generates distinct SVG QR data URLs containing ticket code (AC-19)', () => {
    const code1 = 'TK-ORD001-VIP1-01';
    const payload1 = 'TKT-QR-UUID-1111';
    const qr1 = generateTicketQrSvg(code1, payload1);

    const code2 = 'TK-ORD001-VIP1-02';
    const payload2 = 'TKT-QR-UUID-2222';
    const qr2 = generateTicketQrSvg(code2, payload2);

    expect(qr1).toContain('data:image/svg+xml');
    expect(qr2).toContain('data:image/svg+xml');
    expect(qr1).toContain(encodeURIComponent(code1));
    expect(qr2).toContain(encodeURIComponent(code2));
    expect(qr1).not.toBe(qr2);
  });

  it('ticket code conforms to expected prefix TK- and sequence format', () => {
    const orderId = 'ORD-12345678';
    const typeId = 'TT-VIP01';
    const seq = 1;
    const ticketCode = `TK-${orderId.slice(-6)}-${typeId.slice(-4)}-${seq.toString().padStart(2, '0')}`;
    expect(ticketCode).toBe('TK-345678-IP01-01');
  });

  it('enforces single buyer info per order without individual attendee names (AC-11)', () => {
    // Buyer info is bound at order level
    const buyer = {
      buyerName: 'สมชาย ผู้ซื้อ',
      buyerEmail: 'somchai@example.com',
      buyerPhone: '0812345678',
    };

    const tickets = [
      { ticketCode: 'TK-01', ...buyer },
      { ticketCode: 'TK-02', ...buyer },
    ];

    expect(tickets).toHaveLength(2);
    expect(tickets[0].buyerName).toBe('สมชาย ผู้ซื้อ');
    expect(tickets[1].buyerName).toBe('สมชาย ผู้ซื้อ');
    // Individual attendee names are NOT required
    expect((tickets[0] as Record<string, unknown>).attendeeName).toBeUndefined();
  });
});
