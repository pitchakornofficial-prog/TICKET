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

  // 3. Fetch issued tickets
  const ticketsRes = await pool.query<{
    id: string;
    eventId: string;
    ticketTypeId: string;
    status: string;
    admissionStatus: string;
    createdAt: Date;
    tierName: string;
    price: string | number;
  }>(
    `SELECT t.id, t."eventId", t."ticketTypeId", t.status, t."admissionStatus", t."createdAt",
            tt.name AS "tierName", tt.price
     FROM tickets t
     JOIN ticket_types tt ON tt.id = t."ticketTypeId"
     JOIN events e ON e.id = t."eventId"
     WHERE e."organizerId" = $1
       AND ($2::text IS NULL OR e.id = $2)`,
    [organizerId, activeEventId],
  );

  const allTickets = ticketsRes.rows;

  // 4. Calculate KPIs
  const totalEvents = events.length;
  const approvedEvents = events.filter(e => e.status === 'approved').length;
  const draftEvents = events.filter(e => e.status === 'draft').length;

  let grossSales = 0;
  let totalTicketsSold = 0;
  let totalAdmitted = 0;
  let totalRefunded = 0;

  for (const t of allTickets) {
    const numPrice = Number(t.price) || 0;
    if (t.status === 'valid' || t.status === 'used') {
      grossSales += numPrice;
      totalTicketsSold += 1;
    }
    if (t.status === 'refunded') {
      totalRefunded += 1;
    }
    if (t.admissionStatus === 'inside' || t.admissionStatus === 'admitted' || t.status === 'used') {
      totalAdmitted += 1;
    }
  }

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

  for (const t of allTickets) {
    if (t.status === 'valid' || t.status === 'used') {
      const existing = tierMap.get(t.tierName);
      if (existing) {
        existing.sold += 1;
      }
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

  for (const t of allTickets) {
    const ev = concertMap.get(t.eventId);
    if (ev && (t.status === 'valid' || t.status === 'used')) {
      ev.sold += 1;
      ev.grossSales += Number(t.price) || 0;
    }
  }

  const concertComparison = Array.from(concertMap.values());

  // 7. Sales trend buckets (group by day)
  const validTickets = allTickets.filter(t => t.status === 'valid' || t.status === 'used');
  const trendBuckets: { id?: string; period: string; sales: number; tickets: number }[] = [];
  if (validTickets.length > 0) {
    const sorted = [...validTickets].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const dayMap = new Map<string, { label: string; sales: number; tickets: number }>();

    for (const t of sorted) {
      const d = new Date(t.createdAt);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
      const current = dayMap.get(dateKey) || { label, sales: 0, tickets: 0 };
      current.sales += Number(t.price) || 0;
      current.tickets += 1;
      dayMap.set(dateKey, current);
    }

    for (const [dateKey, val] of dayMap.entries()) {
      trendBuckets.push({
        id: dateKey,
        period: val.label,
        sales: val.sales,
        tickets: val.tickets,
      });
    }

    // Keep up to 7 most recent days if there are many days
    if (trendBuckets.length > 7) {
      trendBuckets.splice(0, trendBuckets.length - 7);
    }
  }

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
