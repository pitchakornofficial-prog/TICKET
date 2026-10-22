import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ensureTicketSchema } from './tickets.ts';

export interface ScannedTicketSummary {
  ticketId: string;
  ticketCode: string;
  ticketTypeName: string;
  ticketPrice: number;
  eventTitle: string;
  sessionId: string;
  sessionStartTime: string;
  sessionEndTime: string;
  admissionStatus: 'inside' | 'outside';
  scannedAt: string;
}

export interface AdmissionScanInput {
  scannerId: string;
  scannerName: string;
  scannerRole: string; // 'scanner' | 'organizer' | 'owner'
  sessionId: string;
  qrPayloadOrCode: string;
  action: 'entry' | 'exit';
  now?: Date;
}

export interface AdmissionScanResult {
  success: boolean;
  status: 'success' | 'rejected';
  action: 'entry' | 'exit';
  reason?: string;
  message: string;
  ticket?: ScannedTicketSummary;
}

export interface AdmissionStats {
  sessionId: string;
  totalTickets: number;
  currentlyInside: number;
  currentlyOutside: number;
  totalEntries: number;
  totalExits: number;
}

export interface AdmissionLogItem {
  id: string;
  ticketId: string;
  ticketCode: string;
  scannerName: string;
  action: 'entry' | 'exit';
  status: 'success' | 'rejected' | 'conflict';
  reason: string | null;
  deviceMode: string;
  createdAt: string;
}

export interface AdmissionSyncConflictItem {
  id: string;
  eventId: string;
  eventTitle: string;
  sessionId: string;
  sessionStartTime: string;
  sessionEndTime: string;
  ticketId: string;
  ticketCode: string;
  scannerId: string;
  scannerName: string;
  offlineScanId: string;
  action: 'entry' | 'exit';
  scannedAt: string;
  conflictType: string;
  conflictDetails: string;
  status: 'pending_review' | 'resolved';
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
}

export interface SyncOfflineAdmissionInput {
  scans: Array<{
    id: string;
    ticketId: string;
    ticketCode: string;
    sessionId: string;
    eventId: string;
    scannerId: string;
    scannerName: string;
    action: 'entry' | 'exit';
    status: 'success' | 'rejected';
    reason: string | null;
    deviceMode: 'offline';
    scannedAt: string;
  }>;
}

export interface SyncOfflineAdmissionResult {
  success: boolean;
  acknowledgedIds: string[];
  conflictsCount: number;
  syncedCount: number;
  lastSuccessfulSync: string;
}

