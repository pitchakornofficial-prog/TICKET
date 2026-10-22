import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
  submitSessionAmendment,
  approveSessionAmendment,
  listPendingSessionAmendments,
  getEventDetails,
} from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation, getTicketTypeAvailableQuota } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  clearCapturedEmails,
  setCustomEmailTransport,
  getCapturedEmails,
} from '../../src/server/email';

describe('TASK-024: Approved Live Edits Integration Tests (AC-67, AC-68, AC-109)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function setupLiveEventWithTickets() {
    clearCapturedEmails();

    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000);
    const sessionEndTime = new Date(sessionStartTime.getTime() + 4 * 3600 * 1000);

    const eventDraft = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: `คอนเสิร์ต แก้ไขรอบเปิดขาย ${Date.now()}`,
        description: 'งานแสดงดนตรีสำหรับทดสอบ live edits AC-67, AC-68, AC-109',
        location: 'Impact Arena',
        posterUrl: undefined,
      },
      [
        {
          startTime: sessionStartTime.toISOString(),
          endTime: sessionEndTime.toISOString(),
          ticketTypes: [{ name: 'Standing A', price: 2000, quota: 10 }],
        },
      ],
    );

    const sessionId = eventDraft.sessions[0].id;
    const ticketTypeId = eventDraft.sessions[0].ticketTypes[0].id;

    // Approve session to make it a live approved session
    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // Buyer 1 purchases 2 tickets (paid)
    const buyer1Email = `buyer1-live-${Date.now()}@ticket.invalid`;
    const buyer1 = { name: 'ผู้ซื้อ 1', email: buyer1Email, phone: '0811111111' };

    const req1 = await requestGuestOtp(fixture.pool, { buyer: buyer1, purpose: 'checkout', now: new Date() });
    const match1 = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code1 = match1 ? match1[1] : '';
    const vRes1 = await verifyGuestOtp(fixture.pool, {
      email: buyer1Email,
      code: code1,
      requestId: req1.requestId ?? '',
      buyer: buyer1,
      purpose: 'checkout',
      now: new Date(),
    });

    const res1 = await createReservation(
      fixture.pool,
      {
        verifiedToken: vRes1.verifiedToken ?? '',
        eventId: eventDraft.id,
        sessionId,
        items: [{ ticketTypeId, quantity: 2 }],
      },
      new Date(),
    );

    const charge1 = await createPaymentQr(
      fixture.pool,
      { orderId: res1.id, verifiedToken: vRes1.verifiedToken ?? '' },
      new Date(),
    );

    await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge1.id,
        providerPaidAt: new Date(),
        actualAmount: charge1.amount,
        actualCurrency: 'thb',
      },
      new Date(),
    );

    // Buyer 2 creates an active reservation for 2 tickets (reserved, not yet paid)
    clearCapturedEmails();
    const buyer2Email = `buyer2-live-${Date.now()}@ticket.invalid`;
    const buyer2 = { name: 'ผู้ซื้อ 2', email: buyer2Email, phone: '0822222222' };

    const req2 = await requestGuestOtp(fixture.pool, { buyer: buyer2, purpose: 'checkout', now: new Date() });
    const match2 = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code2 = match2 ? match2[1] : '';
    const vRes2 = await verifyGuestOtp(fixture.pool, {
      email: buyer2Email,
      code: code2,
      requestId: req2.requestId ?? '',
      buyer: buyer2,
      purpose: 'checkout',
      now: new Date(),
    });

    const res2 = await createReservation(
      fixture.pool,
      {
        verifiedToken: vRes2.verifiedToken ?? '',
        eventId: eventDraft.id,
        sessionId,
        items: [{ ticketTypeId, quantity: 2 }],
      },
      new Date(),
    );

    return {
      eventId: eventDraft.id,
      sessionId,
      ticketTypeId,
      buyer2Reservation: res2,
      buyer2Token: vRes2.verifiedToken ?? '',
    };
  }

  it('rejects amendment quota lower than currently held rights (issued + active reserved) (AC-109)', async () => {
    const data = await setupLiveEventWithTickets();

    // 2 paid + 2 active reserved = 4 heldQuota
    const quotaInfo = await getTicketTypeAvailableQuota(fixture.pool, data.ticketTypeId);
    expect(quotaInfo.heldQuota).toBe(4);
    expect(quotaInfo.totalQuota).toBe(10);
    expect(quotaInfo.availableQuota).toBe(6);

    // Organizer attempts to amend quota to 3 (< 4)
    await expect(
      submitSessionAmendment(fixture.pool, {
        sessionId: data.sessionId,
        organizerId: fixture.ids.organizer,
        ticketTypes: [
          {
            id: data.ticketTypeId,
            name: 'Standing A',
            price: 2000,
            quota: 3, // Less than held quota (4)
          },
        ],
      }),
    ).rejects.toThrow(/น้อยกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้ว \(4 ใบ\)/);
  });

  it('keeps original approved version while amendment is pending approval (AC-67, G-12)', async () => {
    const data = await setupLiveEventWithTickets();

    // Organizer submits amendment with new price 2500 and quota 12
    const amdResult = await submitSessionAmendment(fixture.pool, {
      sessionId: data.sessionId,
      organizerId: fixture.ids.organizer,
      ticketTypes: [
        {
          id: data.ticketTypeId,
          name: 'Standing A (Updated)',
          price: 2500,
          quota: 12,
        },
      ],
    });
    expect(amdResult.success).toBe(true);

    // Verify pending amendment in Owner list
    const pendingList = await listPendingSessionAmendments(fixture.pool);
    const myAmd = pendingList.find(a => a.id === amdResult.amendmentId);
    expect(myAmd).toBeDefined();
    expect(myAmd?.ticketTypes[0].price).toBe(2500);

    // Verify public/catalog still sees original version (AC-67, G-12)
    const eventDetails = await getEventDetails(fixture.pool, data.eventId);
    expect(eventDetails).toBeDefined();
    const liveSession = eventDetails?.sessions.find((s: { id: string }) => s.id === data.sessionId);
    expect(liveSession?.ticketTypes[0].name).toBe('Standing A');
    expect(Number(liveSession?.ticketTypes[0].price)).toBe(2000);
    expect(Number(liveSession?.ticketTypes[0].quota)).toBe(10);
  });

  it('preserves existing active reservation quote when amendment is approved, while new orders get new price (AC-67, AC-68)', async () => {
    const data = await setupLiveEventWithTickets();

    // Active reservation Buyer 2 was created at 2000 THB each (total = 4000 + customer fee)
    expect(data.buyer2Reservation.subtotal).toBe(4000);

    // Organizer submits amendment
    const amdResult = await submitSessionAmendment(fixture.pool, {
      sessionId: data.sessionId,
      organizerId: fixture.ids.organizer,
      ticketTypes: [
        {
          id: data.ticketTypeId,
          name: 'Standing A (New Price)',
          price: 2500,
          quota: 15,
        },
      ],
    });

    // Owner approves amendment (AC-67, AC-68)
    const appResult = await approveSessionAmendment(fixture.pool, {
      amendmentId: amdResult.amendmentId,
      ownerId: fixture.ids.owner,
    });
    expect(appResult.success).toBe(true);

    // 1. Buyer 2 (active reservation created before approval) proceeds to payment QR:
    // Quote is strictly preserved from the existing order (AC-68)
    const charge2 = await createPaymentQr(
      fixture.pool,
      { orderId: data.buyer2Reservation.id, verifiedToken: data.buyer2Token },
      new Date(),
    );
    expect(charge2.amount).toBe(Math.round(data.buyer2Reservation.total * 100));

    const pay2 = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge2.id,
        providerPaidAt: new Date(),
        actualAmount: charge2.amount,
        actualCurrency: 'thb',
      },
      new Date(),
    );
    expect(pay2.success).toBe(true);
    expect(pay2.tickets?.length).toBe(2);

    // 2. Buyer 3 starts a NEW reservation after amendment approval:
    // Uses the new amended price (2500 THB) (AC-67)
    clearCapturedEmails();
    const buyer3Email = `buyer3-live-${Date.now()}@ticket.invalid`;
    const buyer3 = { name: 'ผู้ซื้อ 3', email: buyer3Email, phone: '0833333333' };

    const req3 = await requestGuestOtp(fixture.pool, { buyer: buyer3, purpose: 'checkout', now: new Date() });
    const match3 = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code3 = match3 ? match3[1] : '';
    const vRes3 = await verifyGuestOtp(fixture.pool, {
      email: buyer3Email,
      code: code3,
      requestId: req3.requestId ?? '',
      buyer: buyer3,
      purpose: 'checkout',
      now: new Date(),
    });

    const res3 = await createReservation(
      fixture.pool,
      {
        verifiedToken: vRes3.verifiedToken ?? '',
        eventId: data.eventId,
        sessionId: data.sessionId,
        items: [{ ticketTypeId: data.ticketTypeId, quantity: 1 }],
      },
      new Date(),
    );

    // Subtotal for 1 ticket must be the new price: 2500 THB
    expect(res3.subtotal).toBe(2500);
    expect(res3.items[0].unitPrice).toBe(2500);
  });
});
