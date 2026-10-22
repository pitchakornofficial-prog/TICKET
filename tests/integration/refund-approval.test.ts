import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture, fixtureAccounts } from '../support/auth-fixture';
import { createEventDraft, approveSession, addScannerToEvent } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation, getTicketTypeAvailableQuota } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import { recordAdmissionScan, ensureAdmissionSchema } from '../../src/server/admission';
import {
  submitRefundRequest,
  approveRefundRequest,
  rejectRefundRequest,
  listAllRefundRequests,
} from '../../src/server/refunds';
import {
  clearCapturedEmails,
  setCustomEmailTransport,
  getCapturedEmails,
} from '../../src/server/email';

describe('TASK-022: Refund Approval Integration Tests (AC-36, AC-88, AC-89, AC-90, AC-107)', () => {
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
        title: `คอนเสิร์ต อนุมัติคืนเงิน ${Date.now()}`,
        description: 'งานแสดงดนตรีสดสำหรับทดสอบ refund approval',
        location: 'Impact Arena',
        posterUrl: undefined,
      },
      [
        {
          startTime: sessionStartTime.toISOString(),
          endTime: sessionEndTime.toISOString(),
          ticketTypes: [{ name: 'VIP Zone', price: 2500, quota: 20 }],
        },
      ],
    );

    const sessionId = eventDraft.sessions[0].id;
    const ticketTypeId = eventDraft.sessions[0].ticketTypes[0].id;

    // Approve session
    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // Assign scanner
    await addScannerToEvent(fixture.pool, fixture.ids.organizer, eventDraft.id, {
      scannerId: fixture.ids.scanner,
      name: fixtureAccounts.scanner.name,
      email: fixtureAccounts.scanner.email,
    });
    await ensureAdmissionSchema(fixture.pool);

    // Guest checkout
    const guestEmail = `buyer-approval-${Date.now()}@ticket.invalid`;
    const guestPhone = '0812345678';
    const guestName = 'ผู้ซื้อทดสอบอนุมัติคืน';

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

    // Reserve tickets
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: eventDraft.id,
        sessionId,
        items: [{ ticketTypeId, quantity }],
      },
      new Date(),
    );

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
      status: string;
      admissionStatus: string;
    }>(
      'SELECT id, "ticketCode", "qrPayload", status, "admissionStatus" FROM tickets WHERE "orderId" = $1 ORDER BY "ticketCode"',
      [reservation.id],
    );

    return {
      eventId: eventDraft.id,
      sessionId,
      sessionStartTime,
      ticketTypeId,
      orderId: reservation.id,
      buyerToken,
      buyerEmail: guestEmail,
      tickets: tRes.rows,
    };
  }

  it('approves partial refund: revokes only approved ticket, creates liability, returns quota, and keeps other ticket valid (AC-36, AC-89, AC-90)', async () => {
    const data = await purchasePaidOrder(2);
    const [t1, t2] = data.tickets;

    // Check quota before refund
    const quotaBefore = await getTicketTypeAvailableQuota(fixture.pool, data.ticketTypeId);
    expect(quotaBefore.heldQuota).toBe(2);
    expect(quotaBefore.availableQuota).toBe(18); // 20 - 2

    // 1. Submit refund request for T1 only (partial)
    const submitRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: data.buyerToken,
      orderId: data.orderId,
      ticketIds: [t1.id],
      reason: 'ขอยกเลิกบัตรใบแรก 1 ใบ',
      bankName: 'ธนาคารกรุงเทพ',
      bankAccountNo: '987-6-54321-0',
      bankAccountName: 'ผู้ซื้อทดสอบอนุมัติคืน',
    });
    expect(submitRes.success).toBe(true);
    expect(submitRes.status).toBe('pending');

    // While pending, scanning T1 is still allowed per AC-89 (within admission window)
    // Both tickets are still valid in DB
    const checkPending = await fixture.pool.query(
      `SELECT id, status FROM tickets WHERE id IN ($1, $2)`,
      [t1.id, t2.id],
    );
    expect(checkPending.rows.every(r => r.status === 'valid')).toBe(true);

    // 2. Owner approves refund request
    const approveRes = await approveRefundRequest(fixture.pool, {
      refundRequestId: submitRes.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: fixtureAccounts.owner.name,
      reviewerRole: 'owner',
    });
    expect(approveRes.success).toBe(true);
    expect(approveRes.status).toBe('approved');
    expect(approveRes.revokedTicketCount).toBe(1);
    expect(approveRes.liabilityAmount).toBe(2500); // 1 ticket face value
    expect(approveRes.quotaReturned).toBe(true); // session is approved

    // 3. Verify tickets in DB (AC-36): T1 is refunded, T2 is still valid
    const checkAfter = await fixture.pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM tickets WHERE id IN ($1, $2) ORDER BY "ticketCode"`,
      [t1.id, t2.id],
    );
    const statusMap = new Map(checkAfter.rows.map(r => [r.id, r.status]));
    expect(statusMap.get(t1.id)).toBe('refunded');
    expect(statusMap.get(t2.id)).toBe('valid');

    // 4. Verify refund liability created (G-36)
    const liaRes = await fixture.pool.query<{ amount: number; status: string }>(
      `SELECT amount, status FROM refund_liabilities WHERE "refundRequestId" = $1`,
      [submitRes.refundRequestId ?? ''],
    );
    expect(liaRes.rowCount).toBe(1);
    expect(Number(liaRes.rows[0].amount)).toBe(2500);
    expect(liaRes.rows[0].status).toBe('unpaid');

    // 5. Verify quota returned for sale (AC-36, AC-90)
    const quotaAfter = await getTicketTypeAvailableQuota(fixture.pool, data.ticketTypeId);
    expect(quotaAfter.heldQuota).toBe(1); // 2 - 1 = 1
    expect(quotaAfter.availableQuota).toBe(19); // 20 - 1 = 19

    // 6. Verify scan behavior (AC-89): T1 rejected with TICKET_REFUNDED, T2 is not revoked
    const scanT1 = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId: data.sessionId,
      qrPayloadOrCode: t1.ticketCode,
      action: 'entry',
      now: new Date(data.sessionStartTime.getTime() + 10 * 60 * 1000), // 10 min after start (within window)
    });
    expect(scanT1.success).toBe(false);
    expect(scanT1.reason).toBe('TICKET_REFUNDED');
    expect(scanT1.message).toContain('บัตรถูกคืนเงินแล้ว');
  }, 30000);

  it('guarantees idempotency on repeated approval calls without duplicate liability or quota return (AC-90, AC-107)', async () => {
    const data = await purchasePaidOrder(1);
    const [ticket] = data.tickets;

    const submitRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: data.buyerToken,
      orderId: data.orderId,
      ticketIds: [ticket.id],
      reason: 'ขอคืนเงินทดสอบ idempotency',
    });
    expect(submitRes.success).toBe(true);

    // First approval
    const app1 = await approveRefundRequest(fixture.pool, {
      refundRequestId: submitRes.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: fixtureAccounts.owner.name,
      reviewerRole: 'owner',
    });
    expect(app1.success).toBe(true);
    expect(app1.alreadyApproved).toBeFalsy();

    // Repeated approval (same request)
    const app2 = await approveRefundRequest(fixture.pool, {
      refundRequestId: submitRes.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: fixtureAccounts.owner.name,
      reviewerRole: 'owner',
    });
    expect(app2.success).toBe(true);
    expect(app2.alreadyApproved).toBe(true);

    // Verify liability table still has exactly 1 entry
    const liaCount = await fixture.pool.query(
      `SELECT count(*)::int as c FROM refund_liabilities WHERE "refundRequestId" = $1`,
      [submitRes.refundRequestId ?? ''],
    );
    expect(liaCount.rows[0].c).toBe(1);

    // Verify quota only returned once
    const quota = await getTicketTypeAvailableQuota(fixture.pool, data.ticketTypeId);
    expect(quota.heldQuota).toBe(0); // 1 - 1 = 0
    expect(quota.availableQuota).toBe(20);
  }, 30000);

  it('rejects refund approval if ticket was admitted in venue (AC-88)', async () => {
    const data = await purchasePaidOrder(1);
    const [ticket] = data.tickets;

    // 1. Submit refund request (pending)
    const submitRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: data.buyerToken,
      orderId: data.orderId,
      ticketIds: [ticket.id],
      reason: 'ขอยื่นก่อนเข้างาน',
    });
    expect(submitRes.success).toBe(true);

    // 2. Ticket enters the venue (admitted)
    await fixture.pool.query(
      `INSERT INTO ticket_admission_logs (
         id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'entry', 'success', now())`,
      [
        `log-${Date.now()}`,
        ticket.id,
        ticket.ticketCode,
        data.eventId,
        data.sessionId,
        fixture.ids.scanner,
        fixtureAccounts.scanner.name,
      ],
    );

    // 3. Ticket exits the venue (admissionStatus = 'outside')
    await fixture.pool.query(
      `INSERT INTO ticket_admission_logs (
         id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'exit', 'success', now())`,
      [
        `log-${Date.now() + 1}`,
        ticket.id,
        ticket.ticketCode,
        data.eventId,
        data.sessionId,
        fixture.ids.scanner,
        fixtureAccounts.scanner.name,
      ],
    );

    // 4. Owner tries to approve refund request -> Must be rejected per AC-88
    const approveRes = await approveRefundRequest(fixture.pool, {
      refundRequestId: submitRes.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: fixtureAccounts.owner.name,
      reviewerRole: 'owner',
    });

    expect(approveRes.success).toBe(false);
    expect(approveRes.code).toBe('TICKET_ALREADY_ADMITTED');
    expect(approveRes.error).toContain('มีประวัติการสแกนเข้างานแล้ว');

    // Ticket remains valid and not refunded
    const tCheck = await fixture.pool.query(`SELECT status FROM tickets WHERE id = $1`, [ticket.id]);
    expect(tCheck.rows[0].status).toBe('valid');
  }, 30000);

  it('allows owner to reject a refund request and lists requests in owner dashboard', async () => {
    const data = await purchasePaidOrder(1);
    const [ticket] = data.tickets;

    const submitRes = await submitRefundRequest(fixture.pool, {
      verifiedToken: data.buyerToken,
      orderId: data.orderId,
      ticketIds: [ticket.id],
      reason: 'ขอยื่นเพื่อทดสอบ reject',
    });
    expect(submitRes.success).toBe(true);

    // List pending
    const pendingList = await listAllRefundRequests(fixture.pool, { status: 'pending' });
    expect(pendingList.some(r => r.id === submitRes.refundRequestId)).toBe(true);

    // Reject
    const rejRes = await rejectRefundRequest(fixture.pool, {
      refundRequestId: submitRes.refundRequestId ?? '',
      rejectionReason: 'ข้อมูลบัญชีธนาคารไม่ถูกต้อง กรุณาติดต่อฝ่ายบริการลูกค้า',
      reviewerUserId: fixture.ids.owner,
      reviewerName: fixtureAccounts.owner.name,
      reviewerRole: 'owner',
    });
    expect(rejRes.success).toBe(true);

    // Check status in DB
    const reqDb = await fixture.pool.query<{ status: string; rejectionReason: string }>(
      `SELECT status, "rejectionReason" FROM refund_requests WHERE id = $1`,
      [submitRes.refundRequestId ?? ''],
    );
    expect(reqDb.rows[0].status).toBe('rejected');
    expect(reqDb.rows[0].rejectionReason).toContain('ข้อมูลบัญชีธนาคารไม่ถูกต้อง');

    // Ticket remains valid
    const tCheck = await fixture.pool.query(`SELECT status FROM tickets WHERE id = $1`, [ticket.id]);
    expect(tCheck.rows[0].status).toBe('valid');
  }, 30000);
});
