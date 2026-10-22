import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import { getOrderTickets } from '../../src/server/tickets';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('Paid Ticket Issuance Integration (TASK-015, AC-11, AC-16, AC-17, AC-18, AC-19, AC-06)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(email: string, name = 'ผู้ซื้อทดสอบตั๋ว', now = new Date()) {
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

  it('issues distinct tickets with separate QR codes upon timely payment, without separate attendee registration (AC-11, AC-17, AC-19)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-25T10:00:00.000Z');

    // 1. Create event with 2 ticket types
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตใหญ่ Rock 2026', location: 'อิมแพ็ค อารีน่า', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-25T19:00:00.000Z',
          endTime: '2026-11-25T22:00:00.000Z',
          ticketTypes: [
            { name: 'VIP Standing', price: 2500, quota: 10 },
            { name: 'Regular Seating', price: 1500, quota: 20 },
          ],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const vipType = event.sessions[0].ticketTypes.find((t: { name: string }) => t.name === 'VIP Standing');
    if (!vipType) throw new Error('VIP Standing type not found');

    // 2. Guest reserve 2 VIP tickets
    const buyerEmail = 'buyer_issuance_1@example.com';
    const buyerToken = await getVerifiedToken(buyerEmail, 'นายสมศักดิ์ ทดสอบ', baseTime);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: vipType.id, quantity: 2 }],
      },
      baseTime,
    );

    expect(reservation.status).toBe('reserved');
    expect(reservation.items[0].quantity).toBe(2);

    // 3. Before payment: unconfirmed payment leaves tickets unissued (AC-16)
    const ticketsBefore = await getOrderTickets(fixture.pool, reservation.id);
    expect(ticketsBefore).toHaveLength(0);

    // 4. Create payment charge
    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: buyerToken },
      baseTime,
    );
    expect(charge.status).toBe('pending');

    // 5. Timely payment processed within 15 minutes (AC-17)
    const paymentTime = new Date(baseTime.getTime() + 5 * 60 * 1000); // 5 mins in
    const processRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: paymentTime,
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      paymentTime,
    );

    expect(processRes.success).toBe(true);
    expect(processRes.status).toBe('paid');
    expect(processRes.tickets).toBeDefined();
    expect(processRes.tickets).toHaveLength(2);

    const issuedTickets = processRes.tickets ?? [];
    expect(issuedTickets).toHaveLength(2);

    // AC-19: Exactly 2 distinct ticket codes and distinct QR codes
    expect(issuedTickets[0].ticketCode).not.toBe(issuedTickets[1].ticketCode);
    expect(issuedTickets[0].qrPayload).not.toBe(issuedTickets[1].qrPayload);
    expect(issuedTickets[0].qrCodeUrl).not.toBe(issuedTickets[1].qrCodeUrl);

    // AC-11: Single buyer details for the order, no attendee registration needed
    expect(issuedTickets[0].buyerName).toBe('นายสมศักดิ์ ทดสอบ');
    expect(issuedTickets[0].buyerEmail).toBe(buyerEmail);
    expect(issuedTickets[1].buyerName).toBe('นายสมศักดิ์ ทดสอบ');
    expect(issuedTickets[1].buyerEmail).toBe(buyerEmail);

    // Status is valid and admissionStatus outside
    expect(issuedTickets[0].status).toBe('valid');
    expect(issuedTickets[0].admissionStatus).toBe('outside');
    expect(issuedTickets[1].status).toBe('valid');
    expect(issuedTickets[1].admissionStatus).toBe('outside');

    // 6. Duplicate callback idempotency (AC-18)
    const duplicateRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: paymentTime,
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      new Date(paymentTime.getTime() + 60000),
    );

    expect(duplicateRes.success).toBe(true);
    expect(duplicateRes.status).toBe('paid');
    expect(duplicateRes.tickets).toHaveLength(2);
    expect(duplicateRes.tickets?.[0].id).toBe(issuedTickets[0].id);
    expect(duplicateRes.tickets?.[1].id).toBe(issuedTickets[1].id);

    // Database still has only 2 tickets for this order
    const dbTickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(dbTickets).toHaveLength(2);
  });

  it('rejects payment with mismatched amount or currency and does not issue tickets (AC-16, AC-26)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-26T10:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Jazz 2026', location: 'พารากอน', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-26T19:00:00.000Z',
          endTime: '2026-11-26T22:00:00.000Z',
          ticketTypes: [{ name: 'Standard', price: 1000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const standardType = event.sessions[0].ticketTypes[0];

    const buyerEmail = 'buyer_mismatch@example.com';
    const buyerToken = await getVerifiedToken(buyerEmail, 'ผู้ซื้อตรวจสอบยอด', baseTime);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: standardType.id, quantity: 1 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: buyerToken },
      baseTime,
    );

    // Mismatched amount
    const wrongAmountRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        actualAmount: charge.amount - 100, // 1 THB less
      },
      baseTime,
    );
    expect(wrongAmountRes.success).toBe(false);
    expect(wrongAmountRes.status).toBe('mismatch');

    // Mismatched currency
    const wrongCurrencyRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        actualCurrency: 'usd',
      },
      baseTime,
    );
    expect(wrongCurrencyRes.success).toBe(false);
    expect(wrongCurrencyRes.status).toBe('mismatch');

    // Tickets remain unissued
    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(0);
  });
});
