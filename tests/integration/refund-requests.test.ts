import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  getOrderRefundEligibility,
  submitRefundRequest,
  getOrderRefundRequests,
} from '../../src/server/refunds';
import {
  clearCapturedEmails,
  setCustomEmailTransport,
  getCapturedEmails,
} from '../../src/server/email';

describe('TASK-021: Refund Requests Integration Tests (AC-32, AC-33, AC-34, AC-21, AC-22)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function purchasePaidOrder(sessionStartTime: Date) {
    clearCapturedEmails();

    // 1. Create event with given session start time
    const eventDraft = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: `คอนเสิร์ตทดสอบขอคืนเงิน ${Date.now()}`,
        description: 'งานแสดงดนตรีสดสำหรับทดสอบ refund requests',
        location: 'Hall A',
        posterUrl: undefined,
      },
      [
        {
          startTime: sessionStartTime.toISOString(),
          endTime: new Date(sessionStartTime.getTime() + 4 * 3600 * 1000).toISOString(),
          ticketTypes: [{ name: 'Standard Seat', price: 1500, quota: 100 }],
        },
      ],
    );

    const sessionId = eventDraft.sessions[0].id;
    const ticketTypeId = eventDraft.sessions[0].ticketTypes[0].id;

    // Approve session
    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // 2. Guest checkout
    const guestEmail = `buyer-refund-${Date.now()}@ticket.invalid`;
    const guestPhone = '0812345678';
    const guestName = 'ผู้ซื้อขอคืนเงินทดสอบ';

    const buyer = { name: guestName, email: guestEmail, phone: guestPhone };
    const reqRes = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
    expect(reqRes.success).toBe(true);

    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';
    const vRes = await verifyGuestOtp(fixture.pool, {
      email: guestEmail,
      code,
      requestId: reqRes.requestId ?? '',
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
    expect(vRes.success).toBe(true);
    const buyerToken = vRes.verifiedToken ?? '';

    // Reserve 2 tickets
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: eventDraft.id,
        sessionId,
        items: [{ ticketTypeId, quantity: 2 }],
      },
      new Date(),
    );
    expect(reservation.id).toBeDefined();

    // Pay
    const charge = await createPaymentQr(
      fixture.pool,
      {
        orderId: reservation.id,
        verifiedToken: buyerToken,
      },
      new Date(),
    );

    const payRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: new Date(),
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      new Date(),
    );
    expect(payRes.success).toBe(true);

    const tRes = await fixture.pool.query<{
      id: string;
      ticketCode: string;
      qrPayload: string;
      admissionStatus: string;
    }>('SELECT id, "ticketCode", "qrPayload", "admissionStatus" FROM tickets WHERE "orderId" = $1 ORDER BY "ticketCode"', [
      reservation.id,
    ]);

    expect(tRes.rows).toHaveLength(2);

    return {
      eventId: eventDraft.id,
      sessionId,
      ticketTypeId,
      orderId: reservation.id,
      buyerToken,
      buyerEmail: guestEmail,
      buyerPhone: guestPhone,
      tickets: tRes.rows,
    };
  }

  it('allows partial refund request within 168h cutoff and verifies face-value math and pending status (AC-32, AC-33, AC-34)', async () => {
    // Session is 10 days in the future (240 hours > 168 hours)
    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000);
    const orderData = await purchasePaidOrder(sessionStartTime);

    // Check eligibility
    const eligibility = await getOrderRefundEligibility(fixture.pool, orderData.orderId);
    expect(eligibility.isWithinNormalCutoff).toBe(true);
    expect(eligibility.tickets).toHaveLength(2);
    expect(eligibility.tickets[0].eligible).toBe(true);
    expect(eligibility.tickets[1].eligible).toBe(true);

    // Submit refund for 1 of 2 tickets (partial refund)
    const ticketToRefund = orderData.tickets[0];
    const submitRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: orderData.buyerToken,
      orderId: orderData.orderId,
      ticketIds: [ticketToRefund.id],
      reason: 'ติดงานด่วน ขอคืน 1 ใบ',
      bankName: 'ธนาคารกสิกรไทย',
      bankAccountNo: '123-4-56789-0',
      bankAccountName: 'ผู้ซื้อขอคืนเงินทดสอบ',
    });

    expect(submitRes.success).toBe(true);
    expect(submitRes.status).toBe('pending');
    expect(submitRes.ticketCount).toBe(1);
    // Face value is strictly 1500 (excludes customer fee) (AC-33)
    expect(submitRes.requestedAmount).toBe(1500);

    // Verify refund requests list
    const requests = await getOrderRefundRequests(fixture.pool, orderData.orderId);
    expect(requests).toHaveLength(1);
    expect(requests[0].id).toBe(submitRes.refundRequestId);
    expect(requests[0].status).toBe('pending');
    expect(requests[0].requestedAmount).toBe(1500);
    expect(requests[0].items).toHaveLength(1);
    expect(requests[0].items[0].ticketId).toBe(ticketToRefund.id);

    // Verify pending refund does NOT revoke ticket yet (AC-34, TASK-022)
    const tCheck = await fixture.pool.query(
      `SELECT status, "admissionStatus" FROM tickets WHERE id = $1`,
      [ticketToRefund.id],
    );
    expect(tCheck.rows[0].status).toBe('valid');

    // Duplicate refund submission for the same ticket must be rejected (AC-34)
    const dupRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: orderData.buyerToken,
      orderId: orderData.orderId,
      ticketIds: [ticketToRefund.id],
      reason: 'ขอยื่นซ้ำ',
    });
    expect(dupRes.success).toBe(false);
    expect(dupRes.code).toBe('DUPLICATE_REFUND_REQUEST');

    // Second ticket is still eligible and can be refunded separately
    const secondTicket = orderData.tickets[1];
    const secondSubmitRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: orderData.buyerToken,
      orderId: orderData.orderId,
      ticketIds: [secondTicket.id],
      reason: 'เพื่อนไม่ว่าง ขอคืนอีกใบ',
    });
    expect(secondSubmitRes.success).toBe(true);
    expect(secondSubmitRes.status).toBe('pending');
    expect(secondSubmitRes.requestedAmount).toBe(1500);

    const allRequests = await getOrderRefundRequests(fixture.pool, orderData.orderId);
    expect(allRequests).toHaveLength(2);
  }, 30000);

  it('rejects refund request when submitted past normal 168h cutoff (AC-32)', async () => {
    // Session is 5 days (120 hours) in the future (< 168 hours cutoff)
    const sessionStartTime = new Date(Date.now() + 120 * 3600 * 1000);
    const orderData = await purchasePaidOrder(sessionStartTime);

    // Eligibility check shows past cutoff
    const eligibility = await getOrderRefundEligibility(fixture.pool, orderData.orderId);
    expect(eligibility.isWithinNormalCutoff).toBe(false);
    expect(eligibility.tickets[0].eligible).toBe(false);
    expect(eligibility.tickets[0].reason).toContain('168 ชั่วโมง');

    // Attempting submission returns PAST_REFUND_CUTOFF
    const submitRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: orderData.buyerToken,
      orderId: orderData.orderId,
      ticketIds: [orderData.tickets[0].id],
      reason: 'ขอยื่นหลัง cutoff',
    });

    expect(submitRes.success).toBe(false);
    expect(submitRes.code).toBe('PAST_REFUND_CUTOFF');
  }, 30000);

  it('rejects refund for tickets that were already scanned/admitted (AC-32)', async () => {
    // Session is 10 days in the future
    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000);
    const orderData = await purchasePaidOrder(sessionStartTime);

    // Admit ticket 0 directly by inserting success entry log
    const ticketToScan = orderData.tickets[0];
    await fixture.pool.query(
      `INSERT INTO ticket_admission_logs (
         id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'entry', 'success', now())`,
      [
        `log-${Date.now()}`,
        ticketToScan.id,
        ticketToScan.ticketCode,
        orderData.eventId,
        orderData.sessionId,
        fixture.ids.scanner,
        'Scanner Test',
      ],
    );

    // Eligibility check
    const eligibility = await getOrderRefundEligibility(fixture.pool, orderData.orderId);
    const eligibleT0 = eligibility.tickets.find(t => t.ticketId === ticketToScan.id);
    const eligibleT1 = eligibility.tickets.find(t => t.ticketId === orderData.tickets[1].id);

    expect(eligibleT0?.eligible).toBe(false);
    expect(eligibleT0?.reason).toContain('สแกนเข้างานแล้ว');
    expect(eligibleT1?.eligible).toBe(true);

    // Submitting refund for admitted ticket is rejected
    const submitRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: orderData.buyerToken,
      orderId: orderData.orderId,
      ticketIds: [ticketToScan.id],
      reason: 'ขอคืนบัตรที่เข้างานแล้ว',
    });
    expect(submitRes.success).toBe(false);
    expect(submitRes.code).toBe('TICKET_ALREADY_ADMITTED');

    // Unadmitted ticket 1 can still be submitted
    const submitT1 = await submitRefundRequest(fixture.pool, {
      verifiedToken: orderData.buyerToken,
      orderId: orderData.orderId,
      ticketIds: [orderData.tickets[1].id],
      reason: 'ขอคืนบัตรที่ 2 ที่ยังไม่ได้เข้างาน',
    });
    expect(submitT1.success).toBe(true);
  }, 30000);

  it('rejects cross-buyer tampering (AC-22) and unverified session (AC-21)', async () => {
    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000);
    const orderData = await purchasePaidOrder(sessionStartTime);

    // Create another buyer session
    const otherBuyer = {
      name: 'ผู้ซื้อคนอื่น',
      email: `other-buyer-${Date.now()}@ticket.invalid`,
      phone: '0899999999',
    };
    const reqRes = await requestGuestOtp(fixture.pool, {
      buyer: otherBuyer,
      purpose: 'checkout',
      now: new Date(),
    });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';
    const vRes = await verifyGuestOtp(fixture.pool, {
      email: otherBuyer.email,
      code,
      requestId: reqRes.requestId ?? '',
      buyer: otherBuyer,
      purpose: 'checkout',
      now: new Date(),
    });
    const otherToken = vRes.verifiedToken ?? '';

    // Buyer B attempts to refund Buyer A's order
    const tamperRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: otherToken,
      orderId: orderData.orderId,
      ticketIds: [orderData.tickets[0].id],
      reason: 'ยื่นแทนคนอื่น',
    });
    expect(tamperRes.success).toBe(false);
    expect(tamperRes.code).toBe('FORBIDDEN');

    // Invalid session token
    const fakeTokenRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: 'fake-invalid-session-token',
      orderId: orderData.orderId,
      ticketIds: [orderData.tickets[0].id],
      reason: 'token มั่ว',
    });
    expect(fakeTokenRes.success).toBe(false);
    expect(fakeTokenRes.code).toBe('UNAUTHORIZED');
  }, 30000);
});
