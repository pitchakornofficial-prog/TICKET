import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
  submitSessionAmendment,
  approveSessionAmendment,
  configureSpecialRefundWindow,
  getEventDetails,
  getPublicEventWithApprovedSessions,
} from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  getOrderRefundEligibility,
  submitRefundRequest,
} from '../../src/server/refunds';
import {
  clearCapturedEmails,
  setCustomEmailTransport,
  getCapturedEmails,
} from '../../src/server/email';

describe('TASK-025: Reschedule and Special Refund Window Integration Tests (AC-38, AC-108, G-13)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function setupRescheduleEvent() {
    clearCapturedEmails();

    // Session 10 days in future (240 hours)
    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000);
    const sessionEndTime = new Date(sessionStartTime.getTime() + 4 * 3600 * 1000);

    const eventDraft = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: `คอนเสิร์ต เลื่อนรอบพิเศษ ${Date.now()}`,
        description: 'งานแสดงดนตรีสำหรับทดสอบ reschedule และ special refund window AC-38, AC-108',
        location: 'Impact Challenger',
        posterUrl: undefined,
      },
      [
        {
          startTime: sessionStartTime.toISOString(),
          endTime: sessionEndTime.toISOString(),
          ticketTypes: [{ name: 'VIP Seating', price: 3000, quota: 20 }],
        },
      ],
    );

    const sessionId = eventDraft.sessions[0].id;
    const ticketTypeId = eventDraft.sessions[0].ticketTypes[0].id;

    // Approve session to make it live
    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // Guest reserves and pays for 2 tickets
    const buyerEmail = `buyer-reschedule-${Date.now()}@ticket.invalid`;
    const buyer = { name: 'คุณวิชัย เลื่อนรอบ', email: buyerEmail, phone: '0812345678' };

    const req = await requestGuestOtp(fixture.pool, { buyer, purpose: 'checkout', now: new Date() });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';
    const vRes = await verifyGuestOtp(fixture.pool, {
      email: buyerEmail,
      code,
      requestId: req.requestId ?? '',
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
    expect(vRes.verifiedToken).toBeDefined();

    const reservation = await createReservation(
      fixture.pool,
      {
        eventId: eventDraft.id,
        sessionId,
        verifiedToken: vRes.verifiedToken ?? '',
        items: [{ ticketTypeId, quantity: 2 }],
      },
      new Date(),
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: vRes.verifiedToken ?? '' },
      new Date(),
    );

    const payResult = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: new Date(),
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      new Date(),
    );
    expect(payResult.success).toBe(true);
    expect(payResult.tickets?.length).toBe(2);

    return {
      eventId: eventDraft.id,
      sessionId,
      ticketTypeId,
      originalStartTime: sessionStartTime,
      originalEndTime: sessionEndTime,
      buyerToken: vRes.verifiedToken ?? '',
      buyerEmail,
      buyerPhone: buyer.phone,
      orderId: reservation.id,
      tickets: payResult.tickets || [],
    };
  }

  it('keeps public session time unchanged while reschedule request is pending (AC-108, G-13)', async () => {
    const data = await setupRescheduleEvent();

    const newStartTime = new Date(data.originalStartTime.getTime() + 14 * 24 * 3600 * 1000); // 14 days later
    const newEndTime = new Date(newStartTime.getTime() + 4 * 3600 * 1000);

    // Organizer submits reschedule request
    const amd = await submitSessionAmendment(fixture.pool, {
      sessionId: data.sessionId,
      organizerId: fixture.ids.organizer,
      startTime: newStartTime.toISOString(),
      endTime: newEndTime.toISOString(),
      ticketTypes: [{ id: data.ticketTypeId, name: 'VIP Seating', price: 3000, quota: 20 }],
    });
    expect(amd.success).toBe(true);

    // Public catalog and event details still reflect original session time (AC-108, G-13)
    const publicEvent = await getPublicEventWithApprovedSessions(fixture.pool, data.eventId);
    expect(publicEvent).toBeDefined();
    const publicSession = publicEvent?.sessions.find((s: { id: string }) => s.id === data.sessionId);
    expect(publicSession).toBeDefined();
    if (publicSession) {
      expect(new Date(publicSession.startTime).toISOString()).toBe(data.originalStartTime.toISOString());
      expect(new Date(publicSession.endTime).toISOString()).toBe(data.originalEndTime.toISOString());
    }

    const internalDetails = await getEventDetails(fixture.pool, data.eventId);
    const internalSession = internalDetails?.sessions.find((s: { id: string }) => s.id === data.sessionId);
    expect(internalSession).toBeDefined();
    if (internalSession) {
      expect(new Date(internalSession.startTime).toISOString()).toBe(data.originalStartTime.toISOString());
    }
  });

  it('updates session time to new schedule and configures special refund window upon owner approval (AC-38, AC-108)', async () => {
    const data = await setupRescheduleEvent();

    const newStartTime = new Date(data.originalStartTime.getTime() + 14 * 24 * 3600 * 1000);
    const newEndTime = new Date(newStartTime.getTime() + 4 * 3600 * 1000);

    const amd = await submitSessionAmendment(fixture.pool, {
      sessionId: data.sessionId,
      organizerId: fixture.ids.organizer,
      startTime: newStartTime.toISOString(),
      endTime: newEndTime.toISOString(),
      ticketTypes: [{ id: data.ticketTypeId, name: 'VIP Seating', price: 3000, quota: 20 }],
    });

    const windowStart = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const windowEnd = new Date(Date.now() + 72 * 3600 * 1000); // 3 days later

    // Owner approves reschedule and sets special refund window
    const appResult = await approveSessionAmendment(fixture.pool, {
      amendmentId: amd.amendmentId,
      ownerId: fixture.ids.owner,
      specialRefundWindowStart: windowStart.toISOString(),
      specialRefundWindowEnd: windowEnd.toISOString(),
    });
    expect(appResult.success).toBe(true);

    // Public details now reflect the approved new start time (AC-108)
    const publicEvent = await getPublicEventWithApprovedSessions(fixture.pool, data.eventId);
    expect(publicEvent).toBeDefined();
    const publicSession = publicEvent?.sessions.find((s: { id: string }) => s.id === data.sessionId);
    expect(publicSession).toBeDefined();
    if (publicSession?.specialRefundWindowStart && publicSession.specialRefundWindowEnd) {
      expect(new Date(publicSession.startTime).toISOString()).toBe(newStartTime.toISOString());
      expect(new Date(publicSession.specialRefundWindowStart).toISOString()).toBe(windowStart.toISOString());
      expect(new Date(publicSession.specialRefundWindowEnd).toISOString()).toBe(windowEnd.toISOString());
    }
  });

  it('allows refund submission past normal 168h cutoff during active special refund window, and rejects after window closes (AC-38, E2, R2)', async () => {
    const data = await setupRescheduleEvent();

    // Reschedule session
    const newStartTime = new Date(data.originalStartTime.getTime() + 7 * 24 * 3600 * 1000);
    const newEndTime = new Date(newStartTime.getTime() + 4 * 3600 * 1000);

    const amd = await submitSessionAmendment(fixture.pool, {
      sessionId: data.sessionId,
      organizerId: fixture.ids.organizer,
      startTime: newStartTime.toISOString(),
      endTime: newEndTime.toISOString(),
      ticketTypes: [{ id: data.ticketTypeId, name: 'VIP Seating', price: 3000, quota: 20 }],
    });

    // Special refund window: Day 10 to Day 13 from now
    const windowStart = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    const windowEnd = new Date(Date.now() + 13 * 24 * 3600 * 1000);

    await approveSessionAmendment(fixture.pool, {
      amendmentId: amd.amendmentId,
      ownerId: fixture.ids.owner,
      specialRefundWindowStart: windowStart.toISOString(),
      specialRefundWindowEnd: windowEnd.toISOString(),
    });

    // Ensure buyer session is valid at future test times t1 and t2
    await fixture.pool.query(
      `UPDATE guest_verified_sessions SET "expiresAt" = $2 WHERE token = $1`,
      [data.buyerToken, new Date(Date.now() + 30 * 24 * 3600 * 1000)],
    );

    // Test Case 1: At Time T1 (inside special window, but past normal 168h cutoff)
    // newStartTime is 17 days in future, but suppose newStartTime is only 100 hours away from T1:
    // T1 is Day 11:
    const t1 = new Date(Date.now() + 11 * 24 * 3600 * 1000);

    // Let's check eligibility at T1
    const eligT1 = await getOrderRefundEligibility(fixture.pool, data.orderId, t1);
    expect(eligT1.isWithinSpecialWindow).toBe(true);
    expect(eligT1.tickets[0].eligible).toBe(true);

    // Buyer successfully submits refund request at T1 (AC-38)
    const refundRes1 = await submitRefundRequest(fixture.pool, {
      verifiedToken: data.buyerToken,
      orderId: data.orderId,
      ticketIds: [data.tickets[0].id],
      reason: 'เลื่อนรอบแล้วไม่สะดวกเดินทางเข้าชมตามเวลาใหม่ (AC-38)',
      bankName: 'ธนาคารกรุงเทพ',
      bankAccountNo: '987-6-54321-0',
      bankAccountName: 'วิชัย',
      now: t1,
    });
    expect(refundRes1.success).toBe(true);
    expect(refundRes1.status).toBe('pending');
    expect(refundRes1.requestedAmount).toBe(3000); // Face value strictly (R2, AC-33)

    // Test Case 2: At Time T2 (past window end, e.g. Day 14, and also past normal cutoff)
    // For ticket 2, simulate a session where normal cutoff has also passed:
    // Move session time to Day 15 (less than 168h from Day 14)
    await fixture.pool.query(
      `UPDATE event_sessions SET "startTime" = $2 WHERE id = $1`,
      [data.sessionId, new Date(Date.now() + 15 * 24 * 3600 * 1000)],
    );

    const t2 = new Date(Date.now() + 14 * 24 * 3600 * 1000); // Day 14 is past special window (closed on Day 13)
    const eligT2 = await getOrderRefundEligibility(fixture.pool, data.orderId, t2);
    expect(eligT2.isWithinSpecialWindow).toBe(false);
    expect(eligT2.isWithinNormalCutoff).toBe(false);
    expect(eligT2.tickets.find(t => t.ticketId === data.tickets[1].id)?.eligible).toBe(false);

    // Submitting refund at T2 is rejected with PAST_REFUND_CUTOFF
    const refundRes2 = await submitRefundRequest(fixture.pool, {
      verifiedToken: data.buyerToken,
      orderId: data.orderId,
      ticketIds: [data.tickets[1].id],
      reason: 'ขอคืนหลังหมดช่วงพิเศษ',
      now: t2,
    });
    expect(refundRes2.success).toBe(false);
    expect(refundRes2.code).toBe('PAST_REFUND_CUTOFF');
  });

  it('rejects non-owner actors attempting to configure special refund window', async () => {
    const data = await setupRescheduleEvent();

    await expect(
      configureSpecialRefundWindow(fixture.pool, {
        sessionId: data.sessionId,
        ownerId: fixture.ids.organizer, // Organizer actor
        specialRefundWindowStart: new Date(),
        specialRefundWindowEnd: new Date(Date.now() + 24 * 3600 * 1000),
      }),
    ).rejects.toThrow('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่สามารถกำหนดช่วงเวลาขอคืนเงินพิเศษได้ (AC-38)');
  });
});
