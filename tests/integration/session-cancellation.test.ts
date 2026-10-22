import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture, fixtureAccounts } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
  addScannerToEvent,
  submitSessionCancellation,
  approveSessionCancellation,
  listPendingSessionCancellations,
} from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import { recordAdmissionScan, ensureAdmissionSchema } from '../../src/server/admission';
import {
  submitRefundRequest,
} from '../../src/server/refunds';
import {
  clearCapturedEmails,
  setCustomEmailTransport,
  getCapturedEmails,
} from '../../src/server/email';

describe('TASK-026: Session Cancellation Integration Tests (AC-35, AC-91, AC-108, R5, G-22, G-38, AC-90)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function purchasePaidOrder(quantity = 2) {
    clearCapturedEmails();

    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000);
    const sessionEndTime = new Date(sessionStartTime.getTime() + 4 * 3600 * 1000);

    const eventDraft = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: `คอนเสิร์ต ยกเลิกรอบ ${Date.now()}`,
        description: 'งานแสดงดนตรีสำหรับทดสอบ session cancellation',
        location: 'Thunder Dome',
        posterUrl: undefined,
      },
      [
        {
          startTime: sessionStartTime.toISOString(),
          endTime: sessionEndTime.toISOString(),
          ticketTypes: [{ name: 'Regular Zone', price: 1500, quota: 30 }],
        },
      ],
    );

    const eventId = eventDraft.id;
    const sessionId = eventDraft.sessions[0].id;
    const ticketTypeId = eventDraft.sessions[0].ticketTypes[0].id;

    // Approve session
    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // Buyer OTP verification
    const buyerEmail = `buyer-cancel-${Date.now()}@example.com`;
    const buyerPhone = '0812345678';
    const buyerName = 'สมศักดิ์ ทดสอบ';
    const buyer = { name: buyerName, email: buyerEmail, phone: buyerPhone };

    const otpReq = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
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
    const verifiedToken = otpVerify.verifiedToken ?? '';

    // Buyer reservation
    const reservation = await createReservation(fixture.pool, {
      verifiedToken,
      eventId,
      sessionId,
      items: [{ ticketTypeId, quantity }],
    });

    // Payment QR
    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken,
    });

    // Simulate timely payment confirmation
    const paymentResult = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: new Date(),
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      new Date(),
    );
    expect(paymentResult.success).toBe(true);

    const tRes = await fixture.pool.query<{
      id: string;
      ticketCode: string;
      qrPayload: string;
      status: string;
      admissionStatus: string;
    }>(
      'SELECT id, "ticketCode", "qrPayload", status, "admissionStatus" FROM tickets WHERE "orderId" = $1 ORDER BY "ticketCode"',
      [reservation.id],
    );

    return {
      eventId,
      sessionId,
      sessionStartTime,
      ticketTypeId,
      orderId: reservation.id,
      verifiedToken,
      buyerEmail,
      buyerPhone,
      buyerName,
      paymentResult,
      tickets: tRes.rows,
      subtotal: reservation.subtotal,
      customerFee: reservation.customerFee,
      total: reservation.total,
    };
  }

  it('preserves approved session sellability while cancellation request is pending (AC-108)', async () => {
    const { eventId, sessionId, ticketTypeId } = await purchasePaidOrder(1);

    // 1. Organizer submits cancellation request
    const cancelRes = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: fixture.ids.organizer,
      reason: 'ศิลปินประสบอุบัติเหตุไม่สามารถแสดงได้',
    });

    expect(cancelRes.success).toBe(true);
    expect(cancelRes.cancellationId).toBeDefined();

    // 2. While pending, session status in database remains 'approved' (AC-108)
    const sessionCheck = await fixture.pool.query(
      'SELECT status FROM event_sessions WHERE id = $1',
      [sessionId],
    );
    expect(sessionCheck.rows[0].status).toBe('approved');

    // 3. Appears in pending cancellations list for Owner review
    const pendingList = await listPendingSessionCancellations(fixture.pool);
    const found = pendingList.find(c => c.id === cancelRes.cancellationId);
    expect(found).toBeDefined();
    expect(found?.reason).toBe('ศิลปินประสบอุบัติเหตุไม่สามารถแสดงได้');
    expect(found?.sessionStatus).toBe('approved');

    // 4. Another buyer can still reserve tickets while cancellation is only pending (AC-108)
    const buyerEmail2 = `buyer-during-pending-${Date.now()}@example.com`;
    const buyer2 = { name: 'ผู้ซื้อ ระหว่างรอ', email: buyerEmail2, phone: '0899998888' };
    const otpReq2 = await requestGuestOtp(fixture.pool, {
      buyer: buyer2,
      purpose: 'checkout',
      now: new Date(),
    });
    const match2 = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code2 = match2 ? match2[1] : '';

    const otpVerify2 = await verifyGuestOtp(fixture.pool, {
      requestId: otpReq2.requestId ?? '',
      code: code2,
      email: buyerEmail2,
      buyer: buyer2,
      purpose: 'checkout',
      now: new Date(),
    });

    const reservation2 = await createReservation(fixture.pool, {
      verifiedToken: otpVerify2.verifiedToken ?? '',
      eventId,
      sessionId,
      items: [{ ticketTypeId, quantity: 1 }],
    });
    expect(reservation2.status).toBe('reserved');
  });

  it('owner approves cancellation: rejects new checkouts, revokes issued tickets, and creates face-value refund cases (AC-35, AC-91, R5, AC-90)', async () => {
    const orderData = await purchasePaidOrder(2);
    const { eventId, sessionId, ticketTypeId, orderId } = orderData;
    expect(orderData.tickets.length).toBe(2);

    // Organizer submits cancellation
    const cancelReq = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: fixture.ids.organizer,
      reason: 'ยกเลิกเนื่องจากภัยธรรมชาติ',
    });

    // Owner approves cancellation
    const approvalRes = await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelReq.cancellationId,
      ownerId: fixture.ids.owner,
    });

    expect(approvalRes.success).toBe(true);
    expect(approvalRes.sessionStatus).toBe('cancelled');
    expect(approvalRes.revokedTicketCount).toBe(2);
    expect(approvalRes.refundCasesCreated).toBe(1);
    // R5: strictly face value of the 2 tickets (2 * 1500 = 3000), NOT including customer fee
    expect(approvalRes.totalLiabilityAmount).toBe(3000);

    // 1. Session is marked cancelled
    const sessionRes = await fixture.pool.query(
      'SELECT status FROM event_sessions WHERE id = $1',
      [sessionId],
    );
    expect(sessionRes.rows[0].status).toBe('cancelled');

    // 2. Tickets are revoked (status = 'refunded')
    const ticketsRes = await fixture.pool.query(
      'SELECT id, status FROM tickets WHERE "orderId" = $1',
      [orderId],
    );
    expect(ticketsRes.rows.every(t => t.status === 'refunded')).toBe(true);

    // 3. Automatic refund request is created with status = 'approved' and face-value amount
    const refundRes = await fixture.pool.query(
      'SELECT id, status, "requestedAmount", reason FROM refund_requests WHERE "orderId" = $1',
      [orderId],
    );
    expect(refundRes.rowCount).toBe(1);
    expect(refundRes.rows[0].status).toBe('approved');
    expect(Number(refundRes.rows[0].requestedAmount)).toBe(3000);
    expect(refundRes.rows[0].reason).toContain('รอบการแสดงถูกยกเลิก');

    // 4. Refund liability is created with status 'unpaid' for Owner manual transfer
    const liabilityRes = await fixture.pool.query(
      'SELECT amount, status FROM refund_liabilities WHERE "orderId" = $1',
      [orderId],
    );
    expect(liabilityRes.rowCount).toBe(1);
    expect(Number(liabilityRes.rows[0].amount)).toBe(3000);
    expect(liabilityRes.rows[0].status).toBe('unpaid');

    // 5. New reservations for this session are rejected (AC-35)
    const newBuyerEmail = `new-buyer-cancelled-${Date.now()}@example.com`;
    const newBuyer = { name: 'ผู้ซื้อ หลังยกเลิก', email: newBuyerEmail, phone: '0811112222' };
    const otpReq = await requestGuestOtp(fixture.pool, {
      buyer: newBuyer,
      purpose: 'checkout',
      now: new Date(),
    });
    const match3 = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code3 = match3 ? match3[1] : '';

    const otpVerify = await verifyGuestOtp(fixture.pool, {
      requestId: otpReq.requestId ?? '',
      code: code3,
      email: newBuyerEmail,
      buyer: newBuyer,
      purpose: 'checkout',
      now: new Date(),
    });

    await expect(
      createReservation(fixture.pool, {
        verifiedToken: otpVerify.verifiedToken ?? '',
        eventId,
        sessionId,
        items: [{ ticketTypeId, quantity: 1 }],
      }),
    ).rejects.toThrow('รอบการแสดงนี้ถูกยกเลิกแล้ว ไม่สามารถทำการจองบัตรได้ (AC-35)');

    // 6. Idempotency test: calling approveSessionCancellation again returns alreadyApproved
    const repeatRes = await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelReq.cancellationId,
      ownerId: fixture.ids.owner,
    });
    expect(repeatRes.success).toBe(true);
    expect(repeatRes.alreadyApproved).toBe(true);
    expect(repeatRes.refundCasesCreated).toBe(0);
  });

  it('does NOT refund tickets that have already been admitted (G-22, AC-88, AC-91)', async () => {
    await ensureAdmissionSchema(fixture.pool);
    const orderData = await purchasePaidOrder(2);
    const { eventId, sessionId, orderId } = orderData;
    const tickets = orderData.tickets;
    expect(tickets.length).toBe(2);

    const ticket1 = tickets[0];
    const ticket2 = tickets[1];

    // Add scanner to event
    await addScannerToEvent(fixture.pool, fixture.ids.organizer, eventId, {
      scannerId: fixture.ids.scanner,
      name: fixtureAccounts.scanner.name,
      email: fixtureAccounts.scanner.email,
    });

    // Scanner admits ticket 1
    const scanResult = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId,
      qrPayloadOrCode: ticket1.ticketCode,
      action: 'entry',
      now: new Date(orderData.sessionStartTime.getTime() + 10 * 60 * 1000),
    });
    expect(scanResult.success).toBe(true);

    // Organizer submits cancellation
    const cancelReq = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: fixture.ids.organizer,
      reason: 'ฝนตกหนักน้ำท่วมเวที',
    });

    // Owner approves cancellation
    const approvalRes = await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelReq.cancellationId,
      ownerId: fixture.ids.owner,
    });

    expect(approvalRes.success).toBe(true);
    // Only ticket 2 was unadmitted and eligible for refund!
    expect(approvalRes.revokedTicketCount).toBe(1);
    expect(approvalRes.refundCasesCreated).toBe(1);
    // Face value of ticket 2 only (1500 THB)
    expect(approvalRes.totalLiabilityAmount).toBe(1500);

    // Check database state
    const t1Check = await fixture.pool.query('SELECT status FROM tickets WHERE id = $1', [ticket1.id]);
    const t2Check = await fixture.pool.query('SELECT status FROM tickets WHERE id = $1', [ticket2.id]);
    // Ticket 1 entered venue: NOT refunded
    expect(t1Check.rows[0].status).toBe('valid');
    // Ticket 2 did not enter: refunded
    expect(t2Check.rows[0].status).toBe('refunded');

    // Refund request items must only contain ticket 2
    const itemsRes = await fixture.pool.query(
      `SELECT rri."ticketId"
       FROM refund_request_items rri
       JOIN refund_requests rr ON rr.id = rri."refundRequestId"
       WHERE rr."orderId" = $1`,
      [orderId],
    );
    expect(itemsRes.rows.map(r => r.ticketId)).toEqual([ticket2.id]);
  });

  it('links existing pending/approved refund requests and does NOT create duplicate refund cases (G-38, AC-91)', async () => {
    const orderData = await purchasePaidOrder(2);
    const { sessionId, orderId, verifiedToken } = orderData;
    const tickets = orderData.tickets;
    const ticket1 = tickets[0];
    const _ticket2 = tickets[1];

    // Buyer manually submitted refund request for ticket 1 prior to cancellation
    const partialReq = await submitRefundRequest(fixture.pool, {
      orderId,
      verifiedToken,
      ticketIds: [ticket1.id],
      reason: 'ผู้ซื้อติดธุระขอยื่นคืนใบที่ 1',
    });
    expect(partialReq.success).toBe(true);

    // Organizer submits cancellation
    const cancelReq = await submitSessionCancellation(fixture.pool, {
      sessionId,
      organizerId: fixture.ids.organizer,
      reason: 'ยกเลิกรอบทั้งงาน',
    });

    // Owner approves cancellation
    const approvalRes = await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelReq.cancellationId,
      ownerId: fixture.ids.owner,
    });

    expect(approvalRes.success).toBe(true);
    // Both ticket 1 (transitioned pending to approved) and ticket 2 (new auto case) are revoked
    expect(approvalRes.revokedTicketCount).toBe(2);
    // 1 new refund case created for ticket 2; existing pending request for ticket 1 was linked & approved
    expect(approvalRes.refundCasesCreated).toBe(1);
    expect(approvalRes.totalLiabilityAmount).toBe(3000);

    // Total refund requests for this order must be exactly 2 (1 buyer request + 1 auto cancel request)
    const requestsRes = await fixture.pool.query(
      'SELECT id, status, "requestedAmount" FROM refund_requests WHERE "orderId" = $1',
      [orderId],
    );
    expect(requestsRes.rowCount).toBe(2);
    expect(requestsRes.rows.every(r => r.status === 'approved')).toBe(true);

    // Total liabilities for this order must equal 3000 THB across 2 liabilities without duplication
    const liaRes = await fixture.pool.query(
      'SELECT amount, status FROM refund_liabilities WHERE "orderId" = $1',
      [orderId],
    );
    expect(liaRes.rowCount).toBe(2);
    const totalLiabilities = liaRes.rows.reduce((sum, r) => sum + Number(r.amount), 0);
    expect(totalLiabilities).toBe(3000);
  });
});
