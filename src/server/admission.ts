import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ensureTicketSchema } from './tickets.ts';
import { hashOfflineQrPayload, sha256Hex } from '../lib/offline-qr-hash.ts';
import { isTicketSuffixShortcut, parseOrderAndSuffixPattern } from '../lib/ticket-code-input.ts';
import { verifyOfflineAssignmentToken } from './offline-assignment-token.ts';

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
    qrHash?: string;
    assignmentEpoch?: number;
    assignmentToken?: string;
  }>;
}

export interface SyncOfflineAdmissionResult {
  success: boolean;
  acknowledgedIds: string[];
  conflictsCount: number;
  syncedCount: number;
  securityRejectionsCount: number;
  lastSuccessfulSync: string;
  authorizationLost?: boolean;
  message?: string;
}

export interface AdmissionSecurityRejectionItem {
  id: string;
  eventId: string;
  eventTitle: string;
  scannerId: string;
  scannerName: string;
  offlineScanId: string;
  action: 'entry' | 'exit';
  scannedAt: string;
  reason: string;
  details: string;
  status: 'pending_review' | 'resolved';
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
}

const admissionSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureAdmissionSchema(pool: Pool): Promise<void> {
  const existing = admissionSchemaPromises.get(pool);
  if (existing) {
    return existing;
  }
  const promise = (async () => {
    try {
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

        CREATE TABLE IF NOT EXISTS admission_security_rejections (
          id TEXT PRIMARY KEY,
          "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          "scannerId" TEXT NOT NULL,
          "scannerName" TEXT NOT NULL,
          "offlineScanId" TEXT NOT NULL,
          action TEXT NOT NULL,
          "scannedAt" TIMESTAMPTZ NOT NULL,
          reason TEXT NOT NULL,
          "ticketReferenceHash" TEXT NOT NULL,
          details TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending_review',
          "resolvedBy" TEXT,
          "resolvedAt" TIMESTAMPTZ,
          "resolutionNotes" TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE ("eventId", "offlineScanId")
        );
        ALTER TABLE admission_security_rejections ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT;
        ALTER TABLE admission_security_rejections ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMPTZ;
        ALTER TABLE admission_security_rejections ADD COLUMN IF NOT EXISTS "resolutionNotes" TEXT;
        CREATE INDEX IF NOT EXISTS idx_admission_security_rejections_event ON admission_security_rejections("eventId");
        CREATE INDEX IF NOT EXISTS idx_admission_security_rejections_status ON admission_security_rejections(status);
      `);
    } catch (err) {
      admissionSchemaPromises.delete(pool);
      throw err;
    }
  })();
  admissionSchemaPromises.set(pool, promise);
  return promise;
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
        message: 'คุณไม่มีสิทธิ์สแกนบัตรในคอนเสิร์ตนี้',
      };
    }
  } else if (input.scannerRole === 'organizer') {
    if (session.organizerId !== input.scannerId) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'UNAUTHORIZED_EVENT',
        message: 'ผู้จัดงานสามารถสแกนได้เฉพาะคอนเสิร์ตของตนเองเท่านั้น',
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
      message: 'ยังไม่ถึงช่วงเวลาเปิดรับเข้างาน',
    };
  }

  if (currentTime > windowEnd) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'OUTSIDE_ADMISSION_WINDOW',
      message: 'พ้นช่วงเวลาเปิดรับเข้างานแล้ว',
    };
  }

  // 5. Concurrency control via SELECT ... FOR UPDATE (AC-101)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cleanInput = input.qrPayloadOrCode.trim();
    let tRes = await client.query<{
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
       WHERE (t."qrPayload" = $1 OR t."ticketCode" = $1 OR t."ticketCode" = UPPER($1))
       FOR UPDATE OF t`,
      [cleanInput],
    );

    const orderSuffix = tRes.rowCount === 0 ? parseOrderAndSuffixPattern(cleanInput) : null;
    if (tRes.rowCount === 0 && orderSuffix) {
      const orderSuffixRes = await client.query<typeof tRes.rows[number]>(
        `SELECT t.id, t."orderId", t."eventId", t."sessionId", t."ticketTypeId",
                t."ticketCode", t."qrPayload", t.status, t."admissionStatus",
                tt.name as "ticketTypeName", tt.price as "ticketPrice",
                e.title as "eventTitle", s."startTime" as "sessionStartTime", s."endTime" as "sessionEndTime"
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t."ticketTypeId"
         JOIN event_sessions s ON s.id = t."sessionId"
         JOIN events e ON e.id = t."eventId"
         WHERE t."sessionId" = $1
           AND UPPER(t."ticketCode") LIKE $2
         FOR UPDATE OF t`,
        [input.sessionId, `TK-${orderSuffix.orderPart}-%-${orderSuffix.suffixPart}`],
      );
      if ((orderSuffixRes.rowCount ?? 0) > 1) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 'rejected',
          action: input.action,
          reason: 'AMBIGUOUS_TICKET_ORDER_SUFFIX',
          message: 'ยังพบบัตรซ้ำในคำสั่งซื้อเดียวกัน กรุณากรอกเลขลำดับใบ (NN) เพิ่มเติม',
        };
      }
      tRes = orderSuffixRes;
    }

    if (tRes.rowCount === 0 && isTicketSuffixShortcut(cleanInput)) {
      const suffixRes = await client.query<typeof tRes.rows[number]>(
        `SELECT t.id, t."orderId", t."eventId", t."sessionId", t."ticketTypeId",
                t."ticketCode", t."qrPayload", t.status, t."admissionStatus",
                tt.name as "ticketTypeName", tt.price as "ticketPrice",
                e.title as "eventTitle", s."startTime" as "sessionStartTime", s."endTime" as "sessionEndTime"
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t."ticketTypeId"
         JOIN event_sessions s ON s.id = t."sessionId"
         JOIN events e ON e.id = t."eventId"
         WHERE t."sessionId" = $1
           AND UPPER(t."ticketCode") LIKE '%-' || UPPER($2)
         FOR UPDATE OF t`,
        [input.sessionId, cleanInput],
      );
      if ((suffixRes.rowCount ?? 0) > 1) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 'rejected',
          action: input.action,
          reason: 'AMBIGUOUS_TICKET_SUFFIX',
          message: 'พบรหัสท้ายซ้ำกันมากกว่า 1 ใบในรอบนี้ กรุณากรอกรหัสบัตรเต็ม (TK-...)',
        };
      }
      tRes = suffixRes;
    }

    if (tRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'TICKET_NOT_FOUND',
        message: 'ไม่พบบัตรในระบบ กรุณาตรวจสอบ QR Code หรือรหัสบัตร',
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
        message: 'บัตรใบนี้เป็นของคอนเสิร์ตอื่น ไม่ตรงกับงานที่กำลังสแกน',
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
        message: 'บัตรใบนี้เป็นของรอบการแสดงอื่น ไม่ตรงกับรอบที่กำลังสแกน',
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
        message: 'บัตรถูกยกเลิกแล้ว ไม่อนุญาตให้เข้างาน',
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
        message: 'บัตรถูกคืนเงินแล้ว ไม่อนุญาตให้เข้างาน',
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
        message: 'สถานะบัตรไม่ถูกต้อง ไม่อนุญาตให้เข้างาน',
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
          message: 'บัตรอยู่ในพื้นที่จัดงานแล้ว ไม่อนุญาตให้เข้าซ้ำ',
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
        message: 'บันทึกออกนอกงานสำเร็จ (สามารถกลับเข้างานใหม่ได้)',
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
  if (!Array.isArray(input.scans)) {
    throw new Error('ข้อมูลรายการสแกนไม่ถูกต้อง');
  }
  if (input.scans.length > 500) {
    throw new Error('รายการสแกนต่อ batch ต้องไม่เกิน 500 รายการ');
  }
  if (actor.role !== 'scanner') {
    throw new Error('ไม่อนุญาต: เฉพาะเครื่องหลักประจำงานเท่านั้นที่สามารถซิงก์ข้อมูลออฟไลน์ได้');
  }

  await ensureAdmissionSchema(pool);

  // Authorize event scope: only assigned primary scanner for this event may sync
  const scRes = await pool.query(
    `SELECT 1 FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2`,
    [eventId, actor.id],
  );
  if (scRes.rowCount === 0) {
    throw new Error('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการข้อมูลของคอนเสิร์ตนี้');
  }

  const priRes = await pool.query<{ scannerId: string; assignmentEpoch: number | string }>(
    `SELECT "scannerId", "assignmentEpoch" FROM event_primary_scanners WHERE "eventId" = $1`,
    [eventId],
  );
  if ((priRes.rowCount ?? 0) === 0 || priRes.rows[0].scannerId !== actor.id) {
    throw new Error('ไม่อนุญาต: เฉพาะเครื่องหลักประจำงานเท่านั้นที่สามารถซิงก์ข้อมูลออฟไลน์ได้');
  }

  const ctrlRes = await pool.query<{ offlineStatus: string }>(
    `SELECT "offlineStatus" FROM event_offline_controls WHERE "eventId" = $1`,
    [eventId],
  );
  if (ctrlRes.rows[0]?.offlineStatus === 'halted_reconciliation_required') {
    throw new Error('ไม่อนุญาต: การใช้งานออฟไลน์ถูกระงับเพื่อกระทบยอด ไม่สามารถซิงก์อัตโนมัติได้');
  }

  const effectiveScannerId = actor.id;
  const effectiveScannerName = actor.name?.trim() || actor.id;

  const acknowledgedIds: string[] = [];
  let conflictsCount = 0;
  let syncedCount = 0;
  let securityRejectionsCount = 0;

  const recordSecurityRejection = async (
    client: import('pg').PoolClient,
    scan: SyncOfflineAdmissionInput['scans'][number],
    scannedDate: Date,
    reason: string,
    details: string,
  ) => {
    await client.query(
      `INSERT INTO admission_security_rejections (
         id, "eventId", "scannerId", "scannerName", "offlineScanId", action,
         "scannedAt", reason, "ticketReferenceHash", details, status, "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_review', now())
       ON CONFLICT ("eventId", "offlineScanId") DO NOTHING`,
      [
        `security-${randomUUID()}`,
        eventId,
        effectiveScannerId,
        effectiveScannerName,
        scan.id,
        scan.action,
        scannedDate,
        reason,
        sha256Hex(`${scan.ticketId || ''}:${scan.ticketCode || ''}:${scan.qrHash || ''}`),
        details,
      ],
    );
  };

  // Process scans in chronological order so multi-step offline sequences (entry -> exit -> entry) validate properly
  const orderedScans = (Array.isArray(input.scans) ? input.scans : [])
    .map((scan, index) => ({
      scan,
      index,
      ts: typeof scan?.scannedAt === 'string' ? Date.parse(scan.scannedAt) : Number.NaN,
    }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.ts);
      const bValid = Number.isFinite(b.ts);
      if (aValid && bValid && a.ts !== b.ts) {
        return a.ts - b.ts;
      }
      return a.index - b.index;
    })
    .map(item => item.scan);

  for (const scan of orderedScans) {
    if (!scan || typeof scan.id !== 'string' || !scan.id.trim()) {
      continue;
    }

    // 1. Idempotency check (AC-102): If this offline scan ID was already stored, acknowledge immediately
    const existRes = await pool.query(
      `SELECT id FROM ticket_admission_logs WHERE id = $1
       UNION ALL
       SELECT "offlineScanId" AS id FROM admission_security_rejections
       WHERE "eventId" = $2 AND "offlineScanId" = $1
       LIMIT 1`,
      [scan.id, eventId],
    );
    if ((existRes.rowCount ?? 0) > 0) {
      acknowledgedIds.push(scan.id);
      continue;
    }

    // Reject non-success scans, unknown actions, or invalid timestamps before mutating central state
    if (scan.status !== 'success') {
      continue;
    }
    if (scan.action !== 'entry' && scan.action !== 'exit') {
      continue;
    }
    const scannedDate = new Date(scan.scannedAt);
    if (Number.isNaN(scannedDate.getTime())) {
      continue;
    }

    // 2. Fetch ticket & session window with SELECT ... FOR UPDATE strictly scoped to eventId
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Serialize each scan with assignment changes, then recheck the signed
      // dataset epoch before touching a ticket.
      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
      const assignmentRes = await client.query<{
        scannerId: string;
        assignmentEpoch: number | string;
      }>(
        `SELECT p."scannerId", p."assignmentEpoch"
         FROM event_primary_scanners p
         JOIN event_scanners es ON es."eventId" = p."eventId" AND es."scannerId" = p."scannerId"
         WHERE p."eventId" = $1
         FOR UPDATE OF p
         FOR KEY SHARE OF es`,
        [eventId],
      );
      const currentAssignment = assignmentRes.rows[0];
      if (!currentAssignment || currentAssignment.scannerId !== effectiveScannerId ||
          Number(currentAssignment.assignmentEpoch) !== Number(scan.assignmentEpoch)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          acknowledgedIds,
          conflictsCount,
          syncedCount,
          securityRejectionsCount,
          authorizationLost: true,
          message: 'เครื่องหลักหรือเวอร์ชันการมอบหมายเปลี่ยนระหว่างซิงก์ ระบบหยุดรายการที่เหลือแล้ว',
          lastSuccessfulSync: new Date().toISOString(),
        };
      }

      const controlRes = await client.query<{ offlineStatus: string }>(
        'SELECT "offlineStatus" FROM event_offline_controls WHERE "eventId" = $1 FOR UPDATE',
        [eventId],
      );
      if (controlRes.rows[0]?.offlineStatus === 'halted_reconciliation_required') {
        await client.query('ROLLBACK');
        return {
          success: false,
          acknowledgedIds,
          conflictsCount,
          syncedCount,
          securityRejectionsCount,
          authorizationLost: true,
          message: 'การใช้งานออฟไลน์ถูกระงับระหว่างซิงก์ ระบบหยุดรายการที่เหลือแล้ว',
          lastSuccessfulSync: new Date().toISOString(),
        };
      }

      const scannedEpoch = Number(scan.assignmentEpoch);
      if (!verifyOfflineAssignmentToken(scan.assignmentToken || '', {
        eventId,
        scannerId: effectiveScannerId,
        assignmentEpoch: scannedEpoch,
      })) {
        await recordSecurityRejection(client, scan, scannedDate, 'INVALID_ASSIGNMENT_PROOF', 'Offline scan does not carry a valid signed primary assignment.');
        await client.query('COMMIT');
        securityRejectionsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

      if (scan.eventId !== eventId || scan.scannerId !== effectiveScannerId) {
        await recordSecurityRejection(client, scan, scannedDate, 'OFFLINE_SCAN_SCOPE_MISMATCH', 'Submitted event or scanner identity does not match the authenticated sync scope.');
        await client.query('COMMIT');
        securityRejectionsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

      if (typeof scan.qrHash !== 'string' || !/^[a-f0-9]{64}$/.test(scan.qrHash)) {
        await recordSecurityRejection(client, scan, scannedDate, 'MISSING_QR_EVIDENCE', 'Offline scan is missing a valid event-scoped QR payload digest.');
        await client.query('COMMIT');
        securityRejectionsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

      const tRes = await client.query<{
        id: string;
        ticketCode: string;
        sessionId: string;
        eventId: string;
        sessionEventId: string;
        qrPayload: string;
        status: string;
        admissionStatus: string;
        sessionStatus?: string;
        sessionStartTime?: Date | string;
        sessionEndTime?: Date | string;
        admissionStartTime?: Date | string | null;
        admissionEndTime?: Date | string | null;
      }>(
        `SELECT t.id, t."ticketCode", t."qrPayload", t."sessionId", t."eventId", s."eventId" AS "sessionEventId",
                t.status, t."admissionStatus",
                s.status AS "sessionStatus",
                s."startTime" AS "sessionStartTime",
                s."endTime" AS "sessionEndTime",
                s."admissionStartTime",
                s."admissionEndTime"
         FROM tickets t
         JOIN event_sessions s ON s.id = t."sessionId"
         WHERE (t.id = $1 OR t."ticketCode" = $2) AND t."eventId" = $3
         FOR UPDATE OF t`,
        [scan.ticketId, scan.ticketCode, eventId],
      );

      if ((tRes.rowCount ?? 0) === 0) {
        const globalTicketRes = await client.query<{
          id: string;
          eventId: string;
          ticketCode: string;
        }>(
          `SELECT id, "eventId", "ticketCode" FROM tickets
           WHERE id = $1 OR "ticketCode" = $2
           ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
           LIMIT 1`,
          [scan.ticketId, scan.ticketCode],
        );
        const crossEvent = globalTicketRes.rows[0]?.eventId !== undefined && globalTicketRes.rows[0].eventId !== eventId;
        await recordSecurityRejection(
          client,
          scan,
          scannedDate,
          crossEvent ? 'CROSS_EVENT_TICKET' : 'UNMATCHED_QR_EVIDENCE',
          crossEvent
            ? 'The scanned ticket belongs to another event; its session and ticket state were not attached to this event.'
            : 'No ticket in this event matches the submitted ticket reference and QR digest.',
        );
        await client.query('COMMIT');
        securityRejectionsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

      const ticket = tRes.rows[0];

      if (hashOfflineQrPayload(eventId, ticket.qrPayload) !== scan.qrHash) {
        await recordSecurityRejection(client, scan, scannedDate, 'INVALID_QR_EVIDENCE', 'Submitted digest does not prove possession of this ticket QR payload.');
        await client.query('COMMIT');
        securityRejectionsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

      // Do not allow a ticket's session to be logged under another event.
      if (ticket.eventId !== eventId || ticket.sessionEventId !== eventId || ticket.sessionId !== scan.sessionId) {
        await recordSecurityRejection(client, scan, scannedDate, 'CROSS_EVENT_SESSION', 'Ticket and submitted session do not belong to the same event scope.');
        await client.query('COMMIT');
        securityRejectionsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

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
            eventId,
            ticket.sessionId,
            ticket.id,
            ticket.ticketCode,
            effectiveScannerId,
            effectiveScannerName,
            scan.id,
            scan.action,
            scannedDate,
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
            eventId,
            ticket.sessionId,
            effectiveScannerId,
            effectiveScannerName,
            scan.action,
            scannedDate,
          ],
        );

        await client.query('COMMIT');
        conflictsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

      if (ticket.status !== 'valid') {
        await client.query('ROLLBACK');
        continue;
      }

      // 4. Validate session approval & admission window (AC-100)
      if (ticket.sessionStatus !== 'approved') {
        await recordSecurityRejection(client, scan, scannedDate, 'SESSION_NOT_APPROVED', 'Offline scan refers to a session that was not approved at sync time.');
        await client.query('COMMIT');
        securityRejectionsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

      const rawWindowStart = ticket.admissionStartTime || ticket.sessionStartTime;
      const rawWindowEnd = ticket.admissionEndTime || ticket.sessionEndTime;
      if (!rawWindowStart || !rawWindowEnd) {
        await recordSecurityRejection(client, scan, scannedDate, 'SESSION_WINDOW_MISSING', 'The scheduled session admission window is incomplete.');
        await client.query('COMMIT');
        securityRejectionsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }
      const windowStart = new Date(rawWindowStart);
      const windowEnd = new Date(rawWindowEnd);
      if (
        Number.isNaN(windowStart.getTime()) ||
        Number.isNaN(windowEnd.getTime()) ||
        scannedDate < windowStart ||
        scannedDate > windowEnd
      ) {
        await recordSecurityRejection(client, scan, scannedDate, 'OUTSIDE_SESSION_WINDOW', 'Offline scan timestamp falls outside the scheduled admission window.');
        await client.query('COMMIT');
        securityRejectionsCount++;
        acknowledgedIds.push(scan.id);
        continue;
      }

      // 5. Enforce strict admission state transition (outside <-> inside)
      if (scan.action === 'entry' && ticket.admissionStatus !== 'outside') {
        await client.query('ROLLBACK');
        continue;
      }
      if (scan.action === 'exit' && ticket.admissionStatus !== 'inside') {
        await client.query('ROLLBACK');
        continue;
      }

      // 6. Normal valid state transition sync
      const targetAdmissionStatus = scan.action === 'entry' ? 'inside' : 'outside';
      await client.query(
        `UPDATE tickets SET "admissionStatus" = $1, "updatedAt" = now() WHERE id = $2 AND "eventId" = $3`,
        [targetAdmissionStatus, ticket.id, eventId],
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
          eventId,
          ticket.sessionId,
          effectiveScannerId,
          effectiveScannerName,
          scan.action,
          scannedDate,
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
    securityRejectionsCount,
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

export async function listAdmissionSecurityRejections(
  pool: Pool,
  eventId?: string,
): Promise<AdmissionSecurityRejectionItem[]> {
  await ensureAdmissionSchema(pool);
  const params: unknown[] = [];
  let sql = `
    SELECT r.id, r."eventId", e.title AS "eventTitle", r."scannerId", r."scannerName",
           r."offlineScanId", r.action, r."scannedAt", r.reason, r.details, r.status,
           r."resolvedBy", r."resolvedAt", r."resolutionNotes", r."createdAt"
    FROM admission_security_rejections r
    JOIN events e ON e.id = r."eventId"
  `;
  if (eventId) {
    sql += ' WHERE r."eventId" = $1';
    params.push(eventId);
  }
  sql += ' ORDER BY r."createdAt" DESC';
  const result = await pool.query<{
    id: string;
    eventId: string;
    eventTitle: string;
    scannerId: string;
    scannerName: string;
    offlineScanId: string;
    action: 'entry' | 'exit';
    scannedAt: Date;
    reason: string;
    details: string;
    status: 'pending_review' | 'resolved';
    resolvedBy: string | null;
    resolvedAt: Date | null;
    resolutionNotes: string | null;
    createdAt: Date;
  }>(sql, params);
  return result.rows.map(row => ({
    ...row,
    scannedAt: row.scannedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
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
  if ((res.rowCount ?? 0) > 0) return true;
  const rejectionRes = await pool.query(
    `UPDATE admission_security_rejections
     SET status = 'resolved', "resolvedBy" = $1, "resolvedAt" = now(), "resolutionNotes" = $2
     WHERE id = $3`,
    [actor.name, resolutionNotes || 'เจ้าของเว็บตรวจสอบและรับทราบรายการสแกนผิดปกติแล้ว', conflictId],
  );
  return (rejectionRes.rowCount ?? 0) > 0;
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



