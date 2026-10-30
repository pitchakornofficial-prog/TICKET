import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { saveEventFeeSettings, getEventFeeSettings } from '../../src/server/fees';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import {
  createReservation,
  getOrderReservation,
  getBuyerTicketCountForEvent,
} from '../../src/server/reservation';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('Reservation, concurrency, quota isolation and fee lock integration (TASK-012, AC-10, AC-14, AC-61, AC-69, AC-106, AC-111, AC-06, AC-12, AC-13)', () => {
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

  it('rejects reservation without valid OTP token (AC-12)', async () => {
    await expect(
      createReservation(fixture.pool, {
        verifiedToken: 'invalid-or-fake-token',
        eventId: 'any-event',
        sessionId: 'any-session',
        items: [{ ticketTypeId: 'any-tt', quantity: 1 }],
      }),
    ).rejects.toThrow('กรุณายืนยันตัวตนผ่าน OTP');
  });

  it('enforces limit per order: rejects when total exceeds limit (AC-10), accepts when equal to limit (AC-106)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    // Create event with limitPerOrder = 4
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Limit', location: 'อิมแพ็ค อารีน่า', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [
            { name: 'โซน A', price: 2000, quota: 100 },
            { name: 'โซน B', price: 1000, quota: 100 },
          ],
        },
      ],
    );

    // Approve session
    await approveSession(fixture.pool, event.sessions[0].id, ownerId);

    const ttA = event.sessions[0].ticketTypes[0].id;
    const ttB = event.sessions[0].ticketTypes[1].id;

    const token = await getVerifiedToken('buyer-limit@ticket.invalid');

    // 1. Try to order 3 of Zone A and 2 of Zone B = 5 tickets (exceeds limit 4) -> AC-10 rejected
    await expect(
      createReservation(fixture.pool, {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [
          { ticketTypeId: ttA, quantity: 3 },
          { ticketTypeId: ttB, quantity: 2 },
        ],
      }),
    ).rejects.toThrow('เกินจำกัดต่อคำสั่งซื้อ (4 ใบ)');

    // 2. Try to order 2 of Zone A and 2 of Zone B = 4 tickets (equals limit 4) -> AC-106 accepted
    const reservation = await createReservation(fixture.pool, {
      verifiedToken: token,
      eventId: event.id,
      sessionId: event.sessions[0].id,
      items: [
        { ticketTypeId: ttA, quantity: 2 },
        { ticketTypeId: ttB, quantity: 2 },
      ],
    });

    expect(reservation.id).toBeDefined();
    expect(reservation.status).toBe('reserved');
    expect(reservation.items.length).toBe(2);
    expect(reservation.subtotal).toBe(6000); // 2*2000 + 2*1000 = 6000
  });

  it('enforces anti-scalping cumulative buyer limit per event across multiple orders (D-59)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    // Create event with limitPerOrder = 4
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Cumulative Buyer Limit D-59', location: 'อิมแพ็ค อารีน่า', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'โซน A', price: 1000, quota: 100 }],
        },
      ],
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;
    const buyerEmail = 'scalper-test@ticket.invalid';
    const buyerPhone = '0891234567';

    let clockOffset = 0;
    async function getTokenForBuyer(name: string) {
      clearCapturedEmails();
      const now = new Date(Date.now() + clockOffset);
      clockOffset += 70 * 1000;
      const buyer = { name, email: buyerEmail, phone: buyerPhone };
      const reqRes = await requestGuestOtp(fixture.pool, { buyer, purpose: 'checkout', now });
      const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
      const code = match ? match[1] : '';
      const verifyRes = await verifyGuestOtp(fixture.pool, {
        email: buyerEmail,
        code,
        requestId: reqRes.requestId ?? '',
        purpose: 'checkout',
        buyer,
        now,
      });
      return verifyRes.verifiedToken ?? '';
    }

    const token1 = await getTokenForBuyer('ผู้ซื้อรอบแรก');

    // Order 1: Buyer reserves 2 tickets -> success
    const res1 = await createReservation(fixture.pool, {
      verifiedToken: token1,
      eventId: event.id,
      sessionId: event.sessions[0].id,
      items: [{ ticketTypeId: ttId, quantity: 2 }],
    });
    expect(res1.id).toBeDefined();

    const countAfter1 = await getBuyerTicketCountForEvent(fixture.pool, event.id, buyerEmail, buyerPhone);
    expect(countAfter1).toBe(2);

    // Order 2: Same buyer tries to reserve 3 tickets (2 + 3 = 5 > 4) -> rejected
    const token2 = await getTokenForBuyer('ผู้ซื้อรอบสอง');
    await expect(
      createReservation(fixture.pool, {
        verifiedToken: token2,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 3 }],
      }),
    ).rejects.toThrow('ท่านได้สั่งซื้อหรือมีรายการจองบัตรคอนเสิร์ตนี้ไปแล้ว 2 ใบ ไม่สามารถซื้อเพิ่มอีก 3 ใบได้');

    // Order 2: Same buyer reserves 2 tickets (2 + 2 = 4 <= 4) -> success
    const res2 = await createReservation(fixture.pool, {
      verifiedToken: token2,
      eventId: event.id,
      sessionId: event.sessions[0].id,
      items: [{ ticketTypeId: ttId, quantity: 2 }],
    });
    expect(res2.id).toBeDefined();

    const countAfter2 = await getBuyerTicketCountForEvent(fixture.pool, event.id, buyerEmail, buyerPhone);
    expect(countAfter2).toBe(4);

    // Order 3: Same buyer tries to buy even 1 ticket (4 / 4 full) -> rejected
    const token3 = await getTokenForBuyer('ผู้ซื้อรอบสาม');
    await expect(
      createReservation(fixture.pool, {
        verifiedToken: token3,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      }),
    ).rejects.toThrow('ท่านได้สั่งซื้อบัตรคอนเสิร์ตนี้ครบตามจำนวนจำกัดแล้ว (4 / 4 ใบ');

    // D-60: Same phone number with a different email CAN buy tickets (Email-anchored)
    clearCapturedEmails();
    const friendBuyer = { name: 'เพื่อนผู้ซื้อ', email: 'friend-buyer@ticket.invalid', phone: buyerPhone };
    const friendOtpReq = await requestGuestOtp(fixture.pool, {
      buyer: friendBuyer,
      purpose: 'checkout',
      now: new Date(Date.now() + 300 * 1000),
    });
    const friendMatch = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const friendCode = friendMatch ? friendMatch[1] : '';
    const friendVerify = await verifyGuestOtp(fixture.pool, {
      email: friendBuyer.email,
      code: friendCode,
      requestId: friendOtpReq.requestId ?? '',
      purpose: 'checkout',
      buyer: friendBuyer,
      now: new Date(Date.now() + 300 * 1000),
    });

    const friendRes = await createReservation(fixture.pool, {
      verifiedToken: friendVerify.verifiedToken ?? '',
      eventId: event.id,
      sessionId: event.sessions[0].id,
      items: [{ ticketTypeId: ttId, quantity: 4 }],
    });
    expect(friendRes.id).toBeDefined();
    expect(friendRes.items[0].quantity).toBe(4);
  });

  it('all-or-nothing: does not create partial hold if any ticket type has insufficient quota (AC-61)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    // Create event where Type 1 has quota 10 and Type 2 has quota 1
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ All-or-Nothing', location: 'พารากอน ฮอลล์', limitPerOrder: 10 },
      [
        {
          startTime: '2026-11-25T19:00:00.000Z',
          endTime: '2026-11-25T22:00:00.000Z',
          ticketTypes: [
            { name: 'ประเภทที่มีพอ', price: 1500, quota: 10 },
            { name: 'ประเภทที่ไม่พอ', price: 3000, quota: 1 },
          ],
        },
      ],
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);

    const ttSufficient = event.sessions[0].ticketTypes[0].id;
    const ttInsufficient = event.sessions[0].ticketTypes[1].id;

    const token = await getVerifiedToken('buyer-partial@ticket.invalid');

    // Request 2 of sufficient and 2 of insufficient (quota is only 1)
    await expect(
      createReservation(fixture.pool, {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [
          { ticketTypeId: ttSufficient, quantity: 2 },
          { ticketTypeId: ttInsufficient, quantity: 2 },
        ],
      }),
    ).rejects.toThrow('บัตรประเภท "ประเภทที่ไม่พอ" เหลือไม่เพียงพอ');

    // Verify that NO partial hold was created on ttSufficient:
    // It should still have 10 available tickets!
    const token2 = await getVerifiedToken('buyer-check@ticket.invalid');
    const fullHold = await createReservation(fixture.pool, {
      verifiedToken: token2,
      eventId: event.id,
      sessionId: event.sessions[0].id,
      items: [{ ticketTypeId: ttSufficient, quantity: 10 }],
    });
    expect(fullHold.id).toBeDefined();
    expect(fullHold.items[0].quantity).toBe(10);
  });

  it('enforces sibling session quota isolation (AC-06)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    // Create event with two sessions
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Session Isolation', location: 'เมืองไทย รัชดาลัย', limitPerOrder: 10 },
      [
        {
          startTime: '2026-11-28T14:00:00.000Z',
          endTime: '2026-11-28T17:00:00.000Z',
          ticketTypes: [{ name: 'รอบบ่าย', price: 1000, quota: 5 }],
        },
        {
          startTime: '2026-11-28T19:00:00.000Z',
          endTime: '2026-11-28T22:00:00.000Z',
          ticketTypes: [{ name: 'รอบค่ำ', price: 1000, quota: 5 }],
        },
      ],
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    await approveSession(fixture.pool, event.sessions[1].id, ownerId);

    const sess1 = event.sessions[0];
    const sess2 = event.sessions[1];
    const ttSess1 = sess1.ticketTypes[0].id;
    const ttSess2 = sess2.ticketTypes[0].id;

    const token = await getVerifiedToken('buyer-sess@ticket.invalid');

    // 1. Trying to reserve ticket of session 2 inside session 1 request fails
    await expect(
      createReservation(fixture.pool, {
        verifiedToken: token,
        eventId: event.id,
        sessionId: sess1.id,
        items: [{ ticketTypeId: ttSess2, quantity: 1 }],
      }),
    ).rejects.toThrow('มีประเภทบัตรที่ไม่ได้อยู่ในรอบการแสดงนี้');

    // 2. Reserving in Session 1 does NOT deplete Session 2's quota
    await createReservation(fixture.pool, {
      verifiedToken: token,
      eventId: event.id,
      sessionId: sess1.id,
      items: [{ ticketTypeId: ttSess1, quantity: 4 }],
    });

    // Session 2 can still reserve all 5 tickets
    const tokenSess2 = await getVerifiedToken('buyer-sess2@ticket.invalid');
    const resSess2 = await createReservation(fixture.pool, {
      verifiedToken: tokenSess2,
      eventId: event.id,
      sessionId: sess2.id,
      items: [{ ticketTypeId: ttSess2, quantity: 5 }],
    });
    expect(resSess2.id).toBeDefined();
    expect(resSess2.items[0].quantity).toBe(5);
  });

  it('concurrent requests for the last ticket: exactly one succeeds and one fails without oversell (AC-14)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Race Condition', location: 'เอ็มแคปปิตอล' },
      [
        {
          startTime: '2026-12-01T19:00:00.000Z',
          endTime: '2026-12-01T22:00:00.000Z',
          ticketTypes: [{ name: 'บัตรใบสุดท้าย', price: 5000, quota: 1 }],
        },
      ],
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const tokenA = await getVerifiedToken('racer-a@ticket.invalid');
    const tokenB = await getVerifiedToken('racer-b@ticket.invalid');

    // Compete for the last ticket simultaneously
    const [resA, resB] = await Promise.allSettled([
      createReservation(fixture.pool, {
        verifiedToken: tokenA,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      }),
      createReservation(fixture.pool, {
        verifiedToken: tokenB,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      }),
    ]);

    const successes = [resA, resB].filter(r => r.status === 'fulfilled');
    const failures = [resA, resB].filter(r => r.status === 'rejected');

    // Exactly one must succeed and one must fail
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const failedReason = (failures[0] as PromiseRejectedResult).reason?.message;
    expect(failedReason).toContain('เหลือไม่เพียงพอ');
  });

  it('atomically locks organizer fee mode/rate upon first reservation and computes exact quote (AC-69, AC-111, AC-13)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Fee Lock & Quote', location: 'ไบเทค' },
      [
        {
          startTime: '2026-12-10T19:00:00.000Z',
          endTime: '2026-12-10T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP Zone', price: 1800, quota: 10 }],
        },
      ],
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);

    // Owner sets fee: organizer 5%, customer per_ticket 20 THB, reserve 10%
    await saveEventFeeSettings(
      fixture.pool,
      event.id,
      {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 20,
        reservePercentage: 10,
      },
      ownerId,
    );

    // Initial check: organizerFeeLocked is false
    const initialFees = await getEventFeeSettings(fixture.pool, event.id);
    expect(initialFees.organizerFeeLocked).toBe(false);

    const baseTime = new Date('2026-12-01T10:00:00.000Z');
    const token = await getVerifiedToken('buyer-quote@ticket.invalid', 'ผู้ซื้อทดสอบ', baseTime);

    // Create reservation for 2 tickets: subtotal = 3600, customer fee = 20 * 2 = 40, total = 3640
    const res = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: event.sessions[0].ticketTypes[0].id, quantity: 2 }],
      },
      baseTime,
    );

    // AC-69: Exact quote calculation
    expect(res.subtotal).toBe(3600);
    expect(res.customerFee).toBe(40);
    expect(res.total).toBe(3640);
    expect(res.customerFeeMode).toBe('per_ticket');
    expect(res.customerFeeRate).toBe(20);

    // AC-13: 15-minute deadline
    const expectedExpiry = new Date(baseTime.getTime() + 15 * 60 * 1000).toISOString();
    expect(res.expiresAt).toBe(expectedExpiry);

    // AC-111 & G-49: First reservation atomically locked organizer fee mode and rate
    const afterFees = await getEventFeeSettings(fixture.pool, event.id);
    expect(afterFees.organizerFeeLocked).toBe(true);

    // Attempting to modify organizer fee after lock fails
    await expect(
      saveEventFeeSettings(
        fixture.pool,
        event.id,
        {
          organizerFeeMode: 'flat_fee', // changed!
          organizerFeeRate: 10000,
          customerFeeMode: 'per_ticket',
          customerFeeRate: 20,
          reservePercentage: 10,
        },
        ownerId,
      ),
    ).rejects.toThrow('ค่าบริการฝั่งผู้จัดงานถูกล็อกแล้ว');

    // Verify order reservation retrieval
    const retrieved = await getOrderReservation(fixture.pool, res.id, baseTime);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(res.id);
    expect(retrieved?.status).toBe('reserved');
  });
});
