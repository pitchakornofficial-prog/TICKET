import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from './database.ts';
import { ensureReservationSchema } from './reservation.ts';
import { cleanPhoneNumber } from './guest-order-lookup.ts';

export interface OrderContactAuditRecord {
  id: string;
  orderId: string;
  correctedByUserId: string;
  correctedByName: string;
  previousEmail: string;
  previousPhone: string;
  newEmail: string;
  newPhone: string;
  reason: string;
  createdAt: string;
}

export interface PaidOrderForCorrection {
  id: string;
  eventId: string;
  eventTitle: string;
  sessionId: string;
  sessionStartTime: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  status: string;
  subtotal: number;
  customerFee: number;
  total: number;
  ticketCount: number;
  createdAt: string;
  updatedAt: string;
  auditLogs?: OrderContactAuditRecord[];
}

export async function ensureContactAuditSchema(pool: Pool): Promise<void> {
  await ensureReservationSchema(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_contact_audit_logs (
      id TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      "correctedByUserId" TEXT NOT NULL,
      "correctedByName" TEXT NOT NULL,
      "previousEmail" TEXT NOT NULL,
      "previousPhone" TEXT NOT NULL,
      "newEmail" TEXT NOT NULL,
      "newPhone" TEXT NOT NULL,
      reason TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_contact_audit_order ON order_contact_audit_logs("orderId");
  `);
}

/**
 * Lists paid orders for owner to review and correct contact information.
 */
export async function listPaidOrdersForOwner(
  pool: Pool,
  search?: string,
): Promise<PaidOrderForCorrection[]> {
  await ensureContactAuditSchema(pool);

  let query = `
    SELECT o.id, o."eventId", o."sessionId", o."buyerName", o."buyerEmail", o."buyerPhone",
           o.status, o.subtotal, o."customerFee", o.total, o."createdAt", o."updatedAt",
           e.title as "eventTitle",
           es."startTime" as "sessionStartTime",
           COUNT(t.id)::int as "ticketCount"
    FROM orders o
    JOIN events e ON o."eventId" = e.id
    JOIN event_sessions es ON o."sessionId" = es.id
    LEFT JOIN tickets t ON o.id = t."orderId"
    WHERE o.status = 'paid'
  `;

  const params: unknown[] = [];
  if (search?.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    params.push(term);
    query += `
      AND (
        LOWER(o.id) LIKE $1 OR
        LOWER(o."buyerEmail") LIKE $1 OR
        REPLACE(REPLACE(o."buyerPhone", '-', ''), ' ', '') LIKE $1 OR
        LOWER(o."buyerName") LIKE $1 OR
        LOWER(e.title) LIKE $1
      )
    `;
  }

  query += `
    GROUP BY o.id, e.title, es."startTime"
    ORDER BY o."createdAt" DESC
    LIMIT 50
  `;

  const res = await pool.query(query, params);
  return res.rows.map(r => ({
    id: r.id,
    eventId: r.eventId,
    eventTitle: r.eventTitle,
    sessionId: r.sessionId,
    sessionStartTime: new Date(r.sessionStartTime).toISOString(),
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhone: r.buyerPhone,
    status: r.status,
    subtotal: Number(r.subtotal),
    customerFee: Number(r.customerFee),
    total: Number(r.total),
    ticketCount: Number(r.ticketCount) || 0,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  }));
}

/**
 * Corrects buyer contact information (email and/or phone) on a paid order (AC-76, G-24).
 * Enforces role restriction: ONLY Owner can execute this action.
 * Records full audit log of previous vs new values and owner verification reason.
 */
export async function correctOrderContact(
  pool: Pool,
  input: {
    orderId: string;
    newEmail: string;
    newPhone: string;
    reason: string;
    actor: { id: string; role: string; name: string };
    now?: Date;
  },
): Promise<{
  success: boolean;
  orderId?: string;
  previousEmail?: string;
  previousPhone?: string;
  newEmail?: string;
  newPhone?: string;
  auditLogId?: string;
  error?: string;
  code?: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_STATUS' | 'INVALID_INPUT';
}> {
  // AC-76 Role check: ONLY owner is authorized
  if (input.actor.role !== 'owner') {
    return {
      success: false,
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์แก้ไขข้อมูลติดต่อของคำสั่งซื้อที่ชำระแล้ว (AC-76)',
      code: 'FORBIDDEN',
    };
  }

  const cleanEmail = input.newEmail?.trim().toLowerCase();
  const cleanPhone = cleanPhoneNumber(input.newPhone?.trim() || '');
  const reason = input.reason?.trim();

  // Validate email format
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return {
      success: false,
      error: 'รูปแบบอีเมลใหม่ไม่ถูกต้อง',
      code: 'INVALID_INPUT',
    };
  }

  // Validate phone format
  if (!cleanPhone || cleanPhone.length < 9 || cleanPhone.length > 15 || !/^\+?\d+$/.test(cleanPhone)) {
    return {
      success: false,
      error: 'รูปแบบเบอร์โทรศัพท์ใหม่ไม่ถูกต้อง',
      code: 'INVALID_INPUT',
    };
  }

  // Require verification reason
  if (!reason) {
    return {
      success: false,
      error: 'กรุณาระบุเหตุผลหรือบันทึกผลการตรวจสอบตัวตนผู้ซื้อ (G-24)',
      code: 'INVALID_INPUT',
    };
  }

  await ensureContactAuditSchema(pool);
  const now = input.now || new Date();

  return inTransaction(pool, async (client: PoolClient) => {
    // Lock order row for update
    const orderRes = await client.query(
      `SELECT id, "buyerName", "buyerEmail", "buyerPhone", status
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [input.orderId],
    );

    if (orderRes.rowCount === 0) {
      return {
        success: false,
        error: 'ไม่พบรายการคำสั่งซื้อที่ระบุ',
        code: 'NOT_FOUND',
      };
    }

    const order = orderRes.rows[0];

    // AC-76: Only paid orders can have contact corrected
    if (order.status !== 'paid') {
      return {
        success: false,
        error: 'สามารถแก้ไขข้อมูลติดต่อได้เฉพาะคำสั่งซื้อที่ชำระเงินเรียบร้อยแล้วเท่านั้น (AC-76)',
        code: 'INVALID_STATUS',
      };
    }

    const previousEmail = order.buyerEmail;
    const previousPhone = order.buyerPhone;
    const auditLogId = `LOG-${randomUUID().slice(0, 8).toUpperCase()}`;

    // Record audit log
    await client.query(
      `INSERT INTO order_contact_audit_logs (
         id, "orderId", "correctedByUserId", "correctedByName",
         "previousEmail", "previousPhone", "newEmail", "newPhone",
         reason, "createdAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        auditLogId,
        order.id,
        input.actor.id,
        input.actor.name,
        previousEmail,
        previousPhone,
        cleanEmail,
        cleanPhone,
        reason,
        now,
      ],
    );

    // Update orders contact details
    await client.query(
      `UPDATE orders
       SET "buyerEmail" = $1, "buyerPhone" = $2, "updatedAt" = $3
       WHERE id = $4`,
      [cleanEmail, cleanPhone, now, order.id],
    );

    return {
      success: true,
      orderId: order.id,
      previousEmail,
      previousPhone,
      newEmail: cleanEmail,
      newPhone: cleanPhone,
      auditLogId,
    };
  });
}

/**
 * Retrieves audit log history for an order's contact corrections.
 */
export async function getOrderContactAuditLogs(
  pool: Pool,
  orderId: string,
  actor: { id: string; role: string },
): Promise<OrderContactAuditRecord[]> {
  if (actor.role !== 'owner') {
    throw new Error('เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์ดูประวัติการแก้ไขข้อมูลติดต่อ (AC-76)');
  }

  await ensureContactAuditSchema(pool);

  const res = await pool.query(
    `SELECT id, "orderId", "correctedByUserId", "correctedByName",
            "previousEmail", "previousPhone", "newEmail", "newPhone",
            reason, "createdAt"
     FROM order_contact_audit_logs
     WHERE "orderId" = $1
     ORDER BY "createdAt" DESC`,
    [orderId],
  );

  return res.rows.map(r => ({
    id: r.id,
    orderId: r.orderId,
    correctedByUserId: r.correctedByUserId,
    correctedByName: r.correctedByName,
    previousEmail: r.previousEmail,
    previousPhone: r.previousPhone,
    newEmail: r.newEmail,
    newPhone: r.newPhone,
    reason: r.reason,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}
