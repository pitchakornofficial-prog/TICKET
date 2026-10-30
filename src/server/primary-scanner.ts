import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ensureEventSchema } from './events';
import { ensureTicketSchema } from './tickets';
import { ensureAdmissionSchema } from './admission';

export interface PrimaryScannerRecord {
  eventId: string;
  scannerId: string;
  scannerName: string;
  scannerEmail: string;
  deviceId?: string | null;
  assignedAt: string;
  assignedBy: string;
}

export interface EventOfflineControl {
  eventId: string;
  offlineStatus: 'active' | 'halted_reconciliation_required';
  haltReason?: string | null;
  haltDetails?: string | null;
  haltedAt?: string | null;
  haltedBy?: string | null;
  resumedAt?: string | null;
  resumedBy?: string | null;
  updatedAt: string;
}

export interface PrimaryScannerHandoverItem {
  id: string;
  eventId: string;
  oldScannerId?: string | null;
  oldScannerName?: string | null;
  newScannerId?: string | null;
  newScannerName?: string | null;
  action: 'HANDOVER' | 'EMERGENCY_STOP' | 'RESUME_RECONCILIATION';
  oldScannerPendingCount: number;
  newScannerSyncedAt?: string | null;
  reason?: string | null;
  actorId: string;
  actorName: string;
  createdAt: string;
}

export interface HandoverReadiness {
  ready: boolean;
  canHandover: boolean;
  currentPrimary: PrimaryScannerRecord | null;
  candidateScanner: { id: string; name: string; email: string; lastSyncedAt: string | null } | null;
  oldPendingCount: number;
  isNewScannerSynced: boolean;
  isOfflineHalted: boolean;
  reasons: string[];
}

export interface OfflineTicketItem {
  id: string;
  ticketCode: string;
  qrPayload: string;
  ticketTypeId: string;
  ticketTypeName: string;
  sessionId: string;
  status: 'valid' | 'revoked' | 'refunded' | 'cancelled';
  admissionStatus: 'outside' | 'inside';
  isRefunded: boolean;
  admissionWindow: {
    startTime: string;
    endTime: string;
    admissionStartTime?: string | null;
    admissionEndTime?: string | null;
  };
}

export interface OfflineSessionItem {
  id: string;
  startTime: string;
  endTime: string;
  admissionStartTime?: string | null;
  admissionEndTime?: string | null;
  status: string;
  ticketTypes: Array<{
    id: string;
    name: string;
    price: number;
  }>;
}

export interface OfflineAdmissionLogItem {
  id: string;
  ticketId: string;
  ticketCode: string;
  action: 'entry' | 'exit';
  status: 'success' | 'rejected';
  createdAt: string;
}

export interface OfflineDataset {
  event: {
    id: string;
    title: string;
    location: string;
    status: string;
  };
  primaryScanner: {
    scannerId: string;
    scannerName: string;
    scannerEmail: string;
    assignedAt: string;
  } | null;
  isCurrentScannerPrimary: boolean;
  sessions: OfflineSessionItem[];
  tickets: OfflineTicketItem[];
  admissionLogs: OfflineAdmissionLogItem[];
  lastSuccessfulSync: string;
  syncTimestamp: string;
  totalTickets: number;
  offlineStatus?: 'active' | 'halted_reconciliation_required';
  isOfflineHalted?: boolean;
}

