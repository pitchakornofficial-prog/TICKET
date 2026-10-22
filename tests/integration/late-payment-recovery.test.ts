import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { saveEventFeeSettings } from '../../src/server/fees';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import {
  createPaymentQr,
  verifyAndProcessPayment,
  listPaymentRecoveryCases,
} from '../../src/server/payment';
import { getOrderTickets } from '../../src/server/tickets';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('Late Payment Recovery & Quota Reallocation (TASK-016, AC-72, AC-73, AC-74, G-23, G-35)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(email: string, name = 'ผู้ซื้อทดสอบ Recovery', now = new Date()) {
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

  it('AC-72: reallocates quota and issues tickets when provider confirms timely payment after hold expired and quota remains', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-01T10:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Recovery AC-72', location: 'อิมแพ็ค', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-01T19:00:00.000Z',
          endTime: '2026-12-01T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP AC72', price: 2000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    // 1. Guest reserves 2 tickets at t0
    const buyerEmail = 'buyer_ac72@example.com';
    const token = await getVerifiedToken(buyerEmail, 'ผู้ซื้อ AC-72', t0);
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

    // 2. Fast forward 20 minutes: reservation hold deadline passed (15 mins) and order expired
    const tExpired = new Date(t0.getTime() + 20 * 60 * 1000);
    await fixture.pool.query(
      `UPDATE orders SET status = 'expired', "updatedAt" = $2 WHERE id = $1`,
      [reservation.id, tExpired],
    );

    // 3. Provider confirms payment was actually made timely at t0 + 10 mins (T <= D)
    const paidAt = new Date(t0.getTime() + 10 * 60 * 1000); // 10 minutes in (timely, deadline was 15 mins)
    const processRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: paidAt,
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      tExpired, // processed at tExpired
    );

    // Quota was available (10 total, 0 other orders), so quota reallocated and tickets issued
    expect(processRes.success).toBe(true);
    expect(processRes.status).toBe('paid');
    expect(processRes.tickets).toHaveLength(2);

    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(2);
  });

  it('AC-73: does NOT issue tickets when payment is made after deadline (T > D), creates owner recovery case for full refund including customer fee (G-35)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-02T10:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Late Payment AC-73', location: 'ไบเทค', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-02T19:00:00.000Z',
          endTime: '2026-12-02T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP AC73', price: 1500, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await saveEventFeeSettings(
      fixture.pool,
      event.id,
      {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 40,
        reservePercentage: 10,
      },
      ownerId,
    );
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const buyerEmail = 'buyer_ac73@example.com';
    const token = await getVerifiedToken(buyerEmail, 'นายเอกชัย ชำระช้า', t0);
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

    // 2 tickets @ 1,500 = 3,000 THB; fee = 2 * 40 = 80 THB; total = 3,080 THB
    expect(reservation.total).toBe(3080);

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: token },
      t0,
    );

    // Paid at t0 + 16 minutes (deadline was 15 minutes, so T > D)
    const paidAt = new Date(t0.getTime() + 16 * 60 * 1000);
    const processRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: paidAt,
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      new Date(t0.getTime() + 17 * 60 * 1000),
    );

    // Tickets must NOT be issued (AC-73, G-35)
    expect(processRes.success).toBe(false);
    expect(processRes.status).toBe('paid_after_deadline');
    expect(processRes.caseId).toBeDefined();

    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(0);

    // Verify recovery case details
    expect(processRes.recoveryCase).toBeDefined();
    const c = processRes.recoveryCase;
    expect(c?.orderId).toBe(reservation.id);
    expect(c?.reason).toBe('paid_after_deadline');
    expect(c?.amount).toBe(3080); // full total received including customer fee
    expect(c?.customerFee).toBe(80);
    expect(c?.subtotal).toBe(3000);
    expect(c?.status).toBe('pending_review');

    // Repeated callback returns same case idempotently (AC-18)
    const repeatRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: paidAt,
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      new Date(t0.getTime() + 18 * 60 * 1000),
    );

    expect(repeatRes.status).toBe('paid_after_deadline');
    expect(repeatRes.caseId).toBe(processRes.caseId);

    // Check listPaymentRecoveryCases
    const cases = await listPaymentRecoveryCases(fixture.pool);
    const found = cases.find(item => item.orderId === reservation.id);
    expect(found).toBeDefined();
    expect(found?.amount).toBe(3080);
  });

  it('AC-74: does NOT issue partial tickets when timely paid callback arrives but quota was taken, opens full refund case (G-23)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-03T10:00:00.000Z');

    // Total quota is exactly 2 tickets
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Quota Contention AC-74', location: 'เซ็นทรัลเวิลด์', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-03T19:00:00.000Z',
          endTime: '2026-12-03T22:00:00.000Z',
          ticketTypes: [{ name: 'Limited VIP', price: 2500, quota: 2 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    // Buyer 1 reserves 2 tickets
    const buyer1Email = 'buyer1_ac74@example.com';
    const token1 = await getVerifiedToken(buyer1Email, 'ผู้ซื้อคนที่หนึ่ง', t0);
    const reservation1 = await createReservation(
      fixture.pool,
      {
        verifiedToken: token1,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      t0,
    );

    const charge1 = await createPaymentQr(
      fixture.pool,
      { orderId: reservation1.id, verifiedToken: token1 },
      t0,
    );

    // Fast forward 16 minutes: reservation 1 hold deadline passes without callback
    const tExpired = new Date(t0.getTime() + 16 * 60 * 1000);
    await fixture.pool.query(
      `UPDATE orders SET status = 'expired', "updatedAt" = $2 WHERE id = $1`,
      [reservation1.id, tExpired],
    );

    // Buyer 2 swoops in at tExpired and reserves/pays the remaining 2 tickets
    const buyer2Email = 'buyer2_ac74@example.com';
    const token2 = await getVerifiedToken(buyer2Email, 'ผู้ซื้อคนที่สอง', tExpired);
    const reservation2 = await createReservation(
      fixture.pool,
      {
        verifiedToken: token2,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      tExpired,
    );
    const charge2 = await createPaymentQr(
      fixture.pool,
      { orderId: reservation2.id, verifiedToken: token2 },
      tExpired,
    );

    await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge2.id,
        providerPaidAt: tExpired,
        actualAmount: charge2.amount,
        actualCurrency: 'thb',
      },
      tExpired,
    );

    // Now, all 2 tickets are paid by Buyer 2 (0 quota left).
    // Now, provider webhook finally delivers payment confirmation for Buyer 1!
    // Buyer 1 paid at t0 + 10 mins (timely: T <= D), but quota is now 0.
    const paidAt1 = new Date(t0.getTime() + 10 * 60 * 1000);
    const processRes1 = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge1.id,
        providerPaidAt: paidAt1,
        actualAmount: charge1.amount,
        actualCurrency: 'thb',
      },
      new Date(tExpired.getTime() + 60000),
    );

    // AC-74: Insufficient quota -> do NOT issue partial tickets, open owner review case for full refund
    expect(processRes1.success).toBe(false);
    expect(processRes1.status).toBe('insufficient_quota');
    expect(processRes1.caseId).toBeDefined();

    const tickets1 = await getOrderTickets(fixture.pool, reservation1.id);
    expect(tickets1).toHaveLength(0);

    const c = processRes1.recoveryCase;
    expect(c?.reason).toBe('insufficient_quota');
    expect(c?.orderId).toBe(reservation1.id);
    expect(c?.amount).toBe(5000); // 2 * 2500
  });
});