export async function ensureAdmissionSchema(pool: Pool): Promise<void> {
  await ensureTicketSchema(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_admission_logs (
      id TEXT PRIMARY KEY,
      "ticketId" TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      "ticketCode" TEXT NOT NULL,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      "scannerId" TEXT NOT NULL REFERENCES auth_user(id),
      "scannerName" TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      "deviceMode" TEXT NOT NULL DEFAULT 'online',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_admission_logs_ticket ON ticket_admission_logs("ticketId");
    CREATE INDEX IF NOT EXISTS idx_admission_logs_session ON ticket_admission_logs("sessionId");
    CREATE INDEX IF NOT EXISTS idx_admission_logs_created ON ticket_admission_logs("createdAt");

    CREATE TABLE IF NOT EXISTS admission_sync_conflicts (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      "ticketId" TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      "ticketCode" TEXT NOT NULL,
      "scannerId" TEXT NOT NULL,
      "scannerName" TEXT NOT NULL,
      "offlineScanId" TEXT NOT NULL,
      action TEXT NOT NULL,
      "scannedAt" TIMESTAMPTZ NOT NULL,
      "conflictType" TEXT NOT NULL,
      "conflictDetails" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      "resolvedBy" TEXT,
      "resolvedAt" TIMESTAMPTZ,
      "resolutionNotes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_admission_conflicts_event ON admission_sync_conflicts("eventId");
    CREATE INDEX IF NOT EXISTS idx_admission_conflicts_status ON admission_sync_conflicts(status);
  `);
}

/**
 * Record an online admission scan (entry or exit).
 * Atomic transaction with SELECT ... FOR UPDATE on the ticket to guarantee concurrency control (AC-101).
 * Enforces role authorization (AC-08), admission window (AC-100), state transitions out->in->out->in (AC-39, AC-49, AC-95),
 * ticket revocation/status checks (AC-101), and strictly strips buyer PII (AC-65).
 */
export async function recordAdmissionScan(
  pool: Pool,
  input: AdmissionScanInput,
): Promise<AdmissionScanResult> {
  // 1. Role verification
  if (!['scanner', 'organizer', 'owner'].includes(input.scannerRole)) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'UNAUTHORIZED_ROLE',
      message: 'ไม่มีสิทธิ์ในการสแกนบัตรเข้างาน',
    };
  }

  await ensureAdmissionSchema(pool);

  // 2. Fetch session and event details
  const sessRes = await pool.query<{
    id: string;
    eventId: string;
    organizerId: string;
    eventTitle: string;
    startTime: Date;
    endTime: Date;
    admissionStartTime: Date | null;
    admissionEndTime: Date | null;
    sessionStatus: string;
  }>(
    `SELECT s.id, s."eventId", e."organizerId", e.title AS "eventTitle",
            s."startTime", s."endTime", s."admissionStartTime", s."admissionEndTime",
            s.status AS "sessionStatus"
     FROM event_sessions s
     JOIN events e ON e.id = s."eventId"
     WHERE s.id = $1`,
    [input.sessionId],
  );

  if (sessRes.rowCount === 0) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'SESSION_NOT_FOUND',
      message: 'ไม่พบรอบการแสดงในระบบ',
    };
  }

  const session = sessRes.rows[0];

  if (session.sessionStatus !== 'approved') {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'SESSION_NOT_APPROVED',
      message: 'รอบการแสดงนี้ยังไม่ได้รับการอนุมัติเปิดให้สแกน',
    };
  }

  // 3. Scanner event-scope authorization (AC-08, AC-09)
  if (input.scannerRole === 'scanner') {
    const scRes = await pool.query(
      `SELECT 1 FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2`,
      [session.eventId, input.scannerId],
    );
    if (scRes.rowCount === 0) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'UNAUTHORIZED_EVENT',
        message: 'คุณไม่มีสิทธิ์สแกนบัตรในคอนเสิร์ตนี้ (AC-08)',
      };
    }
  } else if (input.scannerRole === 'organizer') {
    if (session.organizerId !== input.scannerId) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'UNAUTHORIZED_EVENT',
        message: 'ผู้จัดงานสามารถสแกนได้เฉพาะคอนเสิร์ตของตนเองเท่านั้น (AC-08)',
      };
    }
  }

  // 4. Admission window check (AC-100)
  const currentTime = input.now || new Date();
  const windowStart = session.admissionStartTime
    ? new Date(session.admissionStartTime)
    : new Date(session.startTime);
  const windowEnd = session.admissionEndTime
    ? new Date(session.admissionEndTime)
    : new Date(session.endTime);

  if (currentTime < windowStart) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'OUTSIDE_ADMISSION_WINDOW',
      message: 'ยังไม่ถึงช่วงเวลาเปิดรับเข้างาน (AC-100)',
    };
  }

  if (currentTime > windowEnd) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'OUTSIDE_ADMISSION_WINDOW',
      message: 'พ้นช่วงเวลาเปิดรับเข้างานแล้ว (AC-100)',
    };
  }

  // 5. Concurrency control via SELECT ... FOR UPDATE (AC-101)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cleanInput = input.qrPayloadOrCode.trim();
    const tRes = await client.query<{
      id: string;
      orderId: string;
      eventId: string;
      sessionId: string;
      ticketTypeId: string;
      ticketCode: string;
      qrPayload: string;
      status: string;
      admissionStatus: 'inside' | 'outside';
      ticketTypeName: string;
      ticketPrice: number;
      eventTitle: string;
      sessionStartTime: Date;
      sessionEndTime: Date;
    }>(
      `SELECT t.id, t."orderId", t."eventId", t."sessionId", t."ticketTypeId",
              t."ticketCode", t."qrPayload", t.status, t."admissionStatus",
              tt.name as "ticketTypeName", tt.price as "ticketPrice",
              e.title as "eventTitle", s."startTime" as "sessionStartTime", s."endTime" as "sessionEndTime"
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t."ticketTypeId"
       JOIN event_sessions s ON s.id = t."sessionId"
       JOIN events e ON e.id = t."eventId"
       WHERE (t."qrPayload" = $1 OR t."ticketCode" = $1)
       FOR UPDATE`,
      [cleanInput],
    );

    if (tRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'TICKET_NOT_FOUND',
        message: 'ไม่พบบัตรในระบบ กรุณาตรวจสอบรหัสบัตรหรือ QR Code (AC-101)',
      };
    }

    const ticket = tRes.rows[0];

    const ticketSummary: ScannedTicketSummary = {
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      ticketTypeName: ticket.ticketTypeName,
      ticketPrice: Number(ticket.ticketPrice),
      eventTitle: ticket.eventTitle,
      sessionId: ticket.sessionId,
      sessionStartTime:
        ticket.sessionStartTime instanceof Date
          ? ticket.sessionStartTime.toISOString()
          : String(ticket.sessionStartTime),
      sessionEndTime:
        ticket.sessionEndTime instanceof Date
          ? ticket.sessionEndTime.toISOString()
          : String(ticket.sessionEndTime),
      admissionStatus: ticket.admissionStatus,
      scannedAt: new Date().toISOString(),
    };

    // Check wrong event
    if (ticket.eventId !== session.eventId) {
      await client.query(
        `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, reason, "deviceMode", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'rejected', 'WRONG_EVENT', 'online', now())`,
        [
          randomUUID(),
          ticket.id,
          ticket.ticketCode,
          ticket.eventId,
          session.id,
          input.scannerId,
          input.scannerName,
          input.action,
        ],
      );
      await client.query('COMMIT');
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'WRONG_EVENT',
        message: 'บัตรใบนี้เป็นของคอนเสิร์ตอื่น ไม่ตรงกับงานที่กำลังสแกน (AC-101)',
      };
    }

    // Check wrong session
    if (ticket.sessionId !== input.sessionId) {
      await client.query(
        `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, reason, "deviceMode", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'rejected', 'WRONG_SESSION', 'online', now())`,
        [
          randomUUID(),
          ticket.id,
          ticket.ticketCode,
          ticket.eventId,
          session.id,
          input.scannerId,
          input.scannerName,
          input.action,
        ],
      );
      await client.query('COMMIT');
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'WRONG_SESSION',
        message: 'บัตรใบนี้เป็นของรอบการแสดงอื่น ไม่ตรงกับรอบที่กำลังสแกน (AC-100)',
      };
    }

    // Check ticket status (AC-101)
    if (ticket.status === 'cancelled') {
      await client.query(
        `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, reason, "deviceMode", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'rejected', 'TICKET_CANCELLED', 'online', now())`,
        [
          randomUUID(),
          ticket.id,
          ticket.ticketCode,
          ticket.eventId,
          session.id,
          input.scannerId,
          input.scannerName,
          input.action,
        ],
      );
      await client.query('COMMIT');
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'TICKET_CANCELLED',
        message: 'บัตรถูกยกเลิกแล้ว ไม่อนุญาตให้เข้างาน (AC-101)',
      };
    }

    if (ticket.status === 'refunded') {
      await client.query(
        `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, reason, "deviceMode", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'rejected', 'TICKET_REFUNDED', 'online', now())`,
        [
          randomUUID(),
          ticket.id,
          ticket.ticketCode,
          ticket.eventId,
          session.id,
          input.scannerId,
          input.scannerName,
          input.action,
        ],
      );
      await client.query('COMMIT');
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'TICKET_REFUNDED',
        message: 'บัตรถูกคืนเงินแล้ว ไม่อนุญาตให้เข้างาน (AC-101)',
      };
    }

    if (ticket.status !== 'valid') {
      await client.query(
        `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, reason, "deviceMode", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'rejected', 'INVALID_TICKET', 'online', now())`,
        [
          randomUUID(),
          ticket.id,
          ticket.ticketCode,
          ticket.eventId,
          session.id,
          input.scannerId,
          input.scannerName,
          input.action,
        ],
      );
      await client.query('COMMIT');
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'INVALID_TICKET',
        message: 'สถานะบัตรไม่ถูกต้อง ไม่อนุญาตให้เข้างาน (AC-101)',
      };
    }

    // State transitions (AC-08, AC-39, AC-49, AC-95)
    if (input.action === 'entry') {
      if (ticket.admissionStatus === 'inside') {
        // Repeated entry attempt
        await client.query(
          `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, reason, "deviceMode", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'entry', 'rejected', 'ALREADY_INSIDE', 'online', now())`,
          [
            randomUUID(),
            ticket.id,
            ticket.ticketCode,
            ticket.eventId,
            session.id,
            input.scannerId,
            input.scannerName,
          ],
        );
        await client.query('COMMIT');
        return {
          success: false,
          status: 'rejected',
          action: 'entry',
          reason: 'ALREADY_INSIDE',
          message: 'บัตรอยู่ในพื้นที่จัดงานแล้ว ไม่อนุญาตให้เข้าซ้ำ (AC-49, AC-08)',
          ticket: ticketSummary,
        };
      }

      // Valid entry or reentry
      await client.query(
        `UPDATE tickets SET "admissionStatus" = 'inside', "updatedAt" = now() WHERE id = $1`,
        [ticket.id],
      );
      await client.query(
        `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, reason, "deviceMode", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'entry', 'success', NULL, 'online', now())`,
        [
          randomUUID(),
          ticket.id,
          ticket.ticketCode,
          ticket.eventId,
          session.id,
          input.scannerId,
          input.scannerName,
        ],
      );
      await client.query('COMMIT');
      return {
        success: true,
        status: 'success',
        action: 'entry',
        message: 'บันทึกเข้างานสำเร็จ (ผ่าน)',
        ticket: { ...ticketSummary, admissionStatus: 'inside' },
      };
    } else {
      // Exit action
      if (ticket.admissionStatus !== 'inside') {
        await client.query(
          `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, reason, "deviceMode", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'exit', 'rejected', 'NOT_INSIDE', 'online', now())`,
          [
            randomUUID(),
            ticket.id,
            ticket.ticketCode,
            ticket.eventId,
            session.id,
            input.scannerId,
            input.scannerName,
          ],
        );
        await client.query('COMMIT');
        return {
          success: false,
          status: 'rejected',
          action: 'exit',
          reason: 'NOT_INSIDE',
          message: 'บัตรอยู่นอกพื้นที่จัดงาน ไม่สามารถบันทึกออกได้',
          ticket: ticketSummary,
        };
      }

      // Valid exit
      await client.query(
        `UPDATE tickets SET "admissionStatus" = 'outside', "updatedAt" = now() WHERE id = $1`,
        [ticket.id],
      );
      await client.query(
        `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, reason, "deviceMode", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'exit', 'success', NULL, 'online', now())`,
        [
          randomUUID(),
          ticket.id,
          ticket.ticketCode,
          ticket.eventId,
          session.id,
          input.scannerId,
          input.scannerName,
        ],
      );
      await client.query('COMMIT');
      return {
        success: true,
        status: 'success',
        action: 'exit',
        message: 'บันทึกออกนอกงานสำเร็จ (สามารถกลับเข้างานใหม่ได้ตาม AC-39, AC-95)',
        ticket: { ...ticketSummary, admissionStatus: 'outside' },
      };
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Returns admission summary counts for a session.
 */
export async function getAdmissionStats(
  pool: Pool,
  sessionId: string,
): Promise<AdmissionStats> {
  await ensureAdmissionSchema(pool);

  const tRes = await pool.query<{
    totalTickets: string;
    currentlyInside: string;
    currentlyOutside: string;
  }>(
    `SELECT
       COUNT(*)::text AS "totalTickets",
       COUNT(*) FILTER (WHERE "admissionStatus" = 'inside')::text AS "currentlyInside",
       COUNT(*) FILTER (WHERE "admissionStatus" = 'outside')::text AS "currentlyOutside"
     FROM tickets
     WHERE "sessionId" = $1 AND status = 'valid'`,
    [sessionId],
  );

  const lRes = await pool.query<{
    totalEntries: string;
    totalExits: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE action = 'entry' AND status = 'success')::text AS "totalEntries",
       COUNT(*) FILTER (WHERE action = 'exit' AND status = 'success')::text AS "totalExits"
     FROM ticket_admission_logs
     WHERE "sessionId" = $1`,
    [sessionId],
  );

  return {
    sessionId,
    totalTickets: Number(tRes.rows[0]?.totalTickets || 0),
    currentlyInside: Number(tRes.rows[0]?.currentlyInside || 0),
    currentlyOutside: Number(tRes.rows[0]?.currentlyOutside || 0),
    totalEntries: Number(lRes.rows[0]?.totalEntries || 0),
    totalExits: Number(lRes.rows[0]?.totalExits || 0),
  };
}

