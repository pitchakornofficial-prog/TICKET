import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  retryTicketEmailDelivery,
  listFailedEmailDeliveries,
  getOrderEmailDelivery,
} from '../../src/server/ticket-delivery';
import { getOrderTickets } from '../../src/server/tickets';
import {
  getCapturedEmails,
  clearCapturedEmails,
  setCustomEmailTransport,
} from '../../src/server/email';

describe('Ticket Email Delivery & Failure Recovery (TASK-017, AC-20, AC-75)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(email: string, name = 'ผู้ซื้อทดสอบ Email', now = new Date()) {
    clearCapturedEmails();
    const buyer = { name, email, phone: '0812345678' };
    const reqRes = await requestGuestOtp(fixture.pool, { buyer, purpose: 'checkout', now });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';
    const verifyRes = await verifyGuestOtp(fixture.pool, {
      email,
      code,
      requestId: reqRes.requestId ?? '',
      purpose: 'checkout',
      buyer,
      now,
    });
    return verifyRes.verifiedToken ?? '';
  }

  it('AC-20: automatically sends email with order summary and distinct tickets upon timely payment', async () => {
    setCustomEmailTransport(null);
    clearCapturedEmails();
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-05T10:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต ส่งอีเมลบัตร AC-20', location: 'พารากอน ฮอลล์', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-05T19:00:00.000Z',
          endTime: '2026-12-05T22:00:00.000Z',
          ticketTypes: [{ name: 'บัตร Gold', price: 2000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const buyerEmail = 'buyer_ac20@example.com';
    const buyerName = 'นายเอกรัฐ ผู้รับตั๋ว';
    const token = await getVerifiedToken(buyerEmail, buyerName, t0);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      t0,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: token },
      t0,
    );

    clearCapturedEmails();

    // Verify payment and process
    const processRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: t0,
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      t0,
    );

    expect(processRes.success).toBe(true);
    expect(processRes.status).toBe('paid');
    expect(processRes.tickets).toHaveLength(2);

    // Verify email was sent and captured (AC-20)
    const captured = getCapturedEmails();
    const ticketEmail = captured.find(m => m.to === buyerEmail && m.subject.includes(reservation.id));
    expect(ticketEmail).toBeDefined();
    expect(ticketEmail?.subject).toContain(reservation.id);
    expect(ticketEmail?.html).toContain(buyerName);
    expect(ticketEmail?.html).toContain('คอนเสิร์ต ส่งอีเมลบัตร AC-20');
    expect(ticketEmail?.html).toContain(processRes.tickets?.[0].ticketCode);
    expect(ticketEmail?.html).toContain(processRes.tickets?.[1].ticketCode);

    // Check delivery record in database
    const delivery = await getOrderEmailDelivery(fixture.pool, reservation.id);
    expect(delivery).toBeDefined();
    expect(delivery?.status).toBe('sent');
    expect(delivery?.recipientEmail).toBe(buyerEmail);
  });

  it('AC-75: delivery failure logs failed status, keeps paid/tickets intact, and retry sends email without issuing new tickets', async () => {
    clearCapturedEmails();
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-06T10:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Delivery Failure AC-75', location: 'อิมแพ็ค', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-06T19:00:00.000Z',
          endTime: '2026-12-06T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP AC75', price: 3000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const buyerEmail = 'buyer_ac75@example.com';
    const token = await getVerifiedToken(buyerEmail, 'นายสมเกียรติ อีเมลเสีย', t0);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      t0,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: token },
      t0,
    );

    // Setup custom failing email transport
    setCustomEmailTransport({
      async send() {
        throw new Error('Simulated network timeout connecting to SMTP / Resend');
      },
    });

    // Process payment with failing email delivery
    const processRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: t0,
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      t0,
    );

    // Payment still succeeds and tickets are issued (AC-75)
    expect(processRes.success).toBe(true);
    expect(processRes.status).toBe('paid');
    expect(processRes.tickets).toHaveLength(1);

    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(1);
    const ticketId = tickets[0].id;

    // Delivery record shows failed
    const delivery = await getOrderEmailDelivery(fixture.pool, reservation.id);
    expect(delivery).toBeDefined();
    expect(delivery?.status).toBe('failed');
    expect(delivery?.error).toContain('Simulated network timeout');

    // Owner can list failed deliveries
    const failedList = await listFailedEmailDeliveries(fixture.pool);
    const found = failedList.find(d => d.orderId === reservation.id);
    expect(found).toBeDefined();

    // Now restore healthy transport and retry delivery
    setCustomEmailTransport(null);
    clearCapturedEmails();

    if (!delivery) throw new Error('Delivery record not found');
    const retryRes = await retryTicketEmailDelivery(fixture.pool, delivery.id);
    expect(retryRes.status).toBe('sent');
    expect(retryRes.retryCount).toBe(1);

    // Tickets remain exactly the same 1 ticket (not re-issued)
    const ticketsAfterRetry = await getOrderTickets(fixture.pool, reservation.id);
    expect(ticketsAfterRetry).toHaveLength(1);
    expect(ticketsAfterRetry[0].id).toBe(ticketId);

    // Captured email delivered
    const captured = getCapturedEmails();
    expect(captured).toHaveLength(1);
    expect(captured[0].to).toBe(buyerEmail);
    expect(captured[0].subject).toContain(reservation.id);
  });
});
