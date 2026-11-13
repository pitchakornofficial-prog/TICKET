import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { approveSession, createEventDraft, getPublicEventWithApprovedSessions, queryPublicEventsCatalog } from '../../src/server/events';
import { saveEventFeeSettings } from '../../src/server/fees';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';
import { ensureReportSchema, getEventMoneyReport, getOwnerFinanceSummaries, getOrganizerFinanceSummaries } from '../../src/server/reports';

describe('TASK-046 optimization boundary regressions', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  beforeAll(async () => { fixture = await authFixture('integration'); }, 30000);
  afterAll(async () => { if (fixture) await fixture.cleanup(); });

  async function event(title: string, location = 'Hall A', price = 1000, description = '') {
    const start = new Date(Date.now() + 86400000);
    // Equal dates/prices exercise deterministic pagination tie breaking.
    start.setUTCHours(12, 0, 0, 0);
    const draft = await createEventDraft(fixture.pool, fixture.ids.organizer,
      { title, location, description },
      [{ startTime: start.toISOString(), endTime: new Date(start.getTime() + 14400000).toISOString(),
        ticketTypes: [{ name: 'Standing', price, quota: 20 }] }]);
    if (!draft) throw new Error('Missing event');
    await approveSession(fixture.pool, draft.sessions[0].id, fixture.ids.owner);
    return draft;
  }

  it('searches descriptions without sending them and retains filtered totals on empty pages', async () => {
    const a = await event('Catalog A', 'Hall A', 1000, 'description-only-keyword');
    await event('Catalog B', 'Hall B', 4000);
    await event('Catalog C', 'Hall A', 1000);
    const search = await queryPublicEventsCatalog(fixture.pool, { q: 'description-only-keyword' });
    expect(search.events.map(e => e.id)).toEqual([a.id]);
    expect(search.events[0]).not.toHaveProperty('description');
    const literal = await event('Literal 100% Music_One \\ Hall', 'Pattern Hall');
    await event('Literal 100X MusicXOne / Hall', 'Pattern Hall');
    for (const q of ['100%', 'Music_', '\\ Hall']) {
      const matches = await queryPublicEventsCatalog(fixture.pool, { q });
      expect(matches.events.map(item => item.id)).toEqual([literal.id]);
    }
    const first = await queryPublicEventsCatalog(fixture.pool, { location: 'Hall A', priceRange: 'under1500', limit: 1 });
    const last = await queryPublicEventsCatalog(fixture.pool, { location: 'Hall A', priceRange: 'under1500', limit: 1, page: 999 });
    expect(first.totalCount).toBe(2);
    expect(last.events).toEqual([]);
    expect(last.totalCount).toBe(2);
    expect(last.hasMore).toBe(false);
    for (const sort of ['date_asc', 'price_asc', 'price_desc'] as const) {
      const all = await queryPublicEventsCatalog(fixture.pool, { location: 'Hall A', sort, limit: 48 });
      expect(all.events.map(e => e.id)).toEqual(all.events.map(e => e.id).sort());
      const ids: string[] = [];
      for (let page = 1; page <= all.totalCount; page++) {
        const part = await queryPublicEventsCatalog(fixture.pool, { location: 'Hall A', sort, page, limit: 1 });
        ids.push(...part.events.map(e => e.id));
      }
      expect(ids).toEqual(all.events.map(e => e.id));
      expect(new Set(ids).size).toBe(all.totalCount);
    }
  });

  it('keeps money summaries, paginated/full orders and actual remaining quota consistent', async () => {
    const draft = await event('Finance independent', 'Finance Hall', 1000);
    await saveEventFeeSettings(fixture.pool, draft.id, {
      organizerFeeMode: 'percentage', organizerFeeRate: 5,
      customerFeeMode: 'per_ticket', customerFeeRate: 20, reservePercentage: 10,
    }, fixture.ids.owner);
    for (let i = 0; i < 3; i++) {
      clearCapturedEmails();
      const buyer = { name: `Buyer ${i}`, email: `independent-${i}@example.com`, phone: '0812345678' };
      const otp = await requestGuestOtp(fixture.pool, { buyer, purpose: 'checkout', now: new Date() });
      const code = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/)?.[1] ?? '';
      const verified = await verifyGuestOtp(fixture.pool, { requestId: otp.requestId ?? '', code, email: buyer.email, buyer, purpose: 'checkout', now: new Date() });
      const verifiedToken = verified.verifiedToken ?? '';
      const reservation = await createReservation(fixture.pool, { eventId: draft.id, sessionId: draft.sessions[0].id,
        verifiedToken, items: [{ ticketTypeId: draft.sessions[0].ticketTypes[0].id, quantity: 2 }] });
      const charge = await createPaymentQr(fixture.pool, { orderId: reservation.id, verifiedToken });
      const paid = await verifyAndProcessPayment(fixture.pool, { chargeId: charge.id, providerPaidAt: new Date() });
      expect(paid.success).toBe(true);
    }
    const owner = { id: fixture.ids.owner, role: 'owner' as const };
    const full = await getEventMoneyReport(fixture.pool, draft.id, owner);
    const summary = await getEventMoneyReport(fixture.pool, draft.id, owner, { includeOrders: false });
    const page = await getEventMoneyReport(fixture.pool, draft.id, owner, { ordersPage: 2, ordersLimit: 1 });
    const batch = (await getOwnerFinanceSummaries(fixture.pool, owner)).find(e => e.eventId === draft.id);
    const organizer = { id: fixture.ids.organizer, role: 'organizer' as const };
    const orgBatch = (await getOrganizerFinanceSummaries(fixture.pool, organizer)).find(e => e.eventId === draft.id);
    const expected = { grossSales: 6000, netSales: 6000, organizerFee: 300, netEntitlement: 5700,
      reserveTarget: 570, actualHeldReserve: 570, payableAmount: 5130,
      totalOrdersCount: 3, totalTicketsIssuedCount: 6, totalTicketsValidCount: 6 };
    for (const result of [full, summary, page, batch, orgBatch]) expect(result).toMatchObject(expected);
    expect(summary.orders).toEqual([]);
    expect(page.orders).toHaveLength(1);
    expect(page.orders[0]).toEqual(full.orders[1]);
    expect(page.ordersPagination).toMatchObject({ totalCount: 3, page: 2, limit: 1 });
    const publicDetail = await getPublicEventWithApprovedSessions(fixture.pool, draft.id);
    expect(publicDetail?.sessions[0].ticketTypes[0].quota).toBe(14);
  });

  it('aggregates decimal per-order rounding, partial refunds, per-ticket, flat and legacy privilege fees', async () => {
    const owner = { id: fixture.ids.owner, role: 'owner' as const };
    const cases = [
      { mode: 'percentage' as const, rate: 5, refunded: false, privilege: false, expectedFee: 10.02 },
      { mode: 'percentage' as const, rate: 5, refunded: true, privilege: false, expectedFee: 7.51 },
      { mode: 'per_ticket' as const, rate: 5.25, refunded: true, privilege: false, expectedFee: 15.75 },
      { mode: 'flat_fee' as const, rate: 100, refunded: true, privilege: false, expectedFee: 100 },
      { mode: 'percentage' as const, rate: 5, refunded: true, privilege: true, expectedFee: 4.50 },
    ];
    for (const scenario of cases) {
      const draft = await event(`Decimal ${scenario.mode} ${scenario.expectedFee}`, 'Decimal Hall', 50.05);
      await ensureReportSchema(fixture.pool);
      await saveEventFeeSettings(fixture.pool, draft.id, {
        organizerFeeMode: scenario.mode, organizerFeeRate: scenario.rate,
        organizerFeePrivilegeRate: 3, ubuPrivilegeMode: scenario.privilege,
        customerFeeMode: 'per_ticket', customerFeeRate: 20, reservePercentage: 0,
      }, fixture.ids.owner);
      const sessionId = draft.sessions[0].id;
      const typeId = draft.sessions[0].ticketTypes[0].id;
      // Accounting fixtures model historic issued orders with null snapshots.
      // Actual payment/refund transitions are covered by the adjacent journey.
      await fixture.pool.query(`INSERT INTO orders (id, "eventId", "sessionId", "buyerName", "buyerEmail", "buyerPhone", status,
        subtotal, "customerFee", total, "customerFeeMode", "customerFeeRate", "expiresAt")
        SELECT $1 || '-order-' || n, $1, $2, 'Decimal buyer', $3, '0812345678', 'reserved',
          100.10, 40, 140.10, 'per_ticket', 20, now() + interval '15 minutes' FROM generate_series(1,2) n`,
      [draft.id, sessionId, scenario.privilege ? 'student@ubu.ac.th' : 'normal@ticket.invalid']);
      await fixture.pool.query(`INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
        SELECT $1 || '-item-' || n, $1 || '-order-' || n, $2, 2, 50.05, 100.10 FROM generate_series(1,2) n`, [draft.id, typeId]);
      await fixture.pool.query(`INSERT INTO tickets (id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId", "ticketCode", "qrPayload", price, status)
        SELECT $1 || '-ticket-' || n, $1 || '-order-' || CEIL(n/2.0)::int, $1 || '-item-' || CEIL(n/2.0)::int,
          $1, $2, $3, $1 || '-code-' || n, $1 || '-qr-' || n, 50.05,
          CASE WHEN $4 AND n = 1 THEN 'refunded' ELSE 'valid' END FROM generate_series(1,4) n`, [draft.id, sessionId, typeId, scenario.refunded]);
      await fixture.pool.query(`UPDATE orders SET status = 'paid' WHERE "eventId" = $1`, [draft.id]);
      const full = await getEventMoneyReport(fixture.pool, draft.id, owner);
      const summary = await getEventMoneyReport(fixture.pool, draft.id, owner, { includeOrders: false });
      const batch = (await getOwnerFinanceSummaries(fixture.pool, owner)).find(item => item.eventId === draft.id);
      for (const report of [full, summary, batch]) {
        expect(report).toMatchObject({ grossSales: 200.20, netSales: scenario.refunded ? 150.15 : 200.20,
          organizerFee: scenario.expectedFee, totalTicketsIssuedCount: 4, totalTicketsValidCount: scenario.refunded ? 3 : 4 });
      }
      if (scenario.mode === 'percentage' && !scenario.privilege) {
        expect(full.orders.map(order => order.orderFeeOriginal)).toEqual([5.01, 5.01]);
        if (scenario.refunded) expect(full.orders.find(order => order.refundedTicketsCount === 1)).toMatchObject({ orderFeeAdjusted: 2.50, feeAdjustment: 2.51 });
      }
    }
  });
});