/**
 * Returns recent admission logs for a session without buyer PII (AC-65).
 */
export async function getRecentAdmissionLogs(
  pool: Pool,
  sessionId: string,
  limit = 20,
): Promise<AdmissionLogItem[]> {
  await ensureAdmissionSchema(pool);

  const res = await pool.query<{
    id: string;
    ticketId: string;
    ticketCode: string;
    scannerName: string;
    action: 'entry' | 'exit';
    status: 'success' | 'rejected';
    reason: string | null;
    deviceMode: string;
    createdAt: Date;
  }>(
    `SELECT id, "ticketId", "ticketCode", "scannerName", action, status, reason, "deviceMode", "createdAt"
     FROM ticket_admission_logs
     WHERE "sessionId" = $1
     ORDER BY "createdAt" DESC
     LIMIT $2`,
    [sessionId, limit],
  );

  return res.rows.map(r => ({
    id: r.id,
    ticketId: r.ticketId,
    ticketCode: r.ticketCode,
    scannerName: r.scannerName,
    action: r.action,
    status: r.status,
    reason: r.reason,
    deviceMode: r.deviceMode,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}

/**
 * Synchronize offline admission scans back to central server (AC-99, AC-102, G-44).
 * Idempotent: repeated sync batches do not create duplicate logs or duplicate transitions.
 * Conflict detection: if a ticket was centrally refunded/cancelled while offline,
 * records offline audit log and opens sync conflict case for owner review (AC-99).
 * DOES NOT revalidate ticket centrally or cancel refund.
 */
export async function syncOfflineAdmissionScans(
  pool: Pool,
  actor: { id: string; role: string; name?: string },
  eventId: string,
  input: SyncOfflineAdmissionInput,
): Promise<SyncOfflineAdmissionResult> {
  if (!['scanner', 'organizer', 'owner'].includes(actor.role)) {
    throw new Error('ไม่อนุญาต: คุณไม่มีสิทธิ์ซิงก์ข้อมูลการสแกน');
  }

  await ensureAdmissionSchema(pool);

  // Authorize event scope
  if (actor.role === 'scanner') {
    const scRes = await pool.query(
      `SELECT 1 FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2`,
      [eventId, actor.id],
    );
    if (scRes.rowCount === 0) {
      throw new Error('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการข้อมูลของคอนเสิร์ตนี้ (AC-08)');
    }

    const priRes = await pool.query<{ scannerId: string }>(
      `SELECT "scannerId" FROM event_primary_scanners WHERE "eventId" = $1`,
      [eventId],
    );
    if ((priRes.rowCount ?? 0) === 0 || priRes.rows[0].scannerId !== actor.id) {
      throw new Error('ไม่อนุญาต: เฉพาะเครื่องหลักประจำงานเท่านั้นที่สามารถซิงก์ข้อมูลออฟไลน์ได้ (AC-40, AC-94)');
    }
  } else if (actor.role === 'organizer') {
    const evRes = await pool.query(
      `SELECT 1 FROM events WHERE id = $1 AND "organizerId" = $2`,
      [eventId, actor.id],
    );
    if (evRes.rowCount === 0) {
      throw new Error('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการข้อมูลของคอนเสิร์ตนี้ (AC-08)');
    }
  }

  const acknowledgedIds: string[] = [];
  let conflictsCount = 0;
  let syncedCount = 0;

  for (const scan of input.scans) {
    // 1. Idempotency check (AC-102): If this offline scan ID was already stored, acknowledge immediately
    const existRes = await pool.query(
      `SELECT id FROM ticket_admission_logs WHERE id = $1`,
      [scan.id],
    );
    if ((existRes.rowCount ?? 0) > 0) {
      acknowledgedIds.push(scan.id);
      continue;
    }

    // 2. Fetch ticket with SELECT ... FOR UPDATE
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tRes = await client.query<{
        id: string;
        ticketCode: string;
        sessionId: string;
        eventId: string;
        status: string;
        admissionStatus: string;
      }>(
        `SELECT id, "ticketCode", "sessionId", "eventId", status, "admissionStatus"
         FROM tickets
         WHERE id = $1 OR "ticketCode" = $2
         FOR UPDATE`,
        [scan.ticketId, scan.ticketCode],
      );

      if ((tRes.rowCount ?? 0) === 0) {
        // Ticket unknown centrally, still acknowledge to clear unresolvable pending
        await client.query('ROLLBACK');
        acknowledgedIds.push(scan.id);
        continue;
      }

      const ticket = tRes.rows[0];

      // 3. Central Revocation Conflict Detection (AC-99, G-44)
      // If ticket is refunded, cancelled, or revoked centrally, offline admission creates conflict case
      if (ticket.status === 'refunded' || ticket.status === 'cancelled' || ticket.status === 'revoked') {
        const conflictId = `conflict-${randomUUID()}`;
        await client.query(
          `INSERT INTO admission_sync_conflicts (
             id, "eventId", "sessionId", "ticketId", "ticketCode", "scannerId",
             "scannerName", "offlineScanId", action, "scannedAt", "conflictType",
             "conflictDetails", status, "createdAt"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending_review', now())`,
          [
            conflictId,
            ticket.eventId,
            ticket.sessionId,
            ticket.id,
            ticket.ticketCode,
            scan.scannerId,
            scan.scannerName,
            scan.id,
            scan.action,
            new Date(scan.scannedAt),
            'CENTRAL_REVOKED_OFFLINE_ADMIT',
            `บัตรมีสถานะ ${ticket.status} ในระบบกลาง แต่ถูกสแกน ${scan.action === 'entry' ? 'เข้างาน' : 'ออกงาน'} ออฟไลน์`,
          ],
        );

        // Record admission audit log without altering central refund/cancellation status (AC-99)
        await client.query(
          `INSERT INTO ticket_admission_logs (
             id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId",
             "scannerName", action, status, reason, "deviceMode", "createdAt"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'conflict', 'SYNC_CONFLICT_CENTRAL_REVOKED', 'offline', $9)`,
          [
            scan.id,
            ticket.id,
            ticket.ticketCode,
            ticket.eventId,
            ticket.sessionId,
            scan.scannerId,
            scan.scannerName,
            scan.action,
            new Date(scan.scannedAt),
          ],
        );

        await client.query('COMMIT');
        conflictsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

      // 4. Normal valid state transition sync
      const targetAdmissionStatus = scan.action === 'entry' ? 'inside' : 'outside';
      await client.query(
        `UPDATE tickets SET "admissionStatus" = $1, "updatedAt" = now() WHERE id = $2`,
        [targetAdmissionStatus, ticket.id],
      );

      await client.query(
        `INSERT INTO ticket_admission_logs (
           id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId",
           "scannerName", action, status, reason, "deviceMode", "createdAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'success', NULL, 'offline', $9)`,
        [
          scan.id,
          ticket.id,
          ticket.ticketCode,
          ticket.eventId,
          ticket.sessionId,
          scan.scannerId,
          scan.scannerName,
          scan.action,
          new Date(scan.scannedAt),
        ],
      );

      await client.query('COMMIT');
      syncedCount++;
      acknowledgedIds.push(scan.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    success: true,
    acknowledgedIds,
    conflictsCount,
    syncedCount,
    lastSuccessfulSync: new Date().toISOString(),
  };
}

export async function listAdmissionSyncConflicts(
  pool: Pool,
  eventId?: string,
): Promise<AdmissionSyncConflictItem[]> {
  await ensureAdmissionSchema(pool);
  const params: unknown[] = [];
  let sql = `
    SELECT c.id, c."eventId", e.title AS "eventTitle", c."sessionId",
           s."startTime" AS "sessionStartTime", s."endTime" AS "sessionEndTime",
           c."ticketId", c."ticketCode", c."scannerId", c."scannerName",
           c."offlineScanId", c.action, c."scannedAt", c."conflictType",
           c."conflictDetails", c.status, c."resolvedBy", c."resolvedAt",
           c."resolutionNotes", c."createdAt"
    FROM admission_sync_conflicts c
    JOIN events e ON e.id = c."eventId"
    JOIN event_sessions s ON s.id = c."sessionId"
  `;
  if (eventId) {
    sql += ` WHERE c."eventId" = $1`;
    params.push(eventId);
  }
  sql += ` ORDER BY c."createdAt" DESC`;

  const res = await pool.query<{
    id: string;
    eventId: string;
    eventTitle: string;
    sessionId: string;
    sessionStartTime: Date;
    sessionEndTime: Date;
    ticketId: string;
    ticketCode: string;
    scannerId: string;
    scannerName: string;
    offlineScanId: string;
    action: 'entry' | 'exit';
    scannedAt: Date;
    conflictType: string;
    conflictDetails: string;
    status: 'pending_review' | 'resolved';
    resolvedBy: string | null;
    resolvedAt: Date | null;
    resolutionNotes: string | null;
    createdAt: Date;
  }>(sql, params);

  return res.rows.map(r => ({
    ...r,
    scannedAt: r.scannedAt.toISOString(),
    sessionStartTime: r.sessionStartTime.toISOString(),
    sessionEndTime: r.sessionEndTime.toISOString(),
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));
}

export async function resolveAdmissionSyncConflict(
  pool: Pool,
  conflictId: string,
  actor: { id: string; role: string; name: string },
  resolutionNotes?: string,
): Promise<boolean> {
  if (actor.role !== 'owner') {
    throw new Error('ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้นที่สามารถตรวจสอบและปิดข้อขัดแย้งได้');
  }
  await ensureAdmissionSchema(pool);
  const res = await pool.query(
    `UPDATE admission_sync_conflicts
     SET status = 'resolved', "resolvedBy" = $1, "resolvedAt" = now(), "resolutionNotes" = $2
     WHERE id = $3`,
    [actor.name, resolutionNotes || 'เจ้าของเว็บตรวจสอบและรับทราบข้อขัดแย้งแล้ว', conflictId],
  );
  return (res.rowCount ?? 0) > 0;
}



/**
 * Get admission history for a specific ticket (used for refund validation in TASK-021).
 */
export async function getTicketAdmissionHistory(
  pool: Pool,
  ticketId: string,
): Promise<AdmissionLogItem[]> {
  await ensureAdmissionSchema(pool);

  const res = await pool.query<{
    id: string;
    ticketId: string;
    ticketCode: string;
    scannerName: string;
    action: 'entry' | 'exit';
    status: 'success' | 'rejected';
    reason: string | null;
    deviceMode: string;
    createdAt: Date;
  }>(
    `SELECT id, "ticketId", "ticketCode", "scannerName", action, status, reason, "deviceMode", "createdAt"
     FROM ticket_admission_logs
     WHERE "ticketId" = $1
     ORDER BY "createdAt" ASC`,
    [ticketId],
  );

  return res.rows.map(r => ({
    id: r.id,
    ticketId: r.ticketId,
    ticketCode: r.ticketCode,
    scannerName: r.scannerName,
    action: r.action,
    status: r.status,
    reason: r.reason,
    deviceMode: r.deviceMode,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}



