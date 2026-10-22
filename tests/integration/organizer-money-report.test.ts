import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
} from '../../src/server/events';
import {
  saveEventFeeSettings,
} from '../../src/server/fees';
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

describe('TASK-028: Organizer Money Report Integration Tests (AC-28, AC-64, AC-77, AC-78, AC-80, AC-81, AC-82, AC-110, AC-07, AC-84)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function createEventForOrganizer(organizerId: string, feeRate = 5, reservePct = 10) {
    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000);
    const sessionEndTime = new Date(sessionStartTime.getTime() + 4 * 3600 * 1000);

    const eventDraft = await createEventDraft(
      fixture.pool,
      organizerId,
      {
        title: `คอนเสิร์ต รายงานการเงิน ${Date.now()}`,
        description: 'งานแสดงดนตรีสำหรับทดสอบ organizer money report',
        location: 'Impact Arena',
        posterUrl: undefined,
      },
      [
        {
          startTime: sessionStartTime.toISOString(),
          endTime: sessionEndTime.toISOString(),
          ticketTypes: [{ name: 'Standing VIP', price: 1000, quota: 20 }],
        },
      ],
    );

    const sessionId = eventDraft.sessions[0].id;
    const ticketTypeId = eventDraft.sessions[0].ticketTypes[0].id;

    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // Set fees: percentage mode at feeRate%, customer fee per_ticket 20, reserve reservePct%
    await saveEventFeeSettings(
      fixture.pool,
      eventDraft.id,
      {
        organizerFeeMode: 'percentage',
        organizerFeeRate: feeRate,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 20,
        reservePercentage: reservePct,
      },
      fixture.ids.owner,
    );

    return { event: eventDraft, sessionId, ticketTypeId, sessionStartTime, sessionEndTime };
  }

  async function purchaseTickets(eventId: string, sessionId: string, ticketTypeId: string, quantity = 2) {
    clearCapturedEmails();
    const buyerEmail = `buyer-rpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const buyerPhone = '0812345678';
    const buyerName = 'คุณทดสอบ ผู้ซื้อรายงาน';
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
      verifiedToken,
      eventId,
      sessionId,
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

    return { reservation, charge, payResult, buyerEmail, buyerPhone, buyerName, verifiedToken };
  }

  it('1. Generates accurate money report with ticket sales, per-order fees, approved refund deductions, and reserve (AC-28, AC-77, AC-78, AC-80, AC-81, AC-110)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventForOrganizer(fixture.ids.organizer, 5, 10);

    // Order 1: 2 tickets at 1000 = 2000 THB
    const order1 = await purchaseTickets(event.id, sessionId, ticketTypeId, 2);
    expect(order1.payResult.tickets?.length).toBe(2);

    // Order 2: 1 ticket at 1000 = 1000 THB
    const order2 = await purchaseTickets(event.id, sessionId, ticketTypeId, 1);
    expect(order2.payResult.tickets?.length).toBe(1);

    // Partial refund: Refund 1 ticket from Order 1
    const ticketToRefund = order1.payResult.tickets?.[0];
    if (!ticketToRefund) throw new Error('Ticket not found');
    const refundSubmit = await submitRefundRequest(fixture.pool, {
      verifiedToken: order1.verifiedToken,
      orderId: order1.reservation.id,
      ticketIds: [ticketToRefund.id],
      reason: 'ขอคืนเงิน 1 ใบสำหรับการทดสอบ',
    });
    expect(refundSubmit.success).toBe(true);

    const refundApprove = await approveRefundRequest(fixture.pool, {
      refundRequestId: refundSubmit.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'Owner Admin',
      reviewerRole: 'owner',
      now: new Date(),
    });
    expect(refundApprove.success).toBe(true);

    // Fetch report as organizer
    const report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.organizer,
      role: 'organizer',
    });

    // Verification:
    // Gross sales = 2000 (order1) + 1000 (order2) = 3000 THB
    expect(report.grossSales).toBe(3000);
    // Approved refund deductions = 1000 THB (ticket 1 refunded)
    expect(report.approvedRefundDeductions).toBe(1000);
    // Net sales = 3000 - 1000 = 2000 THB
    expect(report.netSales).toBe(2000);

    // Order fees (AC-78, AC-80, G-28, G-48):
    // Order 1 adjusted fee: R(1000 * 5%) = 50.00 THB
    // Order 2 fee: R(1000 * 5%) = 50.00 THB
    // Total organizer fee = 50 + 50 = 100.00 THB
    expect(report.organizerFee).toBe(100);

    // Net Entitlement E = 2000 - 100 = 1900 THB (AC-77)
    expect(report.netEntitlement).toBe(1900);

    // Reserve target = R(1900 * 10%) = 190.00 THB (AC-81)
    expect(report.reserveTarget).toBe(190);
    expect(report.actualHeldReserve).toBe(190);

    // Payable amount = 1900 - 190 = 1710.00 THB
    expect(report.payableAmount).toBe(1710);
    expect(report.isDebt).toBe(false);
    expect(report.debtAmount).toBe(0);

    // Verify order breakdown count
    expect(report.orders.length).toBe(2);
    expect(report.totalTicketsIssuedCount).toBe(3);
    expect(report.totalTicketsValidCount).toBe(2);
    expect(report.totalTicketsRefundedCount).toBe(1);
  });

  it('2. Unissued cancellation and late refund cases are excluded from organizer net sales and not deducted again (AC-84)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventForOrganizer(fixture.ids.organizer, 5, 10);

    // Order with 1 ticket issued
    await purchaseTickets(event.id, sessionId, ticketTypeId, 1);

    // Simulate an unissued late-payment recovery case (G-35) directly in payment_charges and refund_liabilities
    // that never had tickets in the tickets table
    const unissuedOrderId = `ORD-UNISSUED-${Date.now()}`;
    await fixture.pool.query(
      `INSERT INTO orders (
         id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
         status, subtotal, "customerFee", total, "customerFeeMode", "customerFeeRate",
         "reservedAt", "expiresAt", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, 'late@example.com', 'Late Buyer', '0810001111', 'payment_exception', 1000, 20, 1020, 'per_ticket', 20, now(), now(), now(), now())`,
      [unissuedOrderId, event.id, sessionId],
    );

    // Record an unissued refund liability (e.g. late payment full refund)
    const refundReqId = `REF-UNISSUED-${Date.now()}`;
    await fixture.pool.query(
      `INSERT INTO refund_requests (
         id, "orderId", "buyerEmail", "buyerPhone", "buyerName", "requestedAmount", reason, status, "submittedAt", "createdAt", "updatedAt"
       ) VALUES ($1, $2, 'late@example.com', '0810001111', 'Late Buyer', 1020, 'G-35 unissued late refund', 'approved', now(), now(), now())`,
      [refundReqId, unissuedOrderId],
    );
    await fixture.pool.query(
      `INSERT INTO refund_liabilities (
         id, "refundRequestId", "orderId", "eventId", "sessionId", amount, status, "approvedAt", "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, 1020, 'unpaid', now(), now())`,
      [`LIA-${Date.now()}`, refundReqId, unissuedOrderId, event.id, sessionId],
    );

    // Fetch report
    const report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.organizer,
      role: 'organizer',
    });

    // Verification (AC-84):
    // Only the 1 issued ticket (1000 THB) is in gross sales and net sales.
    // The unissued order (1020 THB) is NOT included in gross sales, and its 1020 THB refund is NOT deducted from organizer net sales!
    expect(report.grossSales).toBe(1000);
    expect(report.netSales).toBe(1000);
    expect(report.approvedRefundDeductions).toBe(0);
    expect(report.organizerFee).toBe(50); // 1000 * 5%
    expect(report.netEntitlement).toBe(950);
  });

  it('3. Controlled transactions: payout (P), over-payout debt (L < 0), and debt repayment (X) work correctly (AC-81, AC-85, AC-86, G-33, G-39)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventForOrganizer(fixture.ids.organizer, 5, 10);

    // 1 ticket sold: 1000 THB, fee = 50, E = 950, reserve = 95, payable = 855
    const order = await purchaseTickets(event.id, sessionId, ticketTypeId, 1);

    // Record payout of P = 855
    await recordEventPayout(fixture.pool, {
      eventId: event.id,
      amount: 855,
      recordedBy: fixture.ids.owner,
    });

    let report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.organizer,
      role: 'organizer',
    });
    expect(report.totalPaidOut).toBe(855);
    expect(report.payableAmount).toBe(0); // All payable paid out

    // Now ticket is refunded after payout: net sales becomes 0, F becomes 0 -> E = 0
    const refundTicket = order.payResult.tickets?.[0];
    if (!refundTicket) throw new Error('Ticket not found');
    const refundSubmit = await submitRefundRequest(fixture.pool, {
      verifiedToken: order.verifiedToken,
      orderId: order.reservation.id,
      ticketIds: [refundTicket.id],
      reason: 'คืนบัตรหลังโอนเงินจ่ายแล้ว',
    });
    const refundApprove = await approveRefundRequest(fixture.pool, {
      refundRequestId: refundSubmit.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'Owner Admin',
      reviewerRole: 'owner',
      now: new Date(),
    });
    expect(refundApprove.success).toBe(true);

    // Report after refund: E = 0, P = 855 -> L = 0 - 855 = -855 (Debt 855)
    report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.organizer,
      role: 'organizer',
    });
    expect(report.netSales).toBe(0);
    expect(report.netEntitlement).toBe(0);
    expect(report.netLiability).toBe(-855);
    expect(report.isDebt).toBe(true);
    expect(report.debtAmount).toBe(855);
    expect(report.actualHeldReserve).toBe(0);
    expect(report.payableAmount).toBe(0);

    // Record debt repayment from organizer: X = 855
    await recordEventDebtRepayment(fixture.pool, {
      eventId: event.id,
      amount: 855,
      notes: 'ผู้จัดงานโอนชดเชยยอดค้างชำระ',
      recordedBy: fixture.ids.owner,
    });

    // Report after repayment: L = 0 - 855 + 855 = 0
    report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.organizer,
      role: 'organizer',
    });
    expect(report.netLiability).toBe(0);
    expect(report.isDebt).toBe(false);
    expect(report.debtAmount).toBe(0);
    expect(report.payableAmount).toBe(0);
  });

  it('4. Role access isolation and contact privacy masking (AC-07, AC-64, AC-82)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventForOrganizer(fixture.ids.organizer, 5, 10);
    const order = await purchaseTickets(event.id, sessionId, ticketTypeId, 1);

    // 4A. Organizer reads their own report -> Buyer name visible, but email and phone are partially masked (AC-64)
    const organizerReport = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.organizer,
      role: 'organizer',
    });
    expect(organizerReport.orders.length).toBe(1);
    const ord = organizerReport.orders[0];
    expect(ord.buyerName).toBe(order.buyerName);
    expect(ord.buyerEmail).toContain('***@');
    expect(ord.buyerEmail).not.toBe(order.buyerEmail); // Must NOT be raw email
    expect(ord.buyerPhone).toContain('***');
    expect(ord.buyerPhone).not.toBe(order.buyerPhone); // Must NOT be raw phone

    // 4B. Cross-organizer denial: Organizer B attempts to read Organizer A's event -> 403 Forbidden (AC-07, AC-82)
    const otherOrganizerId = randomUUID();
    await expect(
      getEventMoneyReport(fixture.pool, event.id, {
        id: otherOrganizerId,
        role: 'organizer',
      }),
    ).rejects.toThrow(/ผู้จัดงานสามารถเข้าถึงรายงานได้เฉพาะงานของตนเองเท่านั้น/);

    // 4C. Scanner denial: Scanner attempts to read report -> 403 Forbidden (AC-82)
    await expect(
      getEventMoneyReport(fixture.pool, event.id, {
        id: fixture.ids.scanner,
        role: 'scanner',
      }),
    ).rejects.toThrow(/ทีมสแกนไม่มีสิทธิ์เข้าถึงรายงานการเงิน/);

    // 4D. Owner reads report -> full unmasked contact data available for back-office auditing
    const ownerReport = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });
    expect(ownerReport.orders[0].buyerEmail).toBe(order.buyerEmail);
    expect(ownerReport.orders[0].buyerPhone).toBe(order.buyerPhone);
  });
});
