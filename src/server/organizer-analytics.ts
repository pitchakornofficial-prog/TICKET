import type { Pool } from 'pg';
import { ensureTicketSchema } from '@/server/tickets';
import { ensureEventSchema } from '@/server/events';

export interface OrganizerAnalyticsResult {
  events: { id: string; title: string; status: string; location: string }[];
  selectedEventId: string | null;
  kpi: {
    totalEvents: number;
    approvedEvents: number;
    draftEvents: number;
    grossSales: number;
    totalTicketsSold: number;
    totalAdmitted: number;
    totalRefunded: number;
    totalQuota: number;
  };
  salesTrend: { id?: string; period: string; sales: number; tickets: number }[];
  tierBreakdown: { tierName: string; sold: number; quota: number; price: number; color: string }[];
  admissionStats: { total: number; admitted: number; pending: number };
  ticketStatusDistribution: { paid: number; admitted: number; refunded: number };
  concertComparison: {
    id: string;
    title: string;
    status: string;
    grossSales: number;
    sold: number;
    quota: number;
  }[];
}

const TIER_COLORS = ['#2563eb', '#0d9488', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

export async function getOrganizerAnalytics(
  pool: Pool,
  organizerId: string,
  filterEventId?: string | null,
): Promise<OrganizerAnalyticsResult> {
  await ensureEventSchema(pool);
  await ensureTicketSchema(pool);

  // 1. Fetch all organizer events
  const eventsRes = await pool.query<{
    id: string;
    title: string;
    status: string;
    location: string;
    createdAt: Date;
  }>(
    `SELECT id, title, status, location, "createdAt"
     FROM events
     WHERE "organizerId" = $1
     ORDER BY "createdAt" DESC`,
    [organizerId],
  );

  const events = eventsRes.rows.map(r => ({
    id: r.id,
    title: r.title,
    status: r.status,
    location: r.location,
  }));

  // Validate filterEventId if provided
  const activeEventId =
    filterEventId && events.some(e => e.id === filterEventId) ? filterEventId : null;

  // 2. Fetch ticket types & quotas
  const tiersRes = await pool.query<{
    id: string;
    name: string;
    price: string | number;
    quota: number;
    eventId: string;
    eventTitle: string;
  }>(
    `SELECT tt.id, tt.name, tt.price, tt.quota, es."eventId", e.title AS "eventTitle"
     FROM ticket_types tt
     JOIN event_sessions es ON es.id = tt."sessionId"
     JOIN events e ON e.id = es."eventId"
     WHERE e."organizerId" = $1
       AND ($2::text IS NULL OR e.id = $2)`,
    [organizerId, activeEventId],
  );

  // 3. Aggregate ticket KPIs, per-event/tier sales, and 7-day sales trend directly in PostgreSQL
  const [kpiRes, tierEventAggRes, trendRes] = await Promise.all([
    pool.query<{
      grossSales: number;
      totalTicketsSold: number;
      totalAdmitted: number;
      totalRefunded: number;
    }>(
      `SELECT
         COALESCE(SUM(tt.price) FILTER (WHERE t.status IN ('valid', 'used')), 0)::float8 AS "grossSales",
         COUNT(*) FILTER (WHERE t.status IN ('valid', 'used'))::int AS "totalTicketsSold",
         COUNT(*) FILTER (WHERE t."admissionStatus" IN ('inside', 'admitted') OR t.status = 'used')::int AS "totalAdmitted",
         COUNT(*) FILTER (WHERE t.status = 'refunded')::int AS "totalRefunded"
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t."ticketTypeId"
       JOIN events e ON e.id = t."eventId"
       WHERE e."organizerId" = $1
         AND ($2::text IS NULL OR e.id = $2)`,
      [organizerId, activeEventId],
    ),
    pool.query<{
      eventId: string;
      tierName: string;
      sold: number;
      grossSales: number;
    }>(
      `SELECT
         t."eventId",
         tt.name AS "tierName",
         COUNT(*)::int AS sold,
         COALESCE(SUM(tt.price), 0)::float8 AS "grossSales"
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t."ticketTypeId"
       JOIN events e ON e.id = t."eventId"
       WHERE e."organizerId" = $1
         AND ($2::text IS NULL OR e.id = $2)
         AND t.status IN ('valid', 'used')
       GROUP BY t."eventId", tt.name`,
      [organizerId, activeEventId],
    ),
    pool.query<{
      dateKey: string;
      sales: number;
      tickets: number;
    }>(
      `SELECT
         TO_CHAR(t."createdAt" AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS "dateKey",
         COALESCE(SUM(tt.price), 0)::float8 AS sales,
         COUNT(*)::int AS tickets
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t."ticketTypeId"
       JOIN events e ON e.id = t."eventId"
       WHERE e."organizerId" = $1
         AND ($2::text IS NULL OR e.id = $2)
         AND t.status IN ('valid', 'used')
       GROUP BY 1
       ORDER BY 1 DESC
       LIMIT 7`,
      [organizerId, activeEventId],
    ),
  ]);

  // 4. Calculate KPIs
  const totalEvents = events.length;
  const approvedEvents = events.filter(e => e.status === 'approved').length;
  const draftEvents = events.filter(e => e.status === 'draft').length;

  const kpiRow = kpiRes.rows[0];
  const grossSales = Number(kpiRow?.grossSales) || 0;
  const totalTicketsSold = Number(kpiRow?.totalTicketsSold) || 0;
  const totalAdmitted = Number(kpiRow?.totalAdmitted) || 0;
  const totalRefunded = Number(kpiRow?.totalRefunded) || 0;

  const totalQuota = tiersRes.rows.reduce((sum, tier) => sum + tier.quota, 0);

  // 5. Tier breakdown
  const tierMap = new Map<string, { tierName: string; sold: number; quota: number; price: number }>();
  for (const tier of tiersRes.rows) {
    const existing = tierMap.get(tier.name);
    if (!existing) {
      tierMap.set(tier.name, {
        tierName: tier.name,
        sold: 0,
        quota: tier.quota,
        price: Number(tier.price) || 0,
      });
    } else {
      existing.quota += tier.quota;
    }
  }

  for (const agg of tierEventAggRes.rows) {
    const existing = tierMap.get(agg.tierName);
    if (existing) {
      existing.sold += Number(agg.sold) || 0;
    }
  }

  const tierBreakdown = Array.from(tierMap.values()).map((t, idx) => ({
    ...t,
    color: TIER_COLORS[idx % TIER_COLORS.length],
  }));

  // 6. Concert comparison
  const concertMap = new Map<string, { id: string; title: string; status: string; grossSales: number; sold: number; quota: number }>();
  for (const ev of events) {
    concertMap.set(ev.id, {
      id: ev.id,
      title: ev.title,
      status: ev.status,
      grossSales: 0,
      sold: 0,
      quota: 0,
    });
  }

  for (const tier of tiersRes.rows) {
    const ev = concertMap.get(tier.eventId);
    if (ev) {
      ev.quota += tier.quota;
    }
  }

  for (const agg of tierEventAggRes.rows) {
    const ev = concertMap.get(agg.eventId);
    if (ev) {
      ev.sold += Number(agg.sold) || 0;
      ev.grossSales += Number(agg.grossSales) || 0;
    }
  }

  const concertComparison = Array.from(concertMap.values());

  // 7. Sales trend buckets (last 7 active days from SQL)
  const trendBuckets: { id?: string; period: string; sales: number; tickets: number }[] = [...trendRes.rows]
    .reverse()
    .map(row => {
      const d = new Date(`${row.dateKey}T00:00:00+07:00`);
      const label = d.toLocaleDateString('th-TH', {
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Bangkok',
      });
      return {
        id: row.dateKey,
        period: label,
        sales: Number(row.sales) || 0,
        tickets: Number(row.tickets) || 0,
      };
    });

  if (trendBuckets.length === 0) {
    // If no tickets sold yet, return baseline zero points so chart renders cleanly
    trendBuckets.push(
      { id: 'baseline-w1', period: 'สัปดาห์ 1', sales: 0, tickets: 0 },
      { id: 'baseline-w2', period: 'สัปดาห์ 2', sales: 0, tickets: 0 },
      { id: 'baseline-w3', period: 'สัปดาห์ 3', sales: 0, tickets: 0 },
      { id: 'baseline-current', period: 'สัปดาห์ปัจจุบัน', sales: grossSales, tickets: totalTicketsSold },
    );
  }

  return {
    events,
    selectedEventId: activeEventId,
    kpi: {
      totalEvents,
      approvedEvents,
      draftEvents,
      grossSales,
      totalTicketsSold,
      totalAdmitted,
      totalRefunded,
      totalQuota,
    },
    salesTrend: trendBuckets,
    tierBreakdown,
    admissionStats: {
      total: totalTicketsSold,
      admitted: totalAdmitted,
      pending: Math.max(0, totalTicketsSold - totalAdmitted),
    },
    ticketStatusDistribution: {
      paid: totalTicketsSold,
      admitted: totalAdmitted,
      refunded: totalRefunded,
    },
    concertComparison,
  };
}
