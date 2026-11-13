import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { it, expect } from 'vitest';
import type { Pool } from 'pg';
import { baselineSource, baselineRef, stats, benchmarkEnvironment } from '../../scripts/benchmarks/browser.mjs';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, queryPublicEventsCatalog, getPublicEventWithApprovedSessions } from '../../src/server/events';
import { saveEventFeeSettings, listAllEventsWithFeeSettings } from '../../src/server/fees';
import { ensureReportSchema, getEventMoneyReport, getOwnerFinanceSummaries } from '../../src/server/reports';

it('compares actual baseline/current SQL on identical isolated PostgreSQL data', async () => {
  const fixture = await authFixture('integration');
  const tempDir = path.resolve('.cache/optimization-baseline');
  await mkdir(tempDir, { recursive: true });
  const loadBaseline = async (name: string) => {
    const source = baselineSource(`src/server/${name}.ts`).replaceAll("to_regclass('public.", "to_regclass('").replace(
      /from '(\.\/?[^']+)'/g,
      (_match: string, relative: string) => `from '${path.resolve('src/server', relative)}'`,
    );
    const filename = path.join(tempDir, `${name}.ts`);
    await writeFile(filename, source);
    return import(/* @vite-ignore */ filename);
  };
  try {
    const beforeReports = await loadBaseline('reports') as typeof import('../../src/server/reports');
    const beforeEvents = await loadBaseline('events') as typeof import('../../src/server/events');
    const pool = fixture.pool;
    const actor = { id: fixture.ids.owner, role: 'owner' as const };
    const eventIds: string[] = [];
    let sessionId = '', ticketTypeId = '';
    for (let i = 0; i < 30; i++) {
      const event = await createEventDraft(pool, fixture.ids.organizer, {
        title: `Benchmark concert ${i.toString().padStart(2, '0')}`, location: `Hall ${i % 3}`,
        description: `${'Concert description '.repeat(85)}${i === 7 ? 'SPECIAL_KEYWORD' : ''}`,
      }, Array.from({ length: 4 }, (_, j) => ({
        startTime: new Date(Date.now() + (30 + j) * 86400000).toISOString(),
        endTime: new Date(Date.now() + (30 + j) * 86400000 + 14400000).toISOString(),
        ticketTypes: Array.from({ length: 3 }, (_, k) => ({ name: `Type ${k}`, price: 800 + k * 200, quota: 10000 })),
      })));
      if (!event) throw Error('Missing fixture event');
      eventIds.push(event.id);
      if (i === 0) { sessionId = event.sessions[0].id; ticketTypeId = event.sessions[0].ticketTypes[0].id; }
      await saveEventFeeSettings(pool, event.id, {
        organizerFeeMode: 'percentage', organizerFeeRate: 5, customerFeeMode: 'per_ticket', customerFeeRate: 20, reservePercentage: 10,
      }, fixture.ids.owner);
    }
    await pool.query("UPDATE events SET status = 'approved'");
    await pool.query("UPDATE event_sessions SET status = 'approved'");
    await ensureReportSchema(pool);
    await pool.query(`INSERT INTO orders (id, "eventId", "sessionId", "buyerName", "buyerEmail", "buyerPhone", status,
      subtotal, "customerFee", total, "customerFeeMode", "customerFeeRate", "organizerFeeMode", "organizerFeeRate", "expiresAt")
      SELECT 'bo-'||n, $1, $2, 'Buyer '||n, 'buyer-'||n||'@ticket.invalid', '0812345678', 'reserved',
      2400, 60, 2460, 'per_ticket', 20, 'percentage', 5, now() + interval '15 minutes' FROM generate_series(1,500) n`, [eventIds[0], sessionId]);
    await pool.query(`INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
      SELECT 'bi-'||n, 'bo-'||n, $1, 3, 800, 2400 FROM generate_series(1,500) n`, [ticketTypeId]);
    await pool.query(`INSERT INTO tickets (id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId", "ticketCode", "qrPayload", price, status)
      SELECT 'bt-'||n, 'bo-'||CEIL(n/3.0)::int, 'bi-'||CEIL(n/3.0)::int, $1,$2,$3,'BC-'||n,'BQR-'||n,800,
        CASE WHEN n <= 50 THEN 'refunded' ELSE 'valid' END FROM generate_series(1,1500) n`, [eventIds[0], sessionId, ticketTypeId]);
    await pool.query("UPDATE orders SET status = 'paid'");
    await beforeReports.ensureReportSchema(pool);
    await beforeEvents.ensureEventSchema(pool);
    const expected = { grossSales: 1200000, netSales: 1160000, organizerFee: 58000, netEntitlement: 1102000, actualHeldReserve: 110200, payableAmount: 991800 };
    const legacy = await beforeReports.getEventMoneyReport(pool, eventIds[0], actor);
    expect(legacy).toMatchObject(expected);
    const current = await getEventMoneyReport(pool, eventIds[0], actor);
    expect(current).toMatchObject(expected);
    for (const [key, value] of Object.entries(legacy)) {
      if (typeof value === 'number') expect(current[key as keyof typeof current]).toEqual(value);
    }
    expect(current.orders).toEqual(legacy.orders);
    // Legacy orders without a privilege snapshot still use the configured
    // university-email rule. The optimized SQL must match the original rule.
    await pool.query(`UPDATE event_fee_settings SET "ubuPrivilegeMode" = TRUE, "organizerFeePrivilegeRate" = 3 WHERE "eventId" = $1`, [eventIds[0]]);
    await pool.query(`UPDATE orders SET "buyerEmail" = 'student@ubu.ac.th', "ubuPrivilegeApplied" = FALSE,
      "organizerFeePrivilegeRate" = NULL WHERE "eventId" = $1`, [eventIds[0]]);
    const legacyPrivilege = await beforeReports.getEventMoneyReport(pool, eventIds[0], actor);
    const currentPrivilege = await getEventMoneyReport(pool, eventIds[0], actor);
    expect(legacyPrivilege.organizerFee).toBe(34800);
    expect(currentPrivilege.organizerFee).toBe(legacyPrivilege.organizerFee);
    await pool.query(`UPDATE event_fee_settings SET "ubuPrivilegeMode" = FALSE, "organizerFeePrivilegeRate" = 0 WHERE "eventId" = $1`, [eventIds[0]]);
    await pool.query(`UPDATE orders SET "buyerEmail" = 'buyer@ticket.invalid' WHERE "eventId" = $1`, [eventIds[0]]);
    const summaries = await getOwnerFinanceSummaries(pool, actor);
    expect(summaries.find(e => e.eventId === eventIds[0])).toMatchObject(expected);
    const search = await queryPublicEventsCatalog(pool, { q: 'SPECIAL_KEYWORD' });
    expect(search.events.map(e => e.id)).toEqual([eventIds[7]]);
    expect(search.events[0]).not.toHaveProperty('description');
    const detail = await getPublicEventWithApprovedSessions(pool, eventIds[0]);
    expect(detail?.sessions[0].ticketTypes.find((t: { id: string; quota: number }) => t.id === ticketTypeId)?.quota).toBe(8550);
    const legacyDetail = await beforeEvents.getPublicEventWithApprovedSessions(pool, eventIds[0]);
    expect(legacyDetail).toEqual(detail);

    // Count SQL only after both schema initializers are warm. Alternate before/after samples.
    let queryCount = 0;
    const originalQuery = pool.query.bind(pool);
    pool.query = ((...args: unknown[]) => { queryCount++; return Reflect.apply(originalQuery, pool, args); }) as Pool['query'];
    const pairs: Record<string, unknown> = {};
    const measure = async (fn: () => Promise<unknown>) => {
      queryCount = 0;
      const start = performance.now();
      const value = await fn();
      const elapsed = performance.now() - start;
      const responses = value && typeof value === 'object' && '__benchResponses' in value
        ? value.__benchResponses as unknown[] : [value];
      return { ms: elapsed, queries: queryCount, payloadBytes: responses.reduce<number>((sum, response) => sum + Buffer.byteLength(JSON.stringify(response)), 0) };
    };
    const compare = async (name: string, before: () => Promise<unknown>, after: () => Promise<unknown>) => {
      const a = [], b = [];
      for (let i = 0; i < 35; i++) {
        const results = i % 2 ? [await measure(after), await measure(before)].reverse() : [await measure(before), await measure(after)];
        if (i >= 5) { a.push(results[0]); b.push(results[1]); }
      }
      pairs[name] = { before: { ...stats(a.map(s => s.ms)), queries: a.map(s => s.queries), payloadBytes: a[0].payloadBytes },
        after: { ...stats(b.map(s => s.ms)), queries: b.map(s => s.queries), payloadBytes: b[0].payloadBytes } };
    };
    await compare('financeHub', async () => {
      const events = await listAllEventsWithFeeSettings(pool);
      const reports = [];
      for (const event of events) reports.push(await beforeReports.getEventMoneyReport(pool, event.id, actor));
      return { __benchResponses: [{ events }, ...reports.map(report => ({ report }))] };
    }, async () => ({ summaries: await getOwnerFinanceSummaries(pool, actor) }));
    await compare('moneySummary', () => beforeReports.getEventMoneyReport(pool, eventIds[0], actor), () => getEventMoneyReport(pool, eventIds[0], actor, { includeOrders: false }));
    await compare('moneyPage20', () => beforeReports.getEventMoneyReport(pool, eventIds[0], actor), () => getEventMoneyReport(pool, eventIds[0], actor, { ordersPage: 1, ordersLimit: 20 }));
    await compare('eventDetails', () => beforeEvents.getPublicEventWithApprovedSessions(pool, eventIds[0]), () => getPublicEventWithApprovedSessions(pool, eventIds[0]));
    await compare('catalog', () => beforeEvents.listPublicEvents(pool), () => queryPublicEventsCatalog(pool, { limit: 12 }));
    pool.query = originalQuery;
    await mkdir('docs/benchmarks/results', { recursive: true });
    const version = await pool.query('SELECT version() AS version');
    await writeFile('docs/benchmarks/results/database.json', `${JSON.stringify({
      measuredAt: new Date().toISOString(), node: process.version, postgres: version.rows[0].version,
      provenance: benchmarkEnvironment(),
      baselineRef, data: { events: 30, sessionsPerEvent: 4, typesPerSession: 3, orders: 500, tickets: 1500, refundedTickets: 50 },
      warmups: 5, measuredIterations: 30, method: 'alternating paired samples; DB function time, not HTTP or browser page time',
      correctness: { expected, allNumericReportFieldsMatch: true, fullOrdersMatch: true, descriptionSearch: true, quota: 8550 },
      baselineAdapter: 'Only to_regclass public qualification is removed from baseline events module to honor isolated test search_path. SQL algorithms otherwise unmodified; both details paths now include held/refunded counts.',
      pairs,
    }, null, 2)}\n`);
  } finally {
    await fixture.cleanup();
    await rm(tempDir, { recursive: true, force: true });
  }
});
