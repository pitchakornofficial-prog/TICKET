import { describe, expect, it } from 'vitest';
import { buildTicketEmailContent } from '../../src/server/ticket-delivery';
import type { TicketDetail } from '../../src/server/tickets';

describe('TASK-017 Unit: Ticket Email Delivery Content', () => {
  const dummyTickets: TicketDetail[] = [
    {
      id: 'TKT-001',
      orderId: 'ORD-12345678',
      orderItemId: 'OI-001',
      eventId: 'EVT-001',
      sessionId: 'SES-001',
      ticketTypeId: 'TT-001',
      ticketTypeName: 'บัตร VIP Zone A',
      ticketPrice: 2500,
      ticketCode: 'TK-345678-0001-01',
      qrPayload: 'TKT-QR-UUID-1',
      qrCodeUrl: 'data:image/svg+xml;utf8,<svg>QR1</svg>',
      status: 'valid',
      admissionStatus: 'outside',
      buyerName: 'นายประสิทธิ์ สั่งซื้อ',
      buyerEmail: 'prasit@example.com',
      buyerPhone: '0812345678',
      sessionStartTime: '2026-12-15T19:00:00.000Z',
      sessionEndTime: '2026-12-15T22:00:00.000Z',
      location: 'อิมแพ็ค อารีน่า',
      eventTitle: 'คอนเสิร์ตใหญ่แห่งปี 2026',
      createdAt: '2026-12-01T10:00:00.000Z',
    },
    {
      id: 'TKT-002',
      orderId: 'ORD-12345678',
      orderItemId: 'OI-001',
      eventId: 'EVT-001',
      sessionId: 'SES-001',
      ticketTypeId: 'TT-001',
      ticketTypeName: 'บัตร VIP Zone A',
      ticketPrice: 2500,
      ticketCode: 'TK-345678-0001-02',
      qrPayload: 'TKT-QR-UUID-2',
      qrCodeUrl: 'data:image/svg+xml;utf8,<svg>QR2</svg>',
      status: 'valid',
      admissionStatus: 'outside',
      buyerName: 'นายประสิทธิ์ สั่งซื้อ',
      buyerEmail: 'prasit@example.com',
      buyerPhone: '0812345678',
      sessionStartTime: '2026-12-15T19:00:00.000Z',
      sessionEndTime: '2026-12-15T22:00:00.000Z',
      location: 'อิมแพ็ค อารีน่า',
      eventTitle: 'คอนเสิร์ตใหญ่แห่งปี 2026',
      createdAt: '2026-12-01T10:00:00.000Z',
    },
  ];

  it('builds email subject and body containing order ID, event title, and tickets with separate codes (AC-20)', () => {
    const orderId = 'ORD-12345678';
    const buyerName = 'นายประสิทธิ์ สั่งซื้อ';
    const eventTitle = 'คอนเสิร์ตใหญ่แห่งปี 2026';
    const location = 'อิมแพ็ค อารีน่า';
    const sessionTime = '2026-12-15T19:00:00.000Z';
    const orderUrl = 'http://127.0.0.1:3000/events/EVT-001';

    const { subject, html, text } = buildTicketEmailContent(
      orderId,
      buyerName,
      eventTitle,
      location,
      sessionTime,
      dummyTickets,
      orderUrl,
    );

    expect(subject).toContain(orderId);
    expect(subject).toContain('[TICKET]');

    // HTML assertions
    expect(html).toContain(buyerName);
    expect(html).toContain(orderId);
    expect(html).toContain(eventTitle);
    expect(html).toContain(location);
    expect(html).toContain('TK-345678-0001-01');
    expect(html).toContain('TK-345678-0001-02');
    expect(html).toContain(orderUrl);

    // Text assertions
    expect(text).toContain(orderId);
    expect(text).toContain(buyerName);
    expect(text).toContain('TK-345678-0001-01');
    expect(text).toContain('TK-345678-0001-02');

    // D-14: zero emojis
    expect(subject).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
