import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
  submitSessionCancellation,
  approveSessionCancellation,
} from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation, getTicketTypeAvailableQuota, getOrderReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import { setCustomEmailTransport, getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('TASK-027: Cancel Pending Payments Integration Tests (AC-112, AC-113, AC-114, G-50, G-51, G-52, AC-84)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function createEventWithSession() {
    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000);
    const sessionEndTime = new Date(sessionStartTime.getTime() + 4 * 3600 * 1000);

    const eventDraft = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: `คอนเสิร์ต รอชำระเงิน ${Date.now()}`,
        description: 'งานแสดงดนตรีสำหรับทดสอบ cancel pending payments',
        location: 'Impact Arena',
        posterUrl: undefined,
      },
      [
        {
          startTime: sessionStartTime.toISOString(),
          endTime: sessionEndTime.toISOString(),
          ticketTypes: [{ name: 'Standing A', price: 1000, quota: 10 }],
        },
      ],
    );

    const sessionId = eventDraft.sessions[0].id;
    const ticketTypeId = eventDraft.sessions[0].ticketTypes[0].id;

    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    return { event: eventDraft, sessionId, ticketTypeId, sessionStartTime, sessionEndTime };
  }

  async function createReservedOrder(eventId: string, sessionId: string, ticketTypeId: string, quantity = 2) {
    clearCapturedEmails();
    const buyerEmail = `guest-pending-${Date.now()}@example.com`;
    const buyerPhone = '0819998877';
    const buyerName = 'คุณทดสอบ ผู้ซื้อ';
    const buyer = { name: buyerName, email: buyerEmail, phone: buyerPhone };

    const otpReq = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
    expect(otpReq.success).toBe(true);
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';

    const otpVerify = await verifyGuestOtp(fixture.pool, {
      requestId: otpReq.requestId ?? '',
      code,
      email: buyerEmail,
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
    expect(otpVerify.success).toBe(true);
    const verifiedToken = otpVerify.verifiedToken ?? '';

    const reservation = await createReservation(fixture.pool, {
      verifiedToken,
      eventId,
      sessionId,
      items: [{ ticketTypeId, quantity }],
    });

    return { reservation, verifiedToken, buyerEmail, buyerPhone, buyerName };
  }

  it('1. Owner cancellation terminates active reservations and releases quota once without reopening sales (AC-112, G-50)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventWithSession();
    const { reservation, verifiedToken } = await createReservedOrder(event.id, sessionId, ticketTypeId, 3);

    // Initial check: 3 tickets held
    const beforeCancelQuota = await getTicketTypeAvailableQuota(fixture.pool, ticketTypeId);
    expect(beforeCancelQuota.heldQuota).toBe(3);
    expect(beforeCancelQuota.availableQuota).toBe(7);

    // Organizer submits cancellation
    const cancelSubmit = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: fixture.ids.organizer,
      reason: 'ศิลปินติดภารกิจด่วน',
    });
    expect(cancelSubmit.success).toBe(true);

    // Owner approves cancellation
    const cancelApprove = await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelSubmit.cancellationId,
      ownerId: fixture.ids.owner,
    });
    expect(cancelApprove.success).toBe(true);
    expect(cancelApprove.cancelledReservationsCount).toBe(1);

    // Order status is transitioned to 'cancelled'
    const orderDetails = await getOrderReservation(fixture.pool, reservation.id);
    expect(orderDetails?.status).toBe('cancelled');

    // Quota is released (heldQuota becomes 0)
    const afterCancelQuota = await getTicketTypeAvailableQuota(fixture.pool, ticketTypeId);
    expect(afterCancelQuota.heldQuota).toBe(0);

    // However, session is 'cancelled', so new reservations are forbidden (AC-35)
    await expect(
      createReservation(fixture.pool, {
        eventId: event.id,
        sessionId,
        verifiedToken,
        items: [{ ticketTypeId, quantity: 1 }],
      }),
    ).rejects.toThrow(/รอบการแสดง.*ถูกยกเลิกแล้ว/);

    // Attempting to generate PromptPay QR on the cancelled order is rejected (AC-112)
    await expect(
      createPaymentQr(fixture.pool, {
        orderId: reservation.id,
        verifiedToken,
      }),
    ).rejects.toThrow(/รอบการแสดง.*ถูกยกเลิกแล้ว/);
  });

  it('2. Late provider callback with T <= D and T < C: buyer paid before cancellation -> refund face value only, no tickets issued (AC-113, G-51, R5)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventWithSession();
    const { reservation, verifiedToken } = await createReservedOrder(event.id, sessionId, ticketTypeId, 2);

    // Generate QR charge
    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken,
    });
    expect(charge.status).toBe('pending');

    // Benchmark timestamps: C = now, D = expiresAt
    const C = new Date('2026-12-15T19:05:00.000Z');
    const D = new Date('2026-12-15T19:15:00.000Z');
    const T = new Date('2026-12-15T19:04:00.000Z'); // Paid 1 min before cancellation

    // Update order expiresAt to D
    await fixture.pool.query('UPDATE orders SET "expiresAt" = $2 WHERE id = $1', [reservation.id, D]);

    // Submit and approve cancellation at C
    const cancelSubmit = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: fixture.ids.organizer,
      reason: 'ยกเลิกรอบทดสอบ G-51',
    });
    await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelSubmit.cancellationId,
      ownerId: fixture.ids.owner,
      now: C,
    });

    // Callback arrives later (simulated with providerPaidAt = T)
    const callbackResult = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: T,
      },
      new Date('2026-12-15T19:20:00.000Z'), // callback arrives at 19:20
    );

    expect(callbackResult.status).toBe('cancelled_session_refund_face_value');
    expect(callbackResult.refundAmount).toBe(reservation.subtotal); // face value only, customer fee excluded
    expect(callbackResult.tickets).toBeUndefined();

    // Verify tickets table: 0 tickets issued
    const ticketsRes = await fixture.pool.query('SELECT count(*)::int as count FROM tickets WHERE "orderId" = $1', [
      reservation.id,
    ]);
    expect(ticketsRes.rows[0].count).toBe(0);

    // Verify refund_requests and refund_liabilities
    const refundRes = await fixture.pool.query(
      'SELECT id, "requestedAmount", reason, status FROM refund_requests WHERE "orderId" = $1',
      [reservation.id],
    );
    expect(refundRes.rowCount).toBe(1);
    expect(Number(refundRes.rows[0].requestedAmount)).toBe(reservation.subtotal);
    expect(refundRes.rows[0].status).toBe('approved');
    expect(refundRes.rows[0].reason).toContain('G-51');

    const liaRes = await fixture.pool.query(
      'SELECT amount, status FROM refund_liabilities WHERE "orderId" = $1',
      [reservation.id],
    );
    expect(liaRes.rowCount).toBe(1);
    expect(Number(liaRes.rows[0].amount)).toBe(reservation.subtotal);
    expect(liaRes.rows[0].status).toBe('unpaid');
  });

  it('3. Late provider callback with T <= D and T >= C: buyer paid at or after cancellation -> refund full amount including customer fee (AC-114, G-52)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventWithSession();
    const { reservation, verifiedToken } = await createReservedOrder(event.id, sessionId, ticketTypeId, 2);

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken,
    });

    const C = new Date('2026-12-15T19:05:00.000Z');
    const D = new Date('2026-12-15T19:15:00.000Z');
    const T = new Date('2026-12-15T19:05:00.000Z'); // T = C (exact cancellation time)

    await fixture.pool.query('UPDATE orders SET "expiresAt" = $2 WHERE id = $1', [reservation.id, D]);

    const cancelSubmit = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: fixture.ids.organizer,
      reason: 'ยกเลิกรอบทดสอบ G-52',
    });
    await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelSubmit.cancellationId,
      ownerId: fixture.ids.owner,
      now: C,
    });

    // Callback arrives after cancellation with T = C
    const callbackResult = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: T,
      },
      new Date('2026-12-15T19:25:00.000Z'),
    );

    expect(callbackResult.status).toBe('cancelled_session_refund_full');
    expect(callbackResult.refundAmount).toBe(reservation.total); // full refund including customer service fee
    expect(callbackResult.tickets).toBeUndefined();

    // Verify tickets table: 0 tickets issued
    const ticketsRes = await fixture.pool.query('SELECT count(*)::int as count FROM tickets WHERE "orderId" = $1', [
      reservation.id,
    ]);
    expect(ticketsRes.rows[0].count).toBe(0);

    // Verify refund_requests for full total
    const refundRes = await fixture.pool.query(
      'SELECT id, "requestedAmount", reason, status FROM refund_requests WHERE "orderId" = $1',
      [reservation.id],
    );
    expect(refundRes.rowCount).toBe(1);
    expect(Number(refundRes.rows[0].requestedAmount)).toBe(reservation.total);
    expect(refundRes.rows[0].reason).toContain('G-52');

    // Verify liability recorded for full total
    const liaRes = await fixture.pool.query(
      'SELECT amount, status FROM refund_liabilities WHERE "orderId" = $1',
      [reservation.id],
    );
    expect(liaRes.rowCount).toBe(1);
    expect(Number(liaRes.rows[0].amount)).toBe(reservation.total);
    expect(liaRes.rows[0].status).toBe('unpaid');
  });

  it('4. Repeated callbacks on cancelled session order are strictly idempotent (AC-18, AC-107)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventWithSession();
    const { reservation, verifiedToken } = await createReservedOrder(event.id, sessionId, ticketTypeId, 1);

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken,
    });

    const C = new Date('2026-12-15T19:05:00.000Z');
    const D = new Date('2026-12-15T19:15:00.000Z');
    const T = new Date('2026-12-15T19:02:00.000Z');

    await fixture.pool.query('UPDATE orders SET "expiresAt" = $2 WHERE id = $1', [reservation.id, D]);

    const cancelSubmit = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: fixture.ids.organizer,
      reason: 'ยกเลิกรอบทดสอบ idempotency',
    });
    await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelSubmit.cancellationId,
      ownerId: fixture.ids.owner,
      now: C,
    });

    // First callback
    const res1 = await verifyAndProcessPayment(fixture.pool, { chargeId: charge.id, providerPaidAt: T });
    expect(res1.status).toBe('cancelled_session_refund_face_value');

    // Second repeated callback
    const res2 = await verifyAndProcessPayment(fixture.pool, { chargeId: charge.id, providerPaidAt: T });
    expect(res2.status).toBe('cancelled_session_refund_face_value');
    expect(res2.refundRequestId).toBe(res1.refundRequestId);

    // Verify no duplicate refund requests or liabilities created
    const allRefunds = await fixture.pool.query(
      'SELECT count(*)::int as count FROM refund_requests WHERE "orderId" = $1',
      [reservation.id],
    );
    expect(allRefunds.rows[0].count).toBe(1);

    const allLias = await fixture.pool.query(
      'SELECT count(*)::int as count FROM refund_liabilities WHERE "orderId" = $1',
      [reservation.id],
    );
    expect(allLias.rows[0].count).toBe(1);
  });
});
