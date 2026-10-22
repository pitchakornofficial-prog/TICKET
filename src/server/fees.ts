import type { Pool } from 'pg';

export type OrganizerFeeMode = 'percentage' | 'per_ticket' | 'flat_fee';
export type CustomerFeeMode = 'per_ticket' | 'per_order' | 'percentage';

export interface EventFeeSettings {
  eventId: string;
  organizerFeeMode: OrganizerFeeMode;
  organizerFeeRate: number;
  customerFeeMode: CustomerFeeMode;
  customerFeeRate: number;
  reservePercentage: number;
  organizerFeeLocked: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface FeeSettingsInput {
  organizerFeeMode: OrganizerFeeMode;
  organizerFeeRate: number;
  customerFeeMode: CustomerFeeMode;
  customerFeeRate: number;
  reservePercentage: number;
}

/**
 * R(x): Exact-decimal half-up rounding to specified decimal places (default 2).
 * Handles string or number inputs, avoiding floating-point precision pitfalls.
 * e.g. R(10.005) -> 10.01, R(10.004) -> 10.00
 */
export function roundHalfUp(val: number | string, decimals = 2): number {
  const num = typeof val === 'string' ? Number.parseFloat(val) : val;
  if (Number.isNaN(num) || !Number.isFinite(num)) return 0;
  if (decimals < 0) throw new Error('Decimals must be non-negative');

  const sign = num < 0 ? -1 : 1;
  // Convert using fixed precision string to handle floating artifacts
  const absStr = Math.abs(num).toFixed(decimals + 6);
  const [intPart, fracPart = ''] = absStr.split('.');

  if (fracPart.length <= decimals) {
    return Number((sign * Number(`${intPart}.${fracPart}`)).toFixed(decimals));
  }

  const targetDigit = Number(fracPart[decimals]);
  const preservedDecimals = fracPart.slice(0, decimals);
  let intVal = BigInt(intPart + preservedDecimals);
  if (targetDigit >= 5) {
    intVal += 1n;
  }

  const intValStr = intVal.toString().padStart(decimals + 1, '0');
  const finalInt = intValStr.slice(0, intValStr.length - decimals) || '0';
  const finalFrac = intValStr.slice(intValStr.length - decimals);
  return Number(`${sign < 0 ? '-' : ''}${finalInt}.${finalFrac}`);
}

/**
 * Calculates customer fee and total:
 * - per_ticket: R(a * N)
 * - per_order: R(b)
 * - percentage: R(B * c / 100), where B is ticket total before fees
 */
export function calculateCustomerFee(
  mode: CustomerFeeMode,
  rate: number,
  ticketCount: number,
  ticketSubtotal: number,
): { fee: number; total: number } {
  if (rate < 0) throw new Error('Customer fee rate cannot be negative');
  if (ticketCount < 0) throw new Error('Ticket count cannot be negative');
  if (ticketSubtotal < 0) throw new Error('Ticket subtotal cannot be negative');

  let fee = 0;
  if (mode === 'per_ticket') {
    fee = roundHalfUp(rate * ticketCount);
  } else if (mode === 'per_order') {
    fee = roundHalfUp(rate);
  } else if (mode === 'percentage') {
    fee = roundHalfUp((ticketSubtotal * rate) / 100);
  } else {
    throw new Error(`Unknown customer fee mode: ${mode}`);
  }

  const total = roundHalfUp(ticketSubtotal + fee);
  return { fee, total };
}

/**
 * Calculates organizer fee per order:
 * - percentage: F_o = R(V_o * r / 100) per order
 * - per_ticket: F_o = R(n_o * a) per order
 * - flat_fee: 0 per order (flat fee is assessed once per event, F = R(K))
 */
export function calculateOrganizerOrderFee(
  mode: OrganizerFeeMode,
  rate: number,
  ticketCount: number,
  orderTicketSubtotal: number,
): number {
  if (rate < 0) throw new Error('Organizer fee rate cannot be negative');
  if (ticketCount < 0) throw new Error('Ticket count cannot be negative');
  if (orderTicketSubtotal < 0) throw new Error('Order ticket subtotal cannot be negative');

  if (mode === 'percentage') {
    return roundHalfUp((orderTicketSubtotal * rate) / 100);
  }
  if (mode === 'per_ticket') {
    return roundHalfUp(ticketCount * rate);
  }
  if (mode === 'flat_fee') {
    return 0;
  }
  throw new Error(`Unknown organizer fee mode: ${mode}`);
}

/**
 * Reserve target = R(max(E, 0) * s / 100)
 */
export function calculateReserveTarget(netEntitlement: number, reservePercentage: number): number {
  if (reservePercentage < 0 || reservePercentage > 100) {
    throw new Error('Reserve percentage must be between 0 and 100');
  }
  const base = Math.max(0, netEntitlement);
  return roundHalfUp((base * reservePercentage) / 100);
}

export async function ensureFeeSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_fee_settings (
      "eventId" TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      "organizerFeeMode" TEXT NOT NULL DEFAULT 'percentage',
      "organizerFeeRate" NUMERIC(12, 2) NOT NULL DEFAULT 0,
      "customerFeeMode" TEXT NOT NULL DEFAULT 'per_ticket',
      "customerFeeRate" NUMERIC(12, 2) NOT NULL DEFAULT 0,
      "reservePercentage" NUMERIC(5, 2) NOT NULL DEFAULT 0,
      "organizerFeeLocked" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedBy" TEXT REFERENCES auth_user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_event_fee_settings_eventId ON event_fee_settings("eventId");
  `);
}

export async function getEventFeeSettings(pool: Pool, eventId: string): Promise<EventFeeSettings> {
  await ensureFeeSchema(pool);
  const res = await pool.query(
    `SELECT "eventId", "organizerFeeMode", "organizerFeeRate", "customerFeeMode", "customerFeeRate",
            "reservePercentage", "organizerFeeLocked", "createdAt", "updatedAt", "updatedBy"
     FROM event_fee_settings
     WHERE "eventId" = $1`,
    [eventId],
  );

  if (res.rowCount === 0) {
    return {
      eventId,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 0,
      customerFeeMode: 'per_ticket',
      customerFeeRate: 0,
      reservePercentage: 0,
      organizerFeeLocked: false,
    };
  }

  const row = res.rows[0];
  return {
    eventId: row.eventId,
    organizerFeeMode: row.organizerFeeMode as OrganizerFeeMode,
    organizerFeeRate: Number(row.organizerFeeRate),
    customerFeeMode: row.customerFeeMode as CustomerFeeMode,
    customerFeeRate: Number(row.customerFeeRate),
    reservePercentage: Number(row.reservePercentage),
    organizerFeeLocked: Boolean(row.organizerFeeLocked),
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export async function saveEventFeeSettings(
  pool: Pool,
  eventId: string,
  input: FeeSettingsInput,
  updatedBy: string,
): Promise<EventFeeSettings> {
  await ensureFeeSchema(pool);

  // Validate event existence
  const eventCheck = await pool.query('SELECT id FROM events WHERE id = $1', [eventId]);
  if (eventCheck.rowCount === 0) {
    throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
  }

  // Validate organizer fee mode
  const validOrganizerModes: OrganizerFeeMode[] = ['percentage', 'per_ticket', 'flat_fee'];
  if (!validOrganizerModes.includes(input.organizerFeeMode)) {
    throw new Error('รูปแบบค่าบริการผู้จัดงานไม่ถูกต้อง');
  }
  if (input.organizerFeeRate < 0 || Number.isNaN(Number(input.organizerFeeRate))) {
    throw new Error('อัตราค่าบริการผู้จัดงานต้องไม่ติดลบ');
  }

  // Validate customer fee mode
  const validCustomerModes: CustomerFeeMode[] = ['per_ticket', 'per_order', 'percentage'];
  if (!validCustomerModes.includes(input.customerFeeMode)) {
    throw new Error('รูปแบบค่าบริการลูกค้าไม่ถูกต้อง');
  }
  if (input.customerFeeRate < 0 || Number.isNaN(Number(input.customerFeeRate))) {
    throw new Error('อัตราค่าบริการลูกค้าต้องไม่ติดลบ');
  }

  // Validate reserve percentage (0 - 100)
  if (
    input.reservePercentage < 0 ||
    input.reservePercentage > 100 ||
    Number.isNaN(Number(input.reservePercentage))
  ) {
    throw new Error('เปอร์เซ็นต์เงินสำรองต้องอยู่ระหว่าง 0 ถึง 100');
  }

  // Check if organizer fee is locked
  const existing = await getEventFeeSettings(pool, eventId);
  if (existing.organizerFeeLocked) {
    if (
      existing.organizerFeeMode !== input.organizerFeeMode ||
      roundHalfUp(existing.organizerFeeRate) !== roundHalfUp(input.organizerFeeRate)
    ) {
      throw new Error(
        'ค่าบริการฝั่งผู้จัดงานถูกล็อกแล้วเนื่องจากมีคำสั่งซื้อหรือการกันบัตรแล้ว ไม่สามารถเปลี่ยนแปลงได้',
      );
    }
  }

  const res = await pool.query(
    `INSERT INTO event_fee_settings (
       "eventId", "organizerFeeMode", "organizerFeeRate", "customerFeeMode", "customerFeeRate",
       "reservePercentage", "organizerFeeLocked", "updatedAt", "updatedBy"
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
     ON CONFLICT ("eventId") DO UPDATE SET
       "organizerFeeMode" = EXCLUDED."organizerFeeMode",
       "organizerFeeRate" = EXCLUDED."organizerFeeRate",
       "customerFeeMode" = EXCLUDED."customerFeeMode",
       "customerFeeRate" = EXCLUDED."customerFeeRate",
       "reservePercentage" = EXCLUDED."reservePercentage",
       "updatedAt" = now(),
       "updatedBy" = EXCLUDED."updatedBy"
     RETURNING "eventId", "organizerFeeMode", "organizerFeeRate", "customerFeeMode", "customerFeeRate",
               "reservePercentage", "organizerFeeLocked", "createdAt", "updatedAt", "updatedBy"`,
    [
      eventId,
      input.organizerFeeMode,
      roundHalfUp(input.organizerFeeRate),
      input.customerFeeMode,
      roundHalfUp(input.customerFeeRate),
      roundHalfUp(input.reservePercentage),
      existing.organizerFeeLocked,
      updatedBy,
    ],
  );

  const row = res.rows[0];
  return {
    eventId: row.eventId,
    organizerFeeMode: row.organizerFeeMode as OrganizerFeeMode,
    organizerFeeRate: Number(row.organizerFeeRate),
    customerFeeMode: row.customerFeeMode as CustomerFeeMode,
    customerFeeRate: Number(row.customerFeeRate),
    reservePercentage: Number(row.reservePercentage),
    organizerFeeLocked: Boolean(row.organizerFeeLocked),
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export async function lockOrganizerFee(pool: Pool, eventId: string): Promise<void> {
  await ensureFeeSchema(pool);
  await pool.query(
    `INSERT INTO event_fee_settings ("eventId", "organizerFeeLocked", "updatedAt")
     VALUES ($1, TRUE, now())
     ON CONFLICT ("eventId") DO UPDATE SET
       "organizerFeeLocked" = TRUE,
       "updatedAt" = now()`,
    [eventId],
  );
}

export interface OwnerEventWithFeeSettings {
  id: string;
  title: string;
  location: string;
  status: string;
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  feeSettings: EventFeeSettings;
}

export async function listAllEventsWithFeeSettings(
  pool: Pool,
): Promise<OwnerEventWithFeeSettings[]> {
  await ensureFeeSchema(pool);
  const res = await pool.query(
    `SELECT e.id, e.title, e.location, e.status, e."organizerId",
            u.name as "organizerName", u.email as "organizerEmail",
            f."organizerFeeMode", f."organizerFeeRate",
            f."customerFeeMode", f."customerFeeRate",
            f."reservePercentage", f."organizerFeeLocked",
            f."updatedAt" as "feeUpdatedAt"
     FROM events e
     JOIN auth_user u ON e."organizerId" = u.id
     LEFT JOIN event_fee_settings f ON e.id = f."eventId"
     ORDER BY e."createdAt" DESC`,
  );

  return res.rows.map(row => ({
    id: row.id,
    title: row.title,
    location: row.location,
    status: row.status,
    organizerId: row.organizerId,
    organizerName: row.organizerName || 'ไม่ระบุ',
    organizerEmail: row.organizerEmail || '',
    feeSettings: {
      eventId: row.id,
      organizerFeeMode: (row.organizerFeeMode || 'percentage') as OrganizerFeeMode,
      organizerFeeRate: row.organizerFeeRate != null ? Number(row.organizerFeeRate) : 0,
      customerFeeMode: (row.customerFeeMode || 'per_ticket') as CustomerFeeMode,
      customerFeeRate: row.customerFeeRate != null ? Number(row.customerFeeRate) : 0,
      reservePercentage: row.reservePercentage != null ? Number(row.reservePercentage) : 0,
      organizerFeeLocked: Boolean(row.organizerFeeLocked),
      updatedAt: row.feeUpdatedAt?.toISOString(),
    },
  }));
}
