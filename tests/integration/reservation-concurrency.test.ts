import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import {
  createReservation,
  getBuyerTicketCountForEvent,
} from '../../src/server/reservation';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('Issue #8: Anti-Scalping Reservation Concurrency on PostgreSQL (D-59, AC-10)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(email: string, phone = '0812345678', name = 'ผู้ซื้อ Concurrency') {
    clearCapturedEmails();
    const buyer = { name, email, phone };
    const reqRes = await requestGuestOtp(fixture.pool, { buyer, purpose: 'checkout' });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';
    const verifyRes = await verifyGuestOtp(fixture.pool, {
      email,
      code,
      requestId: reqRes.requestId ?? '',
      purpose: 'checkout',
      buyer,
    });
    return verifyRes.verifiedToken ?? '';
  }

  it('guarantees that 5 parallel 2-ticket requests cannot exceed limitPerOrder of 4 (D-59, AC-10)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    // Create event with limitPerOrder = 4 and 100 quota
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Concert Anti-Scalp Test 1', location: 'Impact Arena', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-01T19:00:00.000Z',
          endTime: '2026-12-01T22:00:00.000Z',
          ticketTypes: [{ name: 'Standing', price: 1000, quota: 100 }],
        },
      ],
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const buyerEmail = 'parallel-scalper-1@ticket.invalid';
    const token = await getVerifiedToken(buyerEmail);

    // Launch 5 parallel requests, each requesting 2 tickets (total 10 tickets, limit is 4)
    const requests = Array.from({ length: 5 }, () =>
      createReservation(fixture.pool, {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      }).then(
        res => ({ success: true as const, res }),
        err => ({ success: false as const, error: err instanceof Error ? err.message : String(err) }),
      ),
    );

    const outcomes = await Promise.all(requests);

    const successful = outcomes.filter(o => o.success);
    const failed = outcomes.filter(o => !o.success);

    // Exactly 2 requests must succeed (2 * 2 = 4 tickets)
    expect(successful.length).toBe(2);
    // Exactly 3 requests must fail
    expect(failed.length).toBe(3);

    for (const f of failed) {
      expect(f.error).toMatch(/ท่านได้สั่งซื้อ/);
    }

    // Verify database: total tickets held by this buyer must be EXACTLY 4
    const totalCount = await getBuyerTicketCountForEvent(fixture.pool, event.id, buyerEmail);
    expect(totalCount).toBe(4);
  });

  it('guarantees that 3 parallel 4-ticket requests permit only 1 order (D-59, AC-10)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Concert Anti-Scalp Test 2', location: 'Impact Arena', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-02T19:00:00.000Z',
          endTime: '2026-12-02T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP', price: 2000, quota: 100 }],
        },
      ],
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const buyerEmail = 'parallel-scalper-2@ticket.invalid';
    const token = await getVerifiedToken(buyerEmail);

    // Launch 3 parallel requests, each requesting 4 tickets (total 12 tickets, limit is 4)
    const requests = Array.from({ length: 3 }, () =>
      createReservation(fixture.pool, {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 4 }],
      }).then(
        res => ({ success: true as const, res }),
        err => ({ success: false as const, error: err instanceof Error ? err.message : String(err) }),
      ),
    );

    const outcomes = await Promise.all(requests);

    const successful = outcomes.filter(o => o.success);
    const failed = outcomes.filter(o => !o.success);

    // Exactly 1 request can succeed (1 * 4 = 4 tickets)
    expect(successful.length).toBe(1);
    expect(failed.length).toBe(2);

    for (const f of failed) {
      expect(f.error).toMatch(/ท่านได้สั่งซื้อ/);
    }

    const totalCount = await getBuyerTicketCountForEvent(fixture.pool, event.id, buyerEmail);
    expect(totalCount).toBe(4);
  });

  it('allows two different buyers to reserve tickets concurrently without blocking each other (AC-10, D-60)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Concert Anti-Scalp Test 3', location: 'Impact Arena', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-03T19:00:00.000Z',
          endTime: '2026-12-03T22:00:00.000Z',
          ticketTypes: [{ name: 'Regular', price: 1500, quota: 100 }],
        },
      ],
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const buyerEmailA = 'parallel-buyer-a@ticket.invalid';
    const buyerEmailB = 'parallel-buyer-b@ticket.invalid';

    const tokenA = await getVerifiedToken(buyerEmailA, '0811111111', 'ผู้ซื้อ A');
    const tokenB = await getVerifiedToken(buyerEmailB, '0822222222', 'ผู้ซื้อ B');

    // Both buyers concurrently reserve 3 tickets each
    const [resA, resB] = await Promise.all([
      createReservation(fixture.pool, {
        verifiedToken: tokenA,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 3 }],
      }),
      createReservation(fixture.pool, {
        verifiedToken: tokenB,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 3 }],
      }),
    ]);

    expect(resA.id).toBeDefined();
    expect(resB.id).toBeDefined();

    const countA = await getBuyerTicketCountForEvent(fixture.pool, event.id, buyerEmailA);
    const countB = await getBuyerTicketCountForEvent(fixture.pool, event.id, buyerEmailB);

    expect(countA).toBe(3);
    expect(countB).toBe(3);
  });
});
