import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { saveEventFeeSettings } from '../../src/server/fees';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  getEventMoneyReport,
  recordEventPayout,
  getPayoutProof,
} from '../../src/server/reports';
import { setCustomEmailTransport, clearCapturedEmails, getCapturedEmails } from '../../src/server/email';
import { storage } from '../../src/server/storage';

describe('TASK-029: Weekly Manual Payout Integration Tests (AC-27, AC-30, AC-31, AC-79, AC-87, AC-92, AC-93)', () => {
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
        title: `คอนเสิร์ต จ่ายเงินรายสัปดาห์ ${Date.now()}`,
        description: 'งานแสดงดนตรีสำหรับทดสอบ weekly manual payout',
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

    return { reservation, charge, payResult, buyerEmail, buyerPhone, buyerName, verifiedToken };
  }

  it('1. Owner records weekly manual payout from payable amount; payable decreases and paid out increases (AC-27, AC-30, AC-79)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventForOrganizer(fixture.ids.organizer, 5, 10);

    // 2 tickets at 1000 = 2000 THB. Fee = 5% of 2000 = 100. E = 1900. Reserve = 10% of 1900 = 190. Payable = 1710
    await purchaseTickets(event.id, sessionId, ticketTypeId, 2);

    const reportBefore = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });

    expect(reportBefore.netEntitlement).toBe(1900);
    expect(reportBefore.actualHeldReserve).toBe(190);
    expect(reportBefore.totalPaidOut).toBe(0);
    expect(reportBefore.payableAmount).toBe(1710);
    expect(reportBefore.payouts.length).toBe(0);

    // Put a dummy proof slip in private storage
    const proofFile = Buffer.from('PDF_SLIP_PROOF_TASK_029');
    const uploadResult = await storage.put('payout-proof-test-1.pdf', proofFile, 'application/pdf', 'private');

    // Owner records weekly manual payout of 1710 THB
    const payoutResult = await recordEventPayout(fixture.pool, {
      eventId: event.id,
      amount: 1710,
      status: 'completed',
      paidAt: new Date(),
      transferProofKey: uploadResult.key,
      transferProofUrl: uploadResult.url,
      transferNote: 'โอนรอบสัปดาห์ที่ 1',
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });

    expect(payoutResult.success).toBe(true);
    expect(payoutResult.payoutId).toMatch(/^PO-/);
    expect(payoutResult.payableAmount).toBe(0);

    // Report after payout: Total paid out = 1710, Payable = 0
    const reportAfter = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });

    expect(reportAfter.totalPaidOut).toBe(1710);
    expect(reportAfter.payableAmount).toBe(0);
    expect(reportAfter.payouts.length).toBe(1);
    expect(reportAfter.payouts[0].id).toBe(payoutResult.payoutId);
    expect(reportAfter.payouts[0].amount).toBe(1710);
    expect(reportAfter.payouts[0].status).toBe('completed');
    expect(reportAfter.payouts[0].transferProofKey).toBe(uploadResult.key);
    expect(reportAfter.payouts[0].transferProofUrl).toBe(uploadResult.url);
  });

  it('2. Payout history visibility and private proof storage boundary (AC-31, AC-92)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventForOrganizer(fixture.ids.organizer, 5, 10);
    await purchaseTickets(event.id, sessionId, ticketTypeId, 1); // 1000 THB -> fee 50 -> E 950 -> H 95 -> payable 855

    const proofFile = Buffer.from('CONFIDENTIAL_BANK_SLIP_AC_92');
    const upload = await storage.put('slip-private-ac92.png', proofFile, 'image/png', 'private');

    const payout = await recordEventPayout(fixture.pool, {
      eventId: event.id,
      amount: 855,
      status: 'completed',
      paidAt: new Date(),
      transferProofKey: upload.key,
      transferProofUrl: upload.url,
      transferNote: 'โอนเงินสดผ่านธนาคาร',
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });

    expect(payout.success).toBe(true);

    // 2A. Organizer opens report: Sees payout history, but transferProofKey and transferProofUrl are NULL (AC-31, AC-92)
    const organizerReport = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.organizer,
      role: 'organizer',
    });

    expect(organizerReport.payouts.length).toBe(1);
    const orgPayout = organizerReport.payouts[0];
    expect(orgPayout.id).toBe(payout.payoutId);
    expect(orgPayout.amount).toBe(855);
    expect(orgPayout.status).toBe('completed');
    expect(orgPayout.transferNote).toBe('โอนเงินสดผ่านธนาคาร');
    expect(orgPayout.transferProofKey).toBeNull();
    expect(orgPayout.transferProofUrl).toBeNull();

    // 2B. Direct proof download by non-owner is rejected with 403 Forbidden (AC-92)
    const payoutId = payout.payoutId || '';
    const organizerProofAccess = await getPayoutProof(fixture.pool, {
      payoutId,
      actorRole: 'organizer',
    });
    expect(organizerProofAccess.success).toBe(false);
    expect(organizerProofAccess.code).toBe('FORBIDDEN');

    const scannerProofAccess = await getPayoutProof(fixture.pool, {
      payoutId,
      actorRole: 'scanner',
    });
    expect(scannerProofAccess.success).toBe(false);
    expect(scannerProofAccess.code).toBe('FORBIDDEN');

    // 2C. Owner downloads proof successfully
    const ownerProofAccess = await getPayoutProof(fixture.pool, {
      payoutId,
      actorRole: 'owner',
    });
    expect(ownerProofAccess.success).toBe(true);
    expect(ownerProofAccess.data).toBeDefined();
    expect(ownerProofAccess.data?.toString()).toBe('CONFIDENTIAL_BANK_SLIP_AC_92');
    expect(ownerProofAccess.contentType).toBe('image/png');
  });

  it('3. Duplicate submission protection does not double-deduct payable (AC-87)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventForOrganizer(fixture.ids.organizer, 5, 10);
    await purchaseTickets(event.id, sessionId, ticketTypeId, 1); // payable 855

    // First submission
    const firstPayout = await recordEventPayout(fixture.pool, {
      eventId: event.id,
      amount: 855,
      status: 'completed',
      paidAt: new Date(),
      transferNote: 'โอนงวดที่ 1',
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });
    expect(firstPayout.success).toBe(true);
    expect(firstPayout.payableAmount).toBe(0);

    // Immediate repeat submission with same amount within 15s
    const repeatPayout = await recordEventPayout(fixture.pool, {
      eventId: event.id,
      amount: 855,
      status: 'completed',
      paidAt: new Date(),
      transferNote: 'โอนงวดที่ 1',
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });

    expect(repeatPayout.success).toBe(true);
    expect(repeatPayout.payoutId).toBe(firstPayout.payoutId); // Returns same payout ID without inserting duplicate

    const report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });
    expect(report.totalPaidOut).toBe(855); // Paid out exactly once, not 1710
    expect(report.payableAmount).toBe(0);
    expect(report.payouts.length).toBe(1);
  });

  it('4. Payout failure handling: Failed transfer preserves payable amount and allows retry (AC-93)', async () => {
    const { event, sessionId, ticketTypeId } = await createEventForOrganizer(fixture.ids.organizer, 5, 10);
    await purchaseTickets(event.id, sessionId, ticketTypeId, 1); // payable 855

    // Owner records payout failure (e.g. invalid bank account number)
    const failedPayout = await recordEventPayout(fixture.pool, {
      eventId: event.id,
      amount: 855,
      status: 'failed',
      paidAt: new Date(),
      transferFailureReason: 'เลขที่บัญชีธนาคารของผู้จัดงานไม่ถูกต้อง',
      transferNote: 'ลองโอนแต่ธนาคารปฏิเสธ',
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });

    expect(failedPayout.success).toBe(true);
    expect(failedPayout.status).toBe('failed');

    // Report check: Failed payout did NOT reduce payable amount! Paid out is still 0
    let report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });

    expect(report.totalPaidOut).toBe(0);
    expect(report.payableAmount).toBe(855);
    expect(report.payouts.length).toBe(1);
    expect(report.payouts[0].status).toBe('failed');
    expect(report.payouts[0].transferFailureReason).toBe('เลขที่บัญชีธนาคารของผู้จัดงานไม่ถูกต้อง');

    // Owner retries with correct bank details -> completed
    const retryPayout = await recordEventPayout(fixture.pool, {
      eventId: event.id,
      amount: 855,
      status: 'completed',
      paidAt: new Date(),
      transferNote: 'โอนซ้ำสำเร็จหลังแก้ไขเลขที่บัญชี',
      recordedBy: fixture.ids.owner,
      actorRole: 'owner',
    });

    expect(retryPayout.success).toBe(true);
    expect(retryPayout.status).toBe('completed');
    expect(retryPayout.payableAmount).toBe(0);

    // Final report: 2 payouts in history (1 failed, 1 completed), totalPaidOut = 855, payableAmount = 0
    report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });

    expect(report.totalPaidOut).toBe(855);
    expect(report.payableAmount).toBe(0);
    expect(report.payouts.length).toBe(2);
  });
});
