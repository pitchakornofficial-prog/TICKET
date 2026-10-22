import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession, getPublicEventDetails } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import {
  createReservation,
  getOrderReservation,
  expireOrders,
  getTicketTypeAvailableQuota,
  RESERVATION_HOLD_SECONDS,
} from '../../src/server/reservation';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('Reservation expiry, quota release, and refresh idempotency (TASK-013, AC-70, AC-71, G-14, G-34)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(email: string, name = 'ผู้ซื้อทดสอบ', now = new Date()) {
    clearCapturedEmails();
    const buyer = { name, email, phone: '0812345678' };
    const reqRes = await requestGuestOtp(fixture.pool, { buyer, purpose: 'checkout', now });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';
    const verifyRes = await verifyGuestOtp(fixture.pool, {
      email,
      code,
      requestId: reqRes.requestId ?? '',
      purpose: 'checkout',
      buyer,
      now,
    });
    return verifyRes.verifiedToken ?? '';
  }

  it('releases quota automatically upon 15-minute deadline and allows new buyer to reserve (AC-71, G-34)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T10:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Expiry Release', location: 'อิมแพ็ค ฮอลล์', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'บัตรธรรมดา', price: 1000, quota: 2 }],
        },
      ],
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const tokenBuyer1 = await getVerifiedToken('buyer1-expiry@ticket.invalid', 'ผู้ซื้อที่ 1', baseTime);

    // 1. Buyer 1 reserves 2 tickets at baseTime (exhausting quota = 2)
    const res1 = await createReservation(
      fixture.pool,
      {
        verifiedToken: tokenBuyer1,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      baseTime,
    );
    expect(res1.status).toBe('reserved');

    // 2. At baseTime + 10m: quota is still held (available = 0)
    const midTime = new Date(baseTime.getTime() + 10 * 60 * 1000);
    const quotaMid = await getTicketTypeAvailableQuota(fixture.pool, ttId, midTime);
    expect(quotaMid.availableQuota).toBe(0);
    expect(quotaMid.heldQuota).toBe(2);

    const tokenBuyer2 = await getVerifiedToken('buyer2-expiry@ticket.invalid', 'ผู้ซื้อที่ 2', midTime);
    await expect(
      createReservation(
        fixture.pool,
        {
          verifiedToken: tokenBuyer2,
          eventId: event.id,
          sessionId: event.sessions[0].id,
          items: [{ ticketTypeId: ttId, quantity: 1 }],
        },
        midTime,
      ),
    ).rejects.toThrow('เหลือไม่เพียงพอ');

    // 3. At baseTime + 15m + 1s: deadline has passed (G-34, AC-71)
    const afterExpiry = new Date(baseTime.getTime() + (RESERVATION_HOLD_SECONDS + 1) * 1000);

    // Dynamic quota check automatically reflects release
    const quotaAfter = await getTicketTypeAvailableQuota(fixture.pool, ttId, afterExpiry);
    expect(quotaAfter.availableQuota).toBe(2);
    expect(quotaAfter.heldQuota).toBe(0);

    // Check public event details also shows released quota
    const publicEvent = await getPublicEventDetails(fixture.pool, event.id);
    expect(publicEvent?.sessions[0].ticketTypes[0].quota).toBe(2);

    // 4. expireOrders transitions the order to 'expired'
    const expiredCount = await expireOrders(fixture.pool, afterExpiry);
    expect(expiredCount).toBe(1);

    // getOrderReservation returns status 'expired'
    const orderCheck = await getOrderReservation(fixture.pool, res1.id, afterExpiry);
    expect(orderCheck?.status).toBe('expired');

    // 5. Buyer 2 can now reserve the released quota cleanly
    const res2 = await createReservation(
      fixture.pool,
      {
        verifiedToken: tokenBuyer2,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      afterExpiry,
    );
    expect(res2.status).toBe('reserved');
    expect(res2.id).not.toBe(res1.id);
  });

  it('guarantees idempotency of expireOrders and repeated status queries (AC-71)', async () => {
    const pastTime = new Date('2026-11-20T12:00:00.000Z');
    // Calling expireOrders when no more orders are pending expiry returns 0
    const count1 = await expireOrders(fixture.pool, pastTime);
    expect(count1).toBeGreaterThanOrEqual(0);
    const count2 = await expireOrders(fixture.pool, pastTime);
    expect(count2).toBe(0);
  });

  it('maintains order ID, quote, and deadline upon refresh or repeated query (AC-70, G-14)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T14:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Refresh', location: 'พารากอน ฮอลล์', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP', price: 2500, quota: 10 }],
        },
      ],
    );
    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const token = await getVerifiedToken('buyer-refresh@ticket.invalid', 'ผู้ซื้อรีเฟรช', baseTime);
    const originalRes = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      baseTime,
    );

    // Refresh 5 minutes later
    const refreshTime = new Date(baseTime.getTime() + 5 * 60 * 1000);
    const refreshed = await getOrderReservation(fixture.pool, originalRes.id, refreshTime);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.id).toBe(originalRes.id);
    expect(refreshed?.status).toBe('reserved');
    expect(refreshed?.subtotal).toBe(originalRes.subtotal);
    expect(refreshed?.customerFee).toBe(originalRes.customerFee);
    expect(refreshed?.total).toBe(originalRes.total);
    // Deadline is preserved from original creation, not reset
    expect(refreshed?.expiresAt).toBe(originalRes.expiresAt);
  });

  it('prevents overselling when concurrent requests race for released quota at expiry (AC-14, AC-71)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T16:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Concurrency At Expiry', location: 'ไบเทค บางนา', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'บัตรใบเดียว', price: 500, quota: 1 }],
        },
      ],
    );
    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    // Buyer A holds the 1 ticket
    const tokenA = await getVerifiedToken('buyer-a@ticket.invalid', 'ผู้ซื้อ A', baseTime);
    await createReservation(
      fixture.pool,
      {
        verifiedToken: tokenA,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      baseTime,
    );

    // At expiry time
    const expiryTime = new Date(baseTime.getTime() + (RESERVATION_HOLD_SECONDS + 1) * 1000);

    // Buyers B and C race to reserve the 1 released ticket
    const tokenB = await getVerifiedToken('buyer-b@ticket.invalid', 'ผู้ซื้อ B', expiryTime);
    const tokenC = await getVerifiedToken('buyer-c@ticket.invalid', 'ผู้ซื้อ C', expiryTime);

    const results = await Promise.allSettled([
      createReservation(
        fixture.pool,
        {
          verifiedToken: tokenB,
          eventId: event.id,
          sessionId: event.sessions[0].id,
          items: [{ ticketTypeId: ttId, quantity: 1 }],
        },
        expiryTime,
      ),
      createReservation(
        fixture.pool,
        {
          verifiedToken: tokenC,
          eventId: event.id,
          sessionId: event.sessions[0].id,
          items: [{ ticketTypeId: ttId, quantity: 1 }],
        },
        expiryTime,
      ),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // Exactly 1 must succeed, 1 must fail (no overselling)
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });
});
