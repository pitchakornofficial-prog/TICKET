import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { setDatabasePool } from '../../src/server/database';
import {
  createEventDraft,
  approveSession,
  submitSessionCancellation,
  approveSessionCancellation,
} from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation, getTicketTypeAvailableQuota } from '../../src/server/reservation';
import {
  createPaymentQr,
  processStripeSuccessEvent,
} from '../../src/server/payment';
import { getOrderTickets } from '../../src/server/tickets';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';
import { getEventMoneyReport } from '../../src/server/reports';
import {
  getStripeClient,
  resetStripeClient,
  type StripeContractDouble,
} from '../../src/server/stripe';

describe('Stripe Expiry, Cancellation and Timeline Recovery Integration (TASK-044, AC-121, AC-71, AC-72, AC-73, AC-74, AC-112, AC-113, AC-114, AC-120, AC-124, AC-125, AC-37, AC-84)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
    setDatabasePool(fixture.pool);
  }, 30000);

  beforeEach(() => {
    resetStripeClient();
  });

  afterAll(async () => {
    resetStripeClient();
    setDatabasePool(undefined);
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(email: string, name = 'ผู้ซื้อทดสอบ Stripe Recovery', now = new Date()) {
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

  async function setupConcertWithSession(quota = 2, price = 1000) {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: `คอนเสิร์ตทดสอบ Recovery ${Date.now()}`, location: 'อิมแพ็ค อารีน่า', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-25T19:00:00.000Z',
          endTime: '2026-12-25T22:00:00.000Z',
          ticketTypes: [{ name: 'Standard Seat', price, quota }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ticketType = event.sessions[0].ticketTypes[0];

    return { event, sessionId, ticketType, ownerId, orgId };
  }

  it('1. Active session: timely late payment (T <= D) when reservation hold expired reallocates quota and issues tickets atomically (AC-72, AC-121)', async () => {
    const { event, sessionId, ticketType } = await setupConcertWithSession(5, 1000);
    const baseTime = new Date('2026-12-01T10:00:00.000Z');

    const token = await getVerifiedToken('buyer1@ticket.invalid', 'สมชาย ใจดี', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 2 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken: token,
    }, baseTime);

    // Reservation expires at D = baseTime + 15 mins (10:15:00)
    const D_ms = new Date(reservation.expiresAt).getTime();
    const D_sec = Math.floor(D_ms / 1000);

    // Simulate hold expired in DB (e.g. timeout worker ran or order marked expired)
    await fixture.pool.query(`UPDATE orders SET status = 'expired' WHERE id = $1`, [reservation.id]);

    // Timely payment occurred at T = D - 10s (before deadline)
    const T_sec = D_sec - 10;
    const stripe = getStripeClient() as StripeContractDouble;
    const successEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: T_sec,
      eventId: `evt_timely_reallocate_${Date.now()}`,
    });

    // Callback arrives after hold release at 10:20:00
    const callbackArrival = new Date('2026-12-01T10:20:00.000Z');
    const result = await processStripeSuccessEvent(fixture.pool, { event: successEvent }, callbackArrival);

    expect(result.success).toBe(true);
    expect(result.status).toBe('paid');
    expect(result.tickets).toHaveLength(2);

    // Verify order marked paid in database
    const orderRes = await fixture.pool.query(`SELECT status FROM orders WHERE id = $1`, [reservation.id]);
    expect(orderRes.rows[0].status).toBe('paid');

    // Verify tickets actually issued in tickets table
    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(2);
  });

  it('2. Active session: timely late payment (T <= D) when quota is exhausted by competing buyers does NOT issue partial tickets and opens owner review for full amount (AC-74, G-23, AC-121)', async () => {
    // Session has total quota of 2
    const { event, sessionId, ticketType } = await setupConcertWithSession(2, 1000);
    const baseTime = new Date('2026-12-01T10:00:00.000Z');

    // Buyer 1 reserves both 2 tickets
    const token1 = await getVerifiedToken('buyer1_compete@ticket.invalid', 'สมชาย', baseTime);
    const res1 = await createReservation(
      fixture.pool,
      {
        verifiedToken: token1,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 2 }],
      },
      baseTime,
    );

    const charge1 = await createPaymentQr(fixture.pool, {
      orderId: res1.id,
      verifiedToken: token1,
    }, baseTime);

    const D_sec = Math.floor(new Date(res1.expiresAt).getTime() / 1000);

    // Simulate hold expired for buyer 1
    await fixture.pool.query(`UPDATE orders SET status = 'expired' WHERE id = $1`, [res1.id]);

    // Buyer 2 quickly buys the remaining 2 tickets while buyer 1 hold was released
    const token2 = await getVerifiedToken('buyer2_fast@ticket.invalid', 'วิชัย', new Date('2026-12-01T10:16:00.000Z'));
    const res2 = await createReservation(
      fixture.pool,
      {
        verifiedToken: token2,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 2 }],
      },
      new Date('2026-12-01T10:16:00.000Z'),
    );
    const charge2 = await createPaymentQr(fixture.pool, {
      orderId: res2.id,
      verifiedToken: token2,
    }, new Date('2026-12-01T10:16:00.000Z'));

    // Buyer 2 pays and gets the tickets
    const stripe = getStripeClient() as StripeContractDouble;
    const event2 = stripe.createSuccessEvent({
      intentId: charge2.id,
      created: Math.floor(new Date('2026-12-01T10:17:00.000Z').getTime() / 1000),
      eventId: `evt_buyer2_${Date.now()}`,
    });
    const result2 = await processStripeSuccessEvent(fixture.pool, { event: event2 }, new Date('2026-12-01T10:17:05.000Z'));
    expect(result2.status).toBe('paid');

    // Quota is now 0 available
    const quotaAfterBuyer2 = await getTicketTypeAvailableQuota(fixture.pool, ticketType.id);
    expect(quotaAfterBuyer2.availableQuota).toBe(0);

    // Now Buyer 1 delayed timely success arrives with T <= D
    const T_sec = D_sec - 10;
    const event1 = stripe.createSuccessEvent({
      intentId: charge1.id,
      created: T_sec,
      eventId: `evt_buyer1_exhausted_${Date.now()}`,
    });
    const result1 = await processStripeSuccessEvent(fixture.pool, { event: event1 }, new Date('2026-12-01T10:20:00.000Z'));

    // AC-74, G-23: Do NOT issue partial tickets! Open recovery case for full received total!
    expect(result1.success).toBe(false);
    expect(result1.status).toBe('insufficient_quota');
    expect(result1.caseId).toBeDefined();
    expect(result1.recoveryCase?.reason).toBe('insufficient_quota');
    expect(result1.recoveryCase?.amount).toBe(res1.total);

    // Zero tickets issued for buyer 1
    const buyer1Tickets = await getOrderTickets(fixture.pool, res1.id);
    expect(buyer1Tickets).toHaveLength(0);

    // Order status is payment_exception
    const order1Check = await fixture.pool.query(`SELECT status FROM orders WHERE id = $1`, [res1.id]);
    expect(order1Check.rows[0].status).toBe('payment_exception');
  });

  it('3. Active session: late payment (T > D) does NOT issue tickets even if quota is free, and opens owner review for full amount (AC-124, G-35)', async () => {
    const { event, sessionId, ticketType } = await setupConcertWithSession(10, 1000);
    const baseTime = new Date('2026-12-01T10:00:00.000Z');

    const token = await getVerifiedToken('buyer_late@ticket.invalid', 'สมปอง', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 1 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken: token,
    }, baseTime);

    const D_ms = new Date(reservation.expiresAt).getTime();
    const D_sec = Math.floor(D_ms / 1000);

    // Late payment T = D + 5 seconds (T > D)
    const T_sec = D_sec + 5;
    const stripe = getStripeClient() as StripeContractDouble;
    const successEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: T_sec,
      eventId: `evt_late_${Date.now()}`,
    });

    const result = await processStripeSuccessEvent(fixture.pool, { event: successEvent }, new Date('2026-12-01T10:20:00.000Z'));

    expect(result.success).toBe(false);
    expect(result.status).toBe('paid_after_deadline');
    expect(result.caseId).toBeDefined();
    expect(result.recoveryCase?.reason).toBe('paid_after_deadline');
    expect(result.recoveryCase?.amount).toBe(reservation.total);

    // Zero tickets issued
    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(0);

    // Order status is payment_exception
    const orderCheck = await fixture.pool.query(`SELECT status FROM orders WHERE id = $1`, [reservation.id]);
    expect(orderCheck.rows[0].status).toBe('payment_exception');
  });

  it('4. Cancelled session before payment: T <= D and T < C refunds ticket face value only, excludes customer fee (G-51, AC-113)', async () => {
    const { event, sessionId, ticketType, ownerId, orgId } = await setupConcertWithSession(10, 1000);
    const baseTime = new Date('2026-12-01T10:00:00.000Z');

    const token = await getVerifiedToken('buyer_g51@ticket.invalid', 'สายัณห์', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 2 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken: token,
    }, baseTime);

    // Organizer submits cancellation and Owner approves at C = 10:08:00
    const cancelSubmit = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: orgId,
      reason: 'ศิลปินติดภารกิจด่วน',
    });
    const C_time = new Date('2026-12-01T10:08:00.000Z');
    await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelSubmit.cancellationId,
      ownerId,
      now: C_time,
    });

    // Payment occurred before cancellation: T = 10:05:00 (T < C and T <= D)
    const T_sec = Math.floor(new Date('2026-12-01T10:05:00.000Z').getTime() / 1000);
    const stripe = getStripeClient() as StripeContractDouble;
    const successEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: T_sec,
      eventId: `evt_g51_${Date.now()}`,
    });

    const result = await processStripeSuccessEvent(fixture.pool, { event: successEvent }, new Date('2026-12-01T10:15:00.000Z'));

    expect(result.success).toBe(false);
    expect(result.status).toBe('cancelled_session_refund_face_value');
    expect(result.refundAmount).toBe(reservation.subtotal); // Face value only, fee excluded!
    expect(result.refundRequestId).toBeDefined();

    // Verify 0 tickets issued
    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(0);

    // Verify liability recorded for subtotal only
    const liaRes = await fixture.pool.query(
      `SELECT amount, status FROM refund_liabilities WHERE "orderId" = $1`,
      [reservation.id],
    );
    expect(liaRes.rowCount).toBe(1);
    expect(Number(liaRes.rows[0].amount)).toBe(reservation.subtotal);
    expect(liaRes.rows[0].status).toBe('unpaid');
  });

  it('5. Cancelled session before payment: T <= D and T >= C (including T = C) refunds full amount including customer fee (G-52, AC-114)', async () => {
    const { event, sessionId, ticketType, ownerId, orgId } = await setupConcertWithSession(10, 1000);
    const baseTime = new Date('2026-12-01T10:00:00.000Z');

    const token = await getVerifiedToken('buyer_g52@ticket.invalid', 'ธานินทร์', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 2 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken: token,
    }, baseTime);

    // Owner approves cancellation at C = 10:08:00
    const cancelSubmit = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: orgId,
      reason: 'สภาพอากาศไม่เอื้ออำนวย',
    });
    const C_time = new Date('2026-12-01T10:08:00.000Z');
    await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelSubmit.cancellationId,
      ownerId,
      now: C_time,
    });

    // Payment occurred at exact cancellation time T = C (10:08:00)
    const T_sec = Math.floor(C_time.getTime() / 1000);
    const stripe = getStripeClient() as StripeContractDouble;
    const successEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: T_sec,
      eventId: `evt_g52_${Date.now()}`,
    });

    const result = await processStripeSuccessEvent(fixture.pool, { event: successEvent }, new Date('2026-12-01T10:20:00.000Z'));

    expect(result.success).toBe(false);
    expect(result.status).toBe('cancelled_session_refund_full');
    expect(result.refundAmount).toBe(reservation.total); // Full refund including customer fee!
    expect(result.refundRequestId).toBeDefined();
    expect(result.caseId).toBeDefined();

    // Verify 0 tickets issued
    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(0);

    // Verify liability recorded for full total
    const liaRes = await fixture.pool.query(
      `SELECT amount, status FROM refund_liabilities WHERE "orderId" = $1`,
      [reservation.id],
    );
    expect(liaRes.rowCount).toBe(1);
    expect(Number(liaRes.rows[0].amount)).toBe(reservation.total);
    expect(liaRes.rows[0].status).toBe('unpaid');
  });

  it('6. Cancelled session with late payment D < T < C: G-35 late precedence triggers full refund review (AC-124)', async () => {
    const { event, sessionId, ticketType, ownerId, orgId } = await setupConcertWithSession(10, 1000);
    const baseTime = new Date('2026-12-01T10:00:00.000Z');

    const token = await getVerifiedToken('buyer_d_t_c@ticket.invalid', 'ประเสริฐ', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 1 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken: token,
    }, baseTime);

    // D is 10:15:00
    const D_ms = new Date(reservation.expiresAt).getTime();
    const D_sec = Math.floor(D_ms / 1000);

    // Cancellation approved later at C = 10:25:00
    const cancelSubmit = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: orgId,
      reason: 'ยกเลิกรอบทดสอบ D < T < C',
    });
    const C_time = new Date('2026-12-01T10:25:00.000Z');
    await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelSubmit.cancellationId,
      ownerId,
      now: C_time,
    });

    // Payment happened at T = 10:18:00 (D < T < C)
    const T_sec = D_sec + 180;
    const stripe = getStripeClient() as StripeContractDouble;
    const successEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: T_sec,
      eventId: `evt_dtc_${Date.now()}`,
    });

    const result = await processStripeSuccessEvent(fixture.pool, { event: successEvent }, new Date('2026-12-01T10:30:00.000Z'));

    // G-35 precedence: Since T > D, late branch wins, full refund review
    expect(result.success).toBe(false);
    expect(result.status).toBe('paid_after_deadline');
    expect(result.recoveryCase?.amount).toBe(reservation.total);
    expect(result.recoveryCase?.reason).toBe('paid_after_deadline');
  });

  it('7. Idempotency: Webhook replays on cancelled or recovered order do NOT create duplicate refund requests, liabilities, or recovery cases (AC-18, AC-120)', async () => {
    const { event, sessionId, ticketType, ownerId, orgId } = await setupConcertWithSession(10, 1000);
    const baseTime = new Date('2026-12-01T10:00:00.000Z');

    const token = await getVerifiedToken('buyer_replay@ticket.invalid', 'เอกชัย', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 1 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken: token,
    }, baseTime);

    // Cancel session at 10:05:00
    const cancelSubmit = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: orgId,
      reason: 'ทดสอบ Idempotency',
    });
    await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelSubmit.cancellationId,
      ownerId,
      now: new Date('2026-12-01T10:05:00.000Z'),
    });

    // Payment occurred at T = 10:02:00 (T < C)
    const T_sec = Math.floor(new Date('2026-12-01T10:02:00.000Z').getTime() / 1000);
    const stripe = getStripeClient() as StripeContractDouble;
    const successEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: T_sec,
      eventId: `evt_replay_initial_${Date.now()}`,
    });

    // First webhook delivery
    const res1 = await processStripeSuccessEvent(fixture.pool, { event: successEvent }, new Date('2026-12-01T10:10:00.000Z'));
    expect(res1.status).toBe('cancelled_session_refund_face_value');

    // Second repeated webhook delivery (duplicate replay)
    const res2 = await processStripeSuccessEvent(fixture.pool, { event: successEvent }, new Date('2026-12-01T10:11:00.000Z'));
    expect(res2.status).toBe('cancelled_session_refund_face_value');
    expect(res2.duplicate).toBe(true);
    expect(res2.refundRequestId).toBe(res1.refundRequestId);

    // Third delivery with a different event ID for the same intent/order (out of order or alternate delivery)
    const altEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: T_sec,
      eventId: `evt_replay_alt_${Date.now()}`,
    });
    const res3 = await processStripeSuccessEvent(fixture.pool, { event: altEvent }, new Date('2026-12-01T10:12:00.000Z'));
    expect(res3.status).toBe('cancelled_session_refund_face_value');
    expect(res3.refundRequestId).toBe(res1.refundRequestId);

    // Verify exactly 1 refund request and 1 liability exist in DB
    const refundCount = await fixture.pool.query(
      `SELECT count(*)::int as count FROM refund_requests WHERE "orderId" = $1`,
      [reservation.id],
    );
    expect(refundCount.rows[0].count).toBe(1);

    const liaCount = await fixture.pool.query(
      `SELECT count(*)::int as count FROM refund_liabilities WHERE "orderId" = $1`,
      [reservation.id],
    );
    expect(liaCount.rows[0].count).toBe(1);

    // Verify 0 tickets issued
    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(0);
  });

  it('8. Money report continuity: unissued funds and refund cases do NOT become organizer revenue or double-deduct refunds (AC-37, AC-84, AC-93)', async () => {
    const { event, sessionId, ticketType, ownerId } = await setupConcertWithSession(10, 2000);
    const baseTime = new Date('2026-12-01T10:00:00.000Z');

    // 1. One timely valid order where ticket is issued
    const token1 = await getVerifiedToken('valid_buyer@ticket.invalid', 'ผู้ซื้อปกติ', baseTime);
    const resValid = await createReservation(
      fixture.pool,
      {
        verifiedToken: token1,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 1 }],
      },
      baseTime,
    );
    const chargeValid = await createPaymentQr(fixture.pool, {
      orderId: resValid.id,
      verifiedToken: token1,
    }, baseTime);

    const stripe = getStripeClient() as StripeContractDouble;
    const evtValid = stripe.createSuccessEvent({
      intentId: chargeValid.id,
      created: Math.floor(baseTime.getTime() / 1000) + 60,
      eventId: `evt_valid_${Date.now()}`,
    });
    await processStripeSuccessEvent(fixture.pool, { event: evtValid }, new Date('2026-12-01T10:02:00.000Z'));

    // 2. One late order (T > D) where no tickets are issued
    const token2 = await getVerifiedToken('late_buyer@ticket.invalid', 'ผู้ซื้อสาย', baseTime);
    const resLate = await createReservation(
      fixture.pool,
      {
        verifiedToken: token2,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ticketType.id, quantity: 1 }],
      },
      baseTime,
    );
    const chargeLate = await createPaymentQr(fixture.pool, {
      orderId: resLate.id,
      verifiedToken: token2,
    }, baseTime);

    const D_sec = Math.floor(new Date(resLate.expiresAt).getTime() / 1000);
    const evtLate = stripe.createSuccessEvent({
      intentId: chargeLate.id,
      created: D_sec + 10, // late
      eventId: `evt_late_report_${Date.now()}`,
    });
    await processStripeSuccessEvent(fixture.pool, { event: evtLate }, new Date('2026-12-01T10:20:00.000Z'));

    // Verify Money Report
    const report = await getEventMoneyReport(fixture.pool, event.id, { id: ownerId, role: 'owner' });

    // Only 1 ticket issued (the valid order)
    expect(report.totalTicketsIssuedCount).toBe(1);
    expect(report.grossSales).toBe(2000); // 1 ticket * 2000
    expect(report.netSales).toBe(2000);
    // Late payment was NOT added to organizer gross sales and NOT double-subtracted as refund deduction
    expect(report.approvedRefundDeductions).toBe(0);

    // Unissued funds remain recorded liabilities for owner manual transfer
    const pendingCases = await fixture.pool.query(
      `SELECT count(*)::int as count FROM payment_recovery_cases WHERE "orderId" = $1 AND status = 'pending_review'`,
      [resLate.id],
    );
    expect(pendingCases.rows[0].count).toBe(1);
  });
});
