import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { saveEventFeeSettings } from '../../src/server/fees';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import { submitRefundRequest, approveRefundRequest } from '../../src/server/refunds';
import {
  getEventMoneyReport,
  recordEventPayout,
  recordEventDebtRepayment,
} from '../../src/server/reports';
import { setCustomEmailTransport, clearCapturedEmails, getCapturedEmails } from '../../src/server/email';

describe('TASK-031: Event Debt & Repayment Integration Tests (AC-85, AC-86, G-33, G-39)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function setupEvent(organizerId: string, titleSuffix: string, ticketPrice = 1000) {
    const now = Date.now();
    const sessionStart = new Date(now + 240 * 3600 * 1000);
    const sessionEnd = new Date(sessionStart.getTime() + 4 * 3600 * 1000);

    const eventDraft = await createEventDraft(
      fixture.pool,
      organizerId,
      {
        title: `คอนเสิร์ต จัดการหนี้ ${titleSuffix} ${Date.now()}`,
        description: 'งานทดสอบ event debt isolation and repayment',
        location: 'Impact Arena',
        limitPerOrder: 4,
      },
      [
        {
          startTime: sessionStart.toISOString(),
          endTime: sessionEnd.toISOString(),
          ticketTypes: [
            {
              name: 'บัตรทั่วไป',
              price: ticketPrice,
              quota: 10,
              description: 'บัตรเข้าชม',
            },
          ],
        },
      ],
    );

    await approveSession(fixture.pool, eventDraft.sessions[0].id, fixture.ids.owner);

    await saveEventFeeSettings(
      fixture.pool,
      eventDraft.id,
      {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 10,
        customerFeeMode: 'per_order',
        customerFeeRate: 0,
        reservePercentage: 10,
      },
      fixture.ids.owner,
    );

    return {
      event: eventDraft,
      session: eventDraft.sessions[0],
      ticketType: eventDraft.sessions[0].ticketTypes[0],
    };
  }

  async function purchaseTickets(eventId: string, sessionId: string, ticketTypeId: string, quantity = 1) {
    clearCapturedEmails();
    const buyerEmail = `buyer-debt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const buyerPhone = '0812345678';
    const buyerName = 'คุณสมชาย จัดการหนี้';
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

    const reservation = await createReservation(fixture.pool, {
      eventId,
      sessionId,
      verifiedToken,
      items: [{ ticketTypeId, quantity }],
    });

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken,
    });

    const payResult = await verifyAndProcessPayment(fixture.pool, {
      chargeId: charge.id,
      providerPaidAt: new Date(),
    });

    return {
      orderId: reservation.id,
      tickets: payResult.tickets || [],
      buyerSessionToken: verifiedToken,
    };
  }

  it('1. Event isolation: Event A debt caused by refund after payout does NOT deduct Event B payable amount (AC-85, G-33)', async () => {
    // Organizer creates Event A and Event B
    const setupA = await setupEvent(fixture.ids.organizer, 'Event A (In Debt)');
    const setupB = await setupEvent(fixture.ids.organizer, 'Event B (In Profit)');

    // Purchase 1 ticket in Event A (1,000 THB)
    const purchaseA = await purchaseTickets(setupA.event.id, setupA.session.id, setupA.ticketType.id, 1);
    expect(purchaseA.tickets.length).toBe(1);

    // Initial accounting for Event A:
    // Gross = 1000, Fee = 100 -> E = 900, Reserve target = 90, Held H = 90, Payable = 810
    let reportA = await getEventMoneyReport(fixture.pool, setupA.event.id, { id: fixture.ids.owner, role: 'owner' });
    expect(reportA.netEntitlement).toBe(900);
    expect(reportA.actualHeldReserve).toBe(90);
    expect(reportA.payableAmount).toBe(810);
    expect(reportA.isDebt).toBe(false);

    // Owner pays out 810 THB to organizer for Event A
    const payoutRes = await recordEventPayout(fixture.pool, {
      eventId: setupA.event.id,
      amount: 810,
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });
    expect(payoutRes.success).toBe(true);

    // Report A after payout: E = 900, P = 810, L = 90, Held H = 90, Payable = 0
    reportA = await getEventMoneyReport(fixture.pool, setupA.event.id, { id: fixture.ids.owner, role: 'owner' });
    expect(reportA.totalPaidOut).toBe(810);
    expect(reportA.payableAmount).toBe(0);

    // Now, buyer submits refund request for Event A ticket (1,000 THB), and Owner approves it!
    const refundReq = await submitRefundRequest(fixture.pool, {
      orderId: purchaseA.orderId,
      ticketIds: [purchaseA.tickets[0].id],
      reason: 'ไม่สะดวกเดินทาง',
      verifiedToken: purchaseA.buyerSessionToken,
    });
    expect(refundReq.success).toBe(true);

    const approveRes = await approveRefundRequest(fixture.pool, {
      refundRequestId: refundReq.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'เจ้าของระบบ',
      reviewerRole: 'owner',
    });
    expect(approveRes.success).toBe(true);

    // Report A after approved refund:
    // Net sales = 0, Fee = 0 -> Net entitlement E = 0
    // Total paid out P = 810, Repayments X = 0
    // Net liability L = E - P + X = 0 - 810 + 0 = -810
    // Debt amount = 810, excessPayoutRefundDebt = 810, flatFeeDebt = 0
    // Held reserve H = 0, Payable = 0
    reportA = await getEventMoneyReport(fixture.pool, setupA.event.id, { id: fixture.ids.owner, role: 'owner' });
    expect(reportA.netEntitlement).toBe(0);
    expect(reportA.totalPaidOut).toBe(810);
    expect(reportA.netLiability).toBe(-810);
    expect(reportA.isDebt).toBe(true);
    expect(reportA.debtAmount).toBe(810);
    expect(reportA.excessPayoutRefundDebt).toBe(810);
    expect(reportA.flatFeeDebt).toBe(0);
    expect(reportA.actualHeldReserve).toBe(0);
    expect(reportA.payableAmount).toBe(0);

    // Now purchase 1 ticket in Event B (1,000 THB)
    await purchaseTickets(setupB.event.id, setupB.session.id, setupB.ticketType.id, 1);

    // Verify Event B money report:
    // E = 900, Held = 90, Payable = 810!
    // CRITICAL (AC-85): Event B's payable amount MUST NOT be reduced by Event A's 810 THB debt!
    const reportB = await getEventMoneyReport(fixture.pool, setupB.event.id, { id: fixture.ids.owner, role: 'owner' });
    expect(reportB.netEntitlement).toBe(900);
    expect(reportB.actualHeldReserve).toBe(90);
    expect(reportB.payableAmount).toBe(810);
    expect(reportB.isDebt).toBe(false);
    expect(reportB.debtAmount).toBe(0);
  });

  it('2. Owner records debt repayment X: updates accounting, reduces debt to 0, and preserves idempotency (AC-86, G-39)', async () => {
    // Setup event with debt
    const setup = await setupEvent(fixture.ids.organizer, 'Repayment Flow');
    const purchase = await purchaseTickets(setup.event.id, setup.session.id, setup.ticketType.id, 1);

    // Payout 810
    await recordEventPayout(fixture.pool, {
      eventId: setup.event.id,
      amount: 810,
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });

    // Refund ticket -> E = 0, P = 810 -> Debt = 810
    const refundReq = await submitRefundRequest(fixture.pool, {
      orderId: purchase.orderId,
      ticketIds: [purchase.tickets[0].id],
      reason: 'ขอคืนเงิน',
      verifiedToken: purchase.buyerSessionToken,
    });
    expect(refundReq.success).toBe(true);
    const approveRes = await approveRefundRequest(fixture.pool, {
      refundRequestId: refundReq.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'เจ้าของระบบ',
      reviewerRole: 'owner',
    });
    expect(approveRes.success).toBe(true);

    let report = await getEventMoneyReport(fixture.pool, setup.event.id, { id: fixture.ids.owner, role: 'owner' });
    expect(report.isDebt).toBe(true);
    expect(report.debtAmount).toBe(810);

    // Owner records debt repayment of 810 THB (AC-86)
    const repaymentRes = await recordEventDebtRepayment(fixture.pool, {
      eventId: setup.event.id,
      amount: 810,
      notes: 'ผู้จัดงานโอนชดเชยยอดค้างชำระเรียบร้อย',
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });

    expect(repaymentRes.success).toBe(true);
    expect(repaymentRes.amount).toBe(810);
    expect(repaymentRes.remainingDebt).toBe(0);
    expect(repaymentRes.newLiability).toBe(0);
    expect(repaymentRes.newPayableAmount).toBe(0);

    // Verify report reflects X = 810, L = 0, isDebt = false, debtAmount = 0
    report = await getEventMoneyReport(fixture.pool, setup.event.id, { id: fixture.ids.owner, role: 'owner' });
    expect(report.totalDebtRepaid).toBe(810);
    expect(report.netLiability).toBe(0);
    expect(report.isDebt).toBe(false);
    expect(report.debtAmount).toBe(0);
    expect(report.repayments.length).toBe(1);
    expect(report.repayments[0].amount).toBe(810);
    expect(report.repayments[0].notes).toBe('ผู้จัดงานโอนชดเชยยอดค้างชำระเรียบร้อย');

    // Repeated repayment within 15-second duplicate window returns existing record idempotently (G-39)
    const dupRes = await recordEventDebtRepayment(fixture.pool, {
      eventId: setup.event.id,
      amount: 810,
      notes: 'ผู้จัดงานโอนชดเชยยอดค้างชำระเรียบร้อย',
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });

    expect(dupRes.success).toBe(true);
    expect(dupRes.alreadyRecorded).toBe(true);
    expect(dupRes.repaymentId).toBe(repaymentRes.repaymentId);

    // Still only 1 repayment recorded
    report = await getEventMoneyReport(fixture.pool, setup.event.id, { id: fixture.ids.owner, role: 'owner' });
    expect(report.totalDebtRepaid).toBe(810);
    expect(report.repayments.length).toBe(1);
  });

  it('3. Role enforcement & validation: organizer/scanner forbidden, reject invalid amounts & excess repayment (AC-86)', async () => {
    const setup = await setupEvent(fixture.ids.organizer, 'Role & Validation');
    const purchase = await purchaseTickets(setup.event.id, setup.session.id, setup.ticketType.id, 1);

    await recordEventPayout(fixture.pool, {
      eventId: setup.event.id,
      amount: 810,
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });

    const refundReq = await submitRefundRequest(fixture.pool, {
      orderId: purchase.orderId,
      ticketIds: [purchase.tickets[0].id],
      reason: 'ขอคืนเงิน',
      verifiedToken: purchase.buyerSessionToken,
    });
    expect(refundReq.success).toBe(true);
    const approveRes = await approveRefundRequest(fixture.pool, {
      refundRequestId: refundReq.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'เจ้าของระบบ',
      reviewerRole: 'owner',
    });
    expect(approveRes.success).toBe(true);

    // Organizer attempts to record debt repayment -> FORBIDDEN
    const orgRes = await recordEventDebtRepayment(fixture.pool, {
      eventId: setup.event.id,
      amount: 100,
      recordedBy: fixture.ids.organizer,
      actorRole: 'organizer',
    });
    expect(orgRes.success).toBe(false);
    expect(orgRes.code).toBe('FORBIDDEN');

    // Scanner attempts to record debt repayment -> FORBIDDEN
    const scannerRes = await recordEventDebtRepayment(fixture.pool, {
      eventId: setup.event.id,
      amount: 100,
      recordedBy: fixture.ids.scanner,
      actorRole: 'scanner',
    });
    expect(scannerRes.success).toBe(false);
    expect(scannerRes.code).toBe('FORBIDDEN');

    // Rejects invalid amount <= 0
    const zeroRes = await recordEventDebtRepayment(fixture.pool, {
      eventId: setup.event.id,
      amount: 0,
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });
    expect(zeroRes.success).toBe(false);
    expect(zeroRes.code).toBe('INVALID_AMOUNT');

    // Rejects amount exceeding debt (debt is 810, trying to repay 900)
    const excessRes = await recordEventDebtRepayment(fixture.pool, {
      eventId: setup.event.id,
      amount: 900,
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });
    expect(excessRes.success).toBe(false);
    expect(excessRes.code).toBe('AMOUNT_EXCEEDS_DEBT');
  });
});
