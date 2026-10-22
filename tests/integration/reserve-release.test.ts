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
  recordEventReserveRelease,
} from '../../src/server/reports';
import { setCustomEmailTransport, clearCapturedEmails, getCapturedEmails } from '../../src/server/email';

describe('TASK-030: Reserve Release Integration Tests (AC-83, G-30, G-31)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function createEventWithTwoSessions(
    organizerId: string,
    session1InPast: boolean,
    session2InPast: boolean,
  ) {
    const now = Date.now();
    const session1Start = session1InPast
      ? new Date(now - 48 * 3600 * 1000)
      : new Date(now + 24 * 3600 * 1000);
    const session1End = session1InPast
      ? new Date(now - 44 * 3600 * 1000)
      : new Date(session1Start.getTime() + 4 * 3600 * 1000);

    const session2Start = session2InPast
      ? new Date(now - 24 * 3600 * 1000)
      : new Date(now + 48 * 3600 * 1000);
    const session2End = session2InPast
      ? new Date(now - 20 * 3600 * 1000)
      : new Date(session2Start.getTime() + 4 * 3600 * 1000);

    const eventDraft = await createEventDraft(
      fixture.pool,
      organizerId,
      {
        title: `คอนเสิร์ต ปล่อยเงินสำรอง ${Date.now()}`,
        description: 'งานทดสอบ owner reserve release',
        location: 'Impact Arena',
        limitPerOrder: 4,
      },
      [
        {
          startTime: session1Start.toISOString(),
          endTime: session1End.toISOString(),
          ticketTypes: [
            {
              name: 'บัตรทั่วไป 1',
              price: 1000,
              quota: 10,
              description: 'รอบที่ 1',
            },
          ],
        },
        {
          startTime: session2Start.toISOString(),
          endTime: session2End.toISOString(),
          ticketTypes: [
            {
              name: 'บัตรทั่วไป 2',
              price: 1000,
              quota: 10,
              description: 'รอบที่ 2 (รอบสุดท้าย)',
            },
          ],
        },
      ],
    );

    // Approve both sessions
    await approveSession(fixture.pool, eventDraft.sessions[0].id, fixture.ids.owner);
    await approveSession(fixture.pool, eventDraft.sessions[1].id, fixture.ids.owner);

    // Configure fee settings: 10% organizer fee, 10% reserve percentage
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
      session1: eventDraft.sessions[0],
      session2: eventDraft.sessions[1],
    };
  }

  async function purchaseTickets(eventId: string, sessionId: string, ticketTypeId: string, quantity = 1) {
    clearCapturedEmails();
    const buyerEmail = `buyer-rr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const buyerPhone = '0812345678';
    const buyerName = 'คุณสมชาย สำรอง';
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

  it('1. Role authorization check: Organizer and scanner are forbidden from releasing reserve (AC-83)', async () => {
    const { event } = await createEventWithTwoSessions(fixture.ids.organizer, true, true);

    const organizerAttempt = await recordEventReserveRelease(fixture.pool, {
      eventId: event.id,
      amount: 100,
      actorRole: 'organizer',
      recordedBy: fixture.ids.organizer,
    });
    expect(organizerAttempt.success).toBe(false);
    expect(organizerAttempt.code).toBe('FORBIDDEN');

    const scannerAttempt = await recordEventReserveRelease(fixture.pool, {
      eventId: event.id,
      amount: 100,
      actorRole: 'scanner',
      recordedBy: fixture.ids.scanner,
    });
    expect(scannerAttempt.success).toBe(false);
    expect(scannerAttempt.code).toBe('FORBIDDEN');
  });

  it('2. Final session clock check: Cannot release reserve before final session ends (AC-83, G-31)', async () => {
    // Session 1 is in past, but Session 2 (the final session) is in the FUTURE
    const { event, session1 } = await createEventWithTwoSessions(fixture.ids.organizer, true, false);

    // Purchase 1 ticket in session 1 -> Gross 1000, Fee 100, E = 900, Reserve = 90, Payable = 810
    await purchaseTickets(event.id, session1.id, session1.ticketTypes[0].id);

    // Owner checks report: final session is not ended
    const report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });
    expect(report.isFinalSessionEnded).toBe(false);
    expect(report.actualHeldReserve).toBe(90);

    // Owner attempts to release reserve -> Rejection (AC-83)
    const releaseAttempt = await recordEventReserveRelease(fixture.pool, {
      eventId: event.id,
      amount: 90,
      actorRole: 'owner',
      recordedBy: fixture.ids.owner,
    });

    expect(releaseAttempt.success).toBe(false);
    expect(releaseAttempt.code).toBe('CANNOT_RELEASE_BEFORE_FINAL_SESSION_END');
  });

  it('3. Successful release after final session ends: E900/P810/H90 -> Release 90 -> H0/Payable 90 (AC-83, SPEC-001 line 270)', async () => {
    // Both sessions are in the PAST -> final session has ended
    const { event, session1 } = await createEventWithTwoSessions(fixture.ids.organizer, true, true);

    // Purchase 1 ticket -> Gross 1000, Fee 100 -> E = 900, Held = 90, Payable = 810
    await purchaseTickets(event.id, session1.id, session1.ticketTypes[0].id);

    // Owner pays out 810 via weekly manual payout -> P = 810, Held = 90, Payable = 0
    const payoutRes = await recordEventPayout(fixture.pool, {
      eventId: event.id,
      amount: 810,
      status: 'completed',
      actorRole: 'owner',
      recordedBy: fixture.ids.owner,
    });
    expect(payoutRes.success).toBe(true);

    let report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });
    expect(report.isFinalSessionEnded).toBe(true);
    expect(report.netEntitlement).toBe(900);
    expect(report.totalPaidOut).toBe(810);
    expect(report.actualHeldReserve).toBe(90);
    expect(report.payableAmount).toBe(0);

    // Owner now releases the held reserve of 90
    const releaseRes = await recordEventReserveRelease(fixture.pool, {
      eventId: event.id,
      amount: 90,
      notes: 'ปล่อยเงินสำรองหลังจบรอบสุดท้ายเรียบร้อย',
      actorRole: 'owner',
      recordedBy: fixture.ids.owner,
    });

    expect(releaseRes.success).toBe(true);
    expect(releaseRes.amount).toBe(90);
    expect(releaseRes.remainingHeldReserve).toBe(0);
    expect(releaseRes.newPayableAmount).toBe(90);

    // Verify report reflects the released reserve
    report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });
    expect(report.totalReserveReleased).toBe(90);
    expect(report.actualHeldReserve).toBe(0);
    expect(report.payableAmount).toBe(90);
    expect(report.reserveReleases.length).toBe(1);
    expect(report.reserveReleases[0].amount).toBe(90);
    expect(report.reserveReleases[0].notes).toBe('ปล่อยเงินสำรองหลังจบรอบสุดท้ายเรียบร้อย');
  });

  it('4. Duplicate action idempotency: 15-second duplicate release does not double-release reserve (AC-83)', async () => {
    const { event, session1 } = await createEventWithTwoSessions(fixture.ids.organizer, true, true);
    await purchaseTickets(event.id, session1.id, session1.ticketTypes[0].id);

    // First release of 50
    const firstRelease = await recordEventReserveRelease(fixture.pool, {
      eventId: event.id,
      amount: 50,
      actorRole: 'owner',
      recordedBy: fixture.ids.owner,
    });
    expect(firstRelease.success).toBe(true);

    // Duplicate release with same amount within 15s
    const repeatRelease = await recordEventReserveRelease(fixture.pool, {
      eventId: event.id,
      amount: 50,
      actorRole: 'owner',
      recordedBy: fixture.ids.owner,
    });
    expect(repeatRelease.success).toBe(true);
    expect(repeatRelease.releaseId).toBe(firstRelease.releaseId);
    expect(repeatRelease.alreadyReleased).toBe(true);

    const report = await getEventMoneyReport(fixture.pool, event.id, {
      id: fixture.ids.owner,
      role: 'owner',
    });
    expect(report.totalReserveReleased).toBe(50); // Released 50 exactly once, not 100
    expect(report.reserveReleases.length).toBe(1);
  });

  it('5. Cannot release when actual held reserve is 0 or amount exceeds held reserve (AC-83)', async () => {
    const { event, session1 } = await createEventWithTwoSessions(fixture.ids.organizer, true, true);
    await purchaseTickets(event.id, session1.id, session1.ticketTypes[0].id);

    // Initial held reserve is 90. Attempting to release 100 (> 90) -> Rejection
    const overRelease = await recordEventReserveRelease(fixture.pool, {
      eventId: event.id,
      amount: 100,
      actorRole: 'owner',
      recordedBy: fixture.ids.owner,
    });
    expect(overRelease.success).toBe(false);
    expect(overRelease.code).toBe('AMOUNT_EXCEEDS_HELD_RESERVE');

    // Release all 90
    const fullRelease = await recordEventReserveRelease(fixture.pool, {
      eventId: event.id,
      amount: 90,
      actorRole: 'owner',
      recordedBy: fixture.ids.owner,
    });
    expect(fullRelease.success).toBe(true);

    // Now H = 0. Attempting to release again -> Rejection
    const zeroRelease = await recordEventReserveRelease(fixture.pool, {
      eventId: event.id,
      amount: 10,
      actorRole: 'owner',
      recordedBy: fixture.ids.owner,
      now: new Date(Date.now() + 30000), // after 30s to bypass duplicate window
    });
    expect(zeroRelease.success).toBe(false);
    expect(zeroRelease.code).toBe('NO_RESERVE_TO_RELEASE');
  });
});