export async function ensurePrimaryScannerSchema(pool: Pool): Promise<void> {
  await ensureEventSchema(pool);
  await ensureTicketSchema(pool);
  await ensureAdmissionSchema(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_primary_scanners (
      "eventId" TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      "scannerId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      "scannerName" TEXT NOT NULL,
      "scannerEmail" TEXT NOT NULL,
      "deviceId" TEXT,
      "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "assignedBy" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_event_primary_scanner ON event_primary_scanners("scannerId");

    CREATE TABLE IF NOT EXISTS event_offline_controls (
      "eventId" TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      "offlineStatus" TEXT NOT NULL DEFAULT 'active',
      "haltReason" TEXT,
      "haltDetails" TEXT,
      "haltedAt" TIMESTAMPTZ,
      "haltedBy" TEXT,
      "resumedAt" TIMESTAMPTZ,
      "resumedBy" TEXT,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS primary_scanner_handovers (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "oldScannerId" TEXT,
      "oldScannerName" TEXT,
      "newScannerId" TEXT,
      "newScannerName" TEXT,
      action TEXT NOT NULL,
      "oldScannerPendingCount" INT DEFAULT 0,
      "newScannerSyncedAt" TIMESTAMPTZ,
      reason TEXT,
      "actorId" TEXT NOT NULL,
      "actorName" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_handovers_event ON primary_scanner_handovers("eventId");

    CREATE TABLE IF NOT EXISTS scanner_dataset_syncs (
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "scannerId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      "syncedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY ("eventId", "scannerId")
    );
  `);
}

/**
 * Get current primary scanner for an event.
 */
export async function getEventPrimaryScanner(
  pool: Pool,
  eventId: string,
): Promise<PrimaryScannerRecord | null> {
  await ensurePrimaryScannerSchema(pool);

  const res = await pool.query<{
    eventId: string;
    scannerId: string;
    scannerName: string;
    scannerEmail: string;
    deviceId: string | null;
    assignedAt: Date;
    assignedBy: string;
  }>(
    `SELECT "eventId", "scannerId", "scannerName", "scannerEmail", "deviceId", "assignedAt", "assignedBy"
     FROM event_primary_scanners
     WHERE "eventId" = $1`,
    [eventId],
  );

  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return {
    eventId: row.eventId,
    scannerId: row.scannerId,
    scannerName: row.scannerName,
    scannerEmail: row.scannerEmail,
    deviceId: row.deviceId,
    assignedAt: row.assignedAt.toISOString(),
    assignedBy: row.assignedBy,
  };
}

/**
 * Set the primary scanner for an event (AC-94, G-41).
 * Strictly atomic: exactly ONE primary scanner per whole event.
 * Replaces any existing primary scanner atomically.
 */
export async function setEventPrimaryScanner(
  pool: Pool,
  actor: { id: string; role: string },
  eventId: string,
  scannerId: string,
  deviceId?: string,
): Promise<PrimaryScannerRecord> {
  await ensurePrimaryScannerSchema(pool);

  // 1. Verify event exists and check organizer authorization
  const evRes = await pool.query<{ organizerId: string }>(
    'SELECT "organizerId" FROM events WHERE id = $1',
    [eventId],
  );
  if (evRes.rowCount === 0) {
    throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
  }

  const eventOrganizerId = evRes.rows[0].organizerId;
  if (actor.role !== 'owner' && actor.id !== eventOrganizerId) {
    throw new Error('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการเครื่องหลักของคอนเสิร์ตนี้ (AC-94)');
  }

  // 2. Verify that target scanner belongs to event_scanners for this event
  const scannerCheck = await pool.query<{
    scannerId: string;
    name: string;
    email: string;
  }>(
    `SELECT es."scannerId", u.name, u.email
     FROM event_scanners es
     JOIN auth_user u ON u.id = es."scannerId"
     WHERE es."eventId" = $1 AND es."scannerId" = $2`,
    [eventId, scannerId],
  );

  if (scannerCheck.rowCount === 0) {
    throw new Error('ทีมสแกนที่ระบุไม่ได้อยู่ในรายชื่อทีมสแกนของคอนเสิร์ตนี้');
  }

  const scanner = scannerCheck.rows[0];

  // 3. Atomically upsert primary scanner (exactly ONE per event)
  const upsertRes = await pool.query<{
    eventId: string;
    scannerId: string;
    scannerName: string;
    scannerEmail: string;
    deviceId: string | null;
    assignedAt: Date;
    assignedBy: string;
  }>(
    `INSERT INTO event_primary_scanners (
       "eventId", "scannerId", "scannerName", "scannerEmail", "deviceId", "assignedAt", "assignedBy"
     ) VALUES ($1, $2, $3, $4, $5, now(), $6)
     ON CONFLICT ("eventId") DO UPDATE SET
       "scannerId" = EXCLUDED."scannerId",
       "scannerName" = EXCLUDED."scannerName",
       "scannerEmail" = EXCLUDED."scannerEmail",
       "deviceId" = EXCLUDED."deviceId",
       "assignedAt" = now(),
       "assignedBy" = EXCLUDED."assignedBy"
     RETURNING "eventId", "scannerId", "scannerName", "scannerEmail", "deviceId", "assignedAt", "assignedBy"`,
    [eventId, scanner.scannerId, scanner.name, scanner.email, deviceId || null, actor.id],
  );

  const row = upsertRes.rows[0];
  return {
    eventId: row.eventId,
    scannerId: row.scannerId,
    scannerName: row.scannerName,
    scannerEmail: row.scannerEmail,
    deviceId: row.deviceId,
    assignedAt: row.assignedAt.toISOString(),
    assignedBy: row.assignedBy,
  };
}

/**
 * Remove primary scanner designation for an event.
 */
export async function removeEventPrimaryScanner(
  pool: Pool,
  actor: { id: string; role: string },
  eventId: string,
): Promise<boolean> {
  await ensurePrimaryScannerSchema(pool);

  const evRes = await pool.query<{ organizerId: string }>(
    'SELECT "organizerId" FROM events WHERE id = $1',
    [eventId],
  );
  if (evRes.rowCount === 0) {
    throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
  }

  const eventOrganizerId = evRes.rows[0].organizerId;
  if (actor.role !== 'owner' && actor.id !== eventOrganizerId) {
    throw new Error('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการเครื่องหลักของคอนเสิร์ตนี้ (AC-94)');
  }

  const del = await pool.query('DELETE FROM event_primary_scanners WHERE "eventId" = $1', [eventId]);
  return (del.rowCount ?? 0) > 0;
}

/**
 * Prepare and retrieve the offline dataset for an event (AC-94, AC-65, G-41).
 * Strictly sanitizes buyer PII (zero name, email, phone, fee, proof files - AC-65).
 */
export async function getOfflineDataset(
  pool: Pool,
  actor: { id: string; role: string },
  eventId: string,
): Promise<OfflineDataset> {
  await ensurePrimaryScannerSchema(pool);

  // 1. Authorization check
  const evRes = await pool.query<{
    id: string;
    title: string;
    location: string;
    status: string;
    organizerId: string;
  }>('SELECT id, title, location, status, "organizerId" FROM events WHERE id = $1', [eventId]);

  if (evRes.rowCount === 0) {
    throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
  }

  const event = evRes.rows[0];

  if (actor.role === 'scanner') {
    // Check if scanner is assigned to this event (AC-08)
    const scanCheck = await pool.query(
      'SELECT 1 FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2',
      [eventId, actor.id],
    );
    if (scanCheck.rowCount === 0) {
      throw new Error('ไม่อนุญาต: คุณไม่ได้เป็นทีมสแกนของคอนเสิร์ตนี้ (AC-08)');
    }
  } else if (actor.role === 'organizer') {
    if (event.organizerId !== actor.id) {
      throw new Error('ไม่อนุญาต: คุณไม่ใช่ผู้จัดงานของคอนเสิร์ตนี้ (AC-07)');
    }
  } else if (actor.role !== 'owner') {
    throw new Error('ไม่มีสิทธิ์เข้าถึงชุดข้อมูลออฟไลน์');
  }

  // 2. Fetch primary scanner
  const primaryRecord = await getEventPrimaryScanner(pool, eventId);
  const isCurrentScannerPrimary =
    primaryRecord?.scannerId === actor.id ||
    (actor.role === 'organizer' && event.organizerId === actor.id) ||
    actor.role === 'owner';

  // 3. Fetch sessions with ticket types and admission windows
  const sessRes = await pool.query<{
    id: string;
    startTime: Date;
    endTime: Date;
    admissionStartTime: Date | null;
    admissionEndTime: Date | null;
    status: string;
  }>(
    `SELECT id, "startTime", "endTime", "admissionStartTime", "admissionEndTime", status
     FROM event_sessions
     WHERE "eventId" = $1
     ORDER BY "startTime" ASC`,
    [eventId],
  );

  const sessions: OfflineSessionItem[] = [];
  const sessionMap = new Map<string, typeof sessRes.rows[0]>();

  for (const s of sessRes.rows) {
    sessionMap.set(s.id, s);
    const ttRes = await pool.query<{ id: string; name: string; price: string | number }>(
      'SELECT id, name, price FROM ticket_types WHERE "sessionId" = $1 ORDER BY price ASC',
      [s.id],
    );
    sessions.push({
      id: s.id,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      admissionStartTime: s.admissionStartTime?.toISOString() || null,
      admissionEndTime: s.admissionEndTime?.toISOString() || null,
      status: s.status,
      ticketTypes: ttRes.rows.map(tt => ({
        id: tt.id,
        name: tt.name,
        price: Number(tt.price),
      })),
    });
  }

  // 4. Fetch tickets for this event (excluding buyer PII - AC-65)
  // Strictly SELECT only ticket identification and admission state columns!
  const ticketsRes = await pool.query<{
    id: string;
    ticketCode: string;
    qrPayload: string;
    ticketTypeId: string;
    ticketTypeName: string;
    sessionId: string;
    status: string;
    admissionStatus: string;
  }>(
    `SELECT t.id, t."ticketCode", t."qrPayload", t."ticketTypeId",
            tt.name as "ticketTypeName", t."sessionId",
            t.status, t."admissionStatus"
     FROM tickets t
     JOIN ticket_types tt ON tt.id = t."ticketTypeId"
     WHERE t."eventId" = $1
     ORDER BY t."ticketCode" ASC`,
    [eventId],
  );

  const tickets: OfflineTicketItem[] = ticketsRes.rows.map(t => {
    const s = sessionMap.get(t.sessionId);
    const isRefunded = t.status === 'refunded' || t.status === 'revoked';
    return {
      id: t.id,
      ticketCode: t.ticketCode,
      qrPayload: t.qrPayload,
      ticketTypeId: t.ticketTypeId,
      ticketTypeName: t.ticketTypeName,
      sessionId: t.sessionId,
      status: t.status as 'valid' | 'revoked' | 'refunded' | 'cancelled',
      admissionStatus: (t.admissionStatus as 'outside' | 'inside') || 'outside',
      isRefunded,
      admissionWindow: {
        startTime: s?.startTime.toISOString() || '',
        endTime: s?.endTime.toISOString() || '',
        admissionStartTime: s?.admissionStartTime?.toISOString() || null,
        admissionEndTime: s?.admissionEndTime?.toISOString() || null,
      },
    };
  });

  // 5. Fetch admission logs (zero PII)
  const logsRes = await pool.query<{
    id: string;
    ticketId: string;
    ticketCode: string;
    action: string;
    status: string;
    createdAt: Date;
  }>(
    `SELECT id, "ticketId", "ticketCode", action, status, "createdAt"
     FROM ticket_admission_logs
     WHERE "eventId" = $1
     ORDER BY "createdAt" DESC
     LIMIT 500`,
    [eventId],
  );

  const admissionLogs: OfflineAdmissionLogItem[] = logsRes.rows.map(l => ({
    id: l.id,
    ticketId: l.ticketId,
    ticketCode: l.ticketCode,
    action: l.action as 'entry' | 'exit',
    status: l.status as 'success' | 'rejected',
    createdAt: l.createdAt.toISOString(),
  }));

  // Track dataset sync for candidate readiness check (AC-97)
  await pool.query(
    `INSERT INTO scanner_dataset_syncs ("eventId", "scannerId", "syncedAt")
     VALUES ($1, $2, now())
     ON CONFLICT ("eventId", "scannerId") DO UPDATE SET "syncedAt" = now()`,
    [eventId, actor.id],
  );

  const ctrlRes = await pool.query<{ offlineStatus: string; haltReason: string | null }>(
    'SELECT "offlineStatus", "haltReason" FROM event_offline_controls WHERE "eventId" = $1',
    [eventId],
  );
  const offlineStatus = (ctrlRes.rows[0]?.offlineStatus as 'active' | 'halted_reconciliation_required') || 'active';
  const isOfflineHalted = offlineStatus === 'halted_reconciliation_required';

  const nowIso = new Date().toISOString();

  return {
    event: {
      id: event.id,
      title: event.title,
      location: event.location,
      status: event.status,
    },
    primaryScanner: primaryRecord
      ? {
          scannerId: primaryRecord.scannerId,
          scannerName: primaryRecord.scannerName,
          scannerEmail: primaryRecord.scannerEmail,
          assignedAt: primaryRecord.assignedAt,
        }
      : null,
    isCurrentScannerPrimary,
    sessions,
    tickets,
    admissionLogs,
    lastSuccessfulSync: nowIso,
    syncTimestamp: nowIso,
    totalTickets: tickets.length,
    offlineStatus,
    isOfflineHalted,
  };
}

/**
 * Check primary handover readiness (AC-97, G-43).
 * Verifies:
 * 1. Old primary has zero pending scans (old pending = 0).
 * 2. New scanner has synced the latest dataset.
 * 3. Event offline mode is not halted for reconciliation.
 */
export async function checkHandoverReadiness(
  pool: Pool,
  eventId: string,
  newScannerId: string,
  declaredOldPendingCount?: number,
): Promise<HandoverReadiness> {
  await ensurePrimaryScannerSchema(pool);

  const currentPrimary = await getEventPrimaryScanner(pool, eventId);

  // Check offline control status (AC-98)
  const ctrlRes = await pool.query<{ offlineStatus: string }>(
    'SELECT "offlineStatus" FROM event_offline_controls WHERE "eventId" = $1',
    [eventId],
  );
  const isOfflineHalted = ctrlRes.rows[0]?.offlineStatus === 'halted_reconciliation_required';

  // Check candidate scanner
  const candidateRes = await pool.query<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email
     FROM event_scanners es
     JOIN auth_user u ON u.id = es."scannerId"
     WHERE es."eventId" = $1 AND es."scannerId" = $2`,
    [eventId, newScannerId],
  );

  const candidate = candidateRes.rows[0]
    ? {
        id: candidateRes.rows[0].id,
        name: candidateRes.rows[0].name,
        email: candidateRes.rows[0].email,
        lastSyncedAt: null as string | null,
      }
    : null;

  // Check if candidate scanner has synced the dataset
  let lastSyncedAt: string | null = null;
  if (candidate) {
    const syncRes = await pool.query<{ syncedAt: Date }>(
      'SELECT "syncedAt" FROM scanner_dataset_syncs WHERE "eventId" = $1 AND "scannerId" = $2',
      [eventId, newScannerId],
    );
    if ((syncRes.rowCount ?? 0) > 0) {
      lastSyncedAt = syncRes.rows[0].syncedAt.toISOString();
      candidate.lastSyncedAt = lastSyncedAt;
    }
  }

  const oldPendingCount = declaredOldPendingCount ?? 0;
  const reasons: string[] = [];

  if (isOfflineHalted) {
    reasons.push('การใช้งานออฟไลน์ถูกระงับเพื่อกระทบยอด (AC-98) กรุณาดำเนินการกระทบยอดร่วมกับเจ้าของเว็บและปลดระงับก่อน');
  }

  if (!candidate) {
    reasons.push('ทีมสแกนเป้าหมายไม่ได้อยู่ในรายชื่อทีมสแกนของคอนเสิร์ตนี้');
  }

  if (currentPrimary && currentPrimary.scannerId === newScannerId) {
    reasons.push('เครื่องนี้ได้รับการกำหนดเป็นเครื่องหลักอยู่แล้ว');
  }

  if (currentPrimary && oldPendingCount > 0) {
    reasons.push(`เครื่องเดิมยังมีรายการสแกนค้างที่ยังไม่ซิงก์กลับส่วนกลาง (${oldPendingCount} รายการ) กรุณาซิงก์ข้อมูลให้เสร็จสิ้นก่อนสลับเครื่อง (AC-97)`);
  }

  if (!lastSyncedAt) {
    reasons.push('เครื่องใหม่ยังไม่ได้ดาวน์โหลดชุดข้อมูลล่าสุด กรุณาดาวน์โหลดชุดข้อมูลออฟไลน์บนเครื่องใหม่ก่อนทำการสลับเครื่อง (AC-97)');
  }

  const ready = reasons.length === 0;

  return {
    ready,
    canHandover: ready,
    currentPrimary,
    candidateScanner: candidate,
    oldPendingCount,
    isNewScannerSynced: Boolean(lastSyncedAt),
    isOfflineHalted,
    reasons,
  };
}

/**
 * Handover primary scanner designation atomically (AC-97, G-43).
 * Requires old pending = 0 and new dataset synced.
 */
export async function handoverEventPrimaryScanner(
  pool: Pool,
  actor: { id: string; role: string; name?: string },
  eventId: string,
  newScannerId: string,
  options?: {
    oldScannerPendingCount?: number;
    reason?: string;
  },
): Promise<{
  success: boolean;
  primaryScanner: PrimaryScannerRecord;
  handover: PrimaryScannerHandoverItem;
}> {
  await ensurePrimaryScannerSchema(pool);

  // 1. Verify organizer / owner authorization
  const evRes = await pool.query<{ organizerId: string }>(
    'SELECT "organizerId" FROM events WHERE id = $1',
    [eventId],
  );
  if (evRes.rowCount === 0) {
    throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
  }
  const eventOrganizerId = evRes.rows[0].organizerId;
  if (actor.role !== 'owner' && actor.id !== eventOrganizerId) {
    throw new Error('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการเครื่องหลักของคอนเสิร์ตนี้ (AC-97)');
  }

  // 2. Check handover readiness
  const readiness = await checkHandoverReadiness(
    pool,
    eventId,
    newScannerId,
    options?.oldScannerPendingCount,
  );

  if (!readiness.ready) {
    throw new Error(`ไม่อนุญาตให้สลับเครื่องหลัก: ${readiness.reasons.join(', ')}`);
  }

  const candidate = readiness.candidateScanner;
  if (!candidate) {
    throw new Error('ไม่พบข้อมูลทีมสแกนเป้าหมาย');
  }

  const oldPrimary = readiness.currentPrimary;

  // 3. Atomically update primary scanner and record handover history
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const upsertRes = await client.query<{
      eventId: string;
      scannerId: string;
      scannerName: string;
      scannerEmail: string;
      deviceId: string | null;
      assignedAt: Date;
      assignedBy: string;
    }>(
      `INSERT INTO event_primary_scanners (
         "eventId", "scannerId", "scannerName", "scannerEmail", "deviceId", "assignedAt", "assignedBy"
       ) VALUES ($1, $2, $3, $4, $5, now(), $6)
       ON CONFLICT ("eventId") DO UPDATE SET
         "scannerId" = EXCLUDED."scannerId",
         "scannerName" = EXCLUDED."scannerName",
         "scannerEmail" = EXCLUDED."scannerEmail",
         "assignedAt" = now(),
         "assignedBy" = EXCLUDED."assignedBy"
       RETURNING "eventId", "scannerId", "scannerName", "scannerEmail", "deviceId", "assignedAt", "assignedBy"`,
      [eventId, candidate.id, candidate.name, candidate.email, null, actor.id],
    );

    const handoverId = `hnd-${randomUUID()}`;
    const handoverRes = await client.query<{
      id: string;
      eventId: string;
      oldScannerId: string | null;
      oldScannerName: string | null;
      newScannerId: string;
      newScannerName: string;
      action: string;
      oldScannerPendingCount: number;
      newScannerSyncedAt: Date | null;
      reason: string | null;
      actorId: string;
      actorName: string;
      createdAt: Date;
    }>(
      `INSERT INTO primary_scanner_handovers (
         id, "eventId", "oldScannerId", "oldScannerName", "newScannerId",
         "newScannerName", action, "oldScannerPendingCount", "newScannerSyncedAt",
         reason, "actorId", "actorName", "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, 'HANDOVER', $7, $8, $9, $10, $11, now())
       RETURNING *`,
      [
        handoverId,
        eventId,
        oldPrimary?.scannerId || null,
        oldPrimary?.scannerName || null,
        candidate.id,
        candidate.name,
        options?.oldScannerPendingCount || 0,
        candidate.lastSyncedAt ? new Date(candidate.lastSyncedAt) : null,
        options?.reason || 'สลับเครื่องหลักตามระเบียบ AC-97',
        actor.id,
        actor.name || actor.id,
      ],
    );

    await client.query('COMMIT');

    const primaryRow = upsertRes.rows[0];
    const hRow = handoverRes.rows[0];

    return {
      success: true,
      primaryScanner: {
        eventId: primaryRow.eventId,
        scannerId: primaryRow.scannerId,
        scannerName: primaryRow.scannerName,
        scannerEmail: primaryRow.scannerEmail,
        deviceId: primaryRow.deviceId,
        assignedAt: primaryRow.assignedAt.toISOString(),
        assignedBy: primaryRow.assignedBy,
      },
      handover: {
        id: hRow.id,
        eventId: hRow.eventId,
        oldScannerId: hRow.oldScannerId,
        oldScannerName: hRow.oldScannerName,
        newScannerId: hRow.newScannerId,
        newScannerName: hRow.newScannerName,
        action: 'HANDOVER',
        oldScannerPendingCount: hRow.oldScannerPendingCount,
        newScannerSyncedAt: hRow.newScannerSyncedAt?.toISOString() || null,
        reason: hRow.reason,
        actorId: hRow.actorId,
        actorName: hRow.actorName,
        createdAt: hRow.createdAt.toISOString(),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Emergency stop offline admission for an event (AC-98, NQ-06).
 * Halts offline mode when primary device is damaged or local data is lost with unsynced scans.
 */
export async function emergencyStopOffline(
  pool: Pool,
  actor: { id: string; role: string; name?: string },
  eventId: string,
  options?: {
    reason?: string;
    details?: string;
    lostPendingCount?: number;
  },
): Promise<EventOfflineControl> {
  await ensurePrimaryScannerSchema(pool);

  // 1. Authorization check
  const evRes = await pool.query<{ organizerId: string }>(
    'SELECT "organizerId" FROM events WHERE id = $1',
    [eventId],
  );
  if (evRes.rowCount === 0) {
    throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
  }
  const eventOrganizerId = evRes.rows[0].organizerId;
  if (actor.role !== 'owner' && actor.id !== eventOrganizerId) {
    throw new Error('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการเครื่องหลักของคอนเสิร์ตนี้ (AC-98)');
  }

  const oldPrimary = await getEventPrimaryScanner(pool, eventId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Upsert event_offline_controls to halted
    const haltReason = options?.reason || 'DEVICE_DAMAGED_RECONCILIATION_REQUIRED';
    const haltDetails = options?.details || 'เครื่องหลักชำรุด สูญหาย หรือข้อมูลสูญหาย ต้องหยุดใช้งานออฟไลน์เพื่อกระทบยอดตาม NQ-06';

    const ctrlRes = await client.query<{
      eventId: string;
      offlineStatus: 'active' | 'halted_reconciliation_required';
      haltReason: string | null;
      haltDetails: string | null;
      haltedAt: Date | null;
      haltedBy: string | null;
      resumedAt: Date | null;
      resumedBy: string | null;
      updatedAt: Date;
    }>(
      `INSERT INTO event_offline_controls (
         "eventId", "offlineStatus", "haltReason", "haltDetails", "haltedAt", "haltedBy", "updatedAt"
       ) VALUES ($1, 'halted_reconciliation_required', $2, $3, now(), $4, now())
       ON CONFLICT ("eventId") DO UPDATE SET
         "offlineStatus" = 'halted_reconciliation_required',
         "haltReason" = EXCLUDED."haltReason",
         "haltDetails" = EXCLUDED."haltDetails",
         "haltedAt" = now(),
         "haltedBy" = EXCLUDED."haltedBy",
         "updatedAt" = now()
       RETURNING *`,
      [eventId, haltReason, haltDetails, actor.name || actor.id],
    );

    // 3. Remove current primary designation
    await client.query('DELETE FROM event_primary_scanners WHERE "eventId" = $1', [eventId]);

    // 4. Record handover log
    const handoverId = `hnd-${randomUUID()}`;
    await client.query(
      `INSERT INTO primary_scanner_handovers (
         id, "eventId", "oldScannerId", "oldScannerName", "newScannerId",
         "newScannerName", action, "oldScannerPendingCount", reason, "actorId", "actorName", "createdAt"
       ) VALUES ($1, $2, $3, $4, NULL, NULL, 'EMERGENCY_STOP', $5, $6, $7, $8, now())`,
      [
        handoverId,
        eventId,
        oldPrimary?.scannerId || null,
        oldPrimary?.scannerName || null,
        options?.lostPendingCount || 0,
        haltReason,
        actor.id,
        actor.name || actor.id,
      ],
    );

    await client.query('COMMIT');

    const row = ctrlRes.rows[0];
    return {
      eventId: row.eventId,
      offlineStatus: row.offlineStatus,
      haltReason: row.haltReason,
      haltDetails: row.haltDetails,
      haltedAt: row.haltedAt?.toISOString() || null,
      haltedBy: row.haltedBy,
      resumedAt: row.resumedAt?.toISOString() || null,
      resumedBy: row.resumedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resume offline admission after reconciliation (AC-98, NQ-06).
 */
export async function resumeOfflineAdmissionAfterReconciliation(
  pool: Pool,
  actor: { id: string; role: string; name?: string },
  eventId: string,
  options?: {
    notes?: string;
  },
): Promise<EventOfflineControl> {
  await ensurePrimaryScannerSchema(pool);

  // 1. Authorization check
  const evRes = await pool.query<{ organizerId: string }>(
    'SELECT "organizerId" FROM events WHERE id = $1',
    [eventId],
  );
  if (evRes.rowCount === 0) {
    throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
  }
  const eventOrganizerId = evRes.rows[0].organizerId;
  if (actor.role !== 'owner' && actor.id !== eventOrganizerId) {
    throw new Error('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการเครื่องหลักของคอนเสิร์ตนี้ (AC-98)');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ctrlRes = await client.query<{
      eventId: string;
      offlineStatus: 'active' | 'halted_reconciliation_required';
      haltReason: string | null;
      haltDetails: string | null;
      haltedAt: Date | null;
      haltedBy: string | null;
      resumedAt: Date | null;
      resumedBy: string | null;
      updatedAt: Date;
    }>(
      `UPDATE event_offline_controls
       SET "offlineStatus" = 'active', "resumedAt" = now(), "resumedBy" = $1, "updatedAt" = now()
       WHERE "eventId" = $2
       RETURNING *`,
      [actor.name || actor.id, eventId],
    );

    const handoverId = `hnd-${randomUUID()}`;
    await client.query(
      `INSERT INTO primary_scanner_handovers (
         id, "eventId", action, reason, "actorId", "actorName", "createdAt"
       ) VALUES ($1, $2, 'RESUME_RECONCILIATION', $3, $4, $5, now())`,
      [
        handoverId,
        eventId,
        options?.notes || 'กระทบยอดเสร็จสิ้น อนุญาตให้ตั้งเครื่องหลักใหม่ได้ตามปกติ',
        actor.id,
        actor.name || actor.id,
      ],
    );

    await client.query('COMMIT');

    const row = ctrlRes.rows[0];
    return {
      eventId: row.eventId,
      offlineStatus: row.offlineStatus,
      haltReason: row.haltReason,
      haltDetails: row.haltDetails,
      haltedAt: row.haltedAt?.toISOString() || null,
      haltedBy: row.haltedBy,
      resumedAt: row.resumedAt?.toISOString() || null,
      resumedBy: row.resumedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get event offline control status and handover history.
 */
export async function getEventOfflineControl(
  pool: Pool,
  eventId: string,
): Promise<{
  control: EventOfflineControl;
  handovers: PrimaryScannerHandoverItem[];
}> {
  await ensurePrimaryScannerSchema(pool);

  const ctrlRes = await pool.query<{
    eventId: string;
    offlineStatus: 'active' | 'halted_reconciliation_required';
    haltReason: string | null;
    haltDetails: string | null;
    haltedAt: Date | null;
    haltedBy: string | null;
    resumedAt: Date | null;
    resumedBy: string | null;
    updatedAt: Date;
  }>(
    'SELECT * FROM event_offline_controls WHERE "eventId" = $1',
    [eventId],
  );

  const control: EventOfflineControl = ctrlRes.rows[0]
    ? {
        eventId: ctrlRes.rows[0].eventId,
        offlineStatus: ctrlRes.rows[0].offlineStatus,
        haltReason: ctrlRes.rows[0].haltReason,
        haltDetails: ctrlRes.rows[0].haltDetails,
        haltedAt: ctrlRes.rows[0].haltedAt?.toISOString() || null,
        haltedBy: ctrlRes.rows[0].haltedBy,
        resumedAt: ctrlRes.rows[0].resumedAt?.toISOString() || null,
        resumedBy: ctrlRes.rows[0].resumedBy,
        updatedAt: ctrlRes.rows[0].updatedAt.toISOString(),
      }
    : {
        eventId,
        offlineStatus: 'active',
        updatedAt: new Date().toISOString(),
      };

  const hRes = await pool.query<{
    id: string;
    eventId: string;
    oldScannerId: string | null;
    oldScannerName: string | null;
    newScannerId: string | null;
    newScannerName: string | null;
    action: 'HANDOVER' | 'EMERGENCY_STOP' | 'RESUME_RECONCILIATION';
    oldScannerPendingCount: number;
    newScannerSyncedAt: Date | null;
    reason: string | null;
    actorId: string;
    actorName: string;
    createdAt: Date;
  }>(
    `SELECT * FROM primary_scanner_handovers WHERE "eventId" = $1 ORDER BY "createdAt" DESC LIMIT 20`,
    [eventId],
  );

  const handovers: PrimaryScannerHandoverItem[] = hRes.rows.map(r => ({
    id: r.id,
    eventId: r.eventId,
    oldScannerId: r.oldScannerId,
    oldScannerName: r.oldScannerName,
    newScannerId: r.newScannerId,
    newScannerName: r.newScannerName,
    action: r.action,
    oldScannerPendingCount: r.oldScannerPendingCount,
    newScannerSyncedAt: r.newScannerSyncedAt?.toISOString() || null,
    reason: r.reason,
    actorId: r.actorId,
    actorName: r.actorName,
    createdAt: r.createdAt.toISOString(),
  }));

  return { control, handovers };
}
