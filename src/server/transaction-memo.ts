import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { inTransaction } from './database.ts';
import { ensureReservationSchema } from './reservation.ts';

export type TransactionVerificationStatus = 'verified' | 'pending' | 'discrepancy';

export interface OrderTransactionMemo {
  id: string;
  orderId: string;
  transferRef: string;
  verificationStatus: TransactionVerificationStatus;
  adminNotes: string;
  recordedByUserId: string;
  recordedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemDetail {
  id: string;
  orderId: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

const memoSchemaReady = new WeakMap<Pool, Promise<void>>();

export async function ensureTransactionMemoSchema(pool: Pool): Promise<void> {
  let promise = memoSchemaReady.get(pool);
  if (!promise) {
    promise = (async () => {
      await ensureReservationSchema(pool);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS order_transaction_memos (
          id TEXT PRIMARY KEY,
          "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          "transferRef" TEXT NOT NULL,
          "verificationStatus" TEXT NOT NULL DEFAULT 'verified',
          "adminNotes" TEXT NOT NULL DEFAULT '',
          "recordedByUserId" TEXT NOT NULL,
          "recordedByName" TEXT NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_order_transaction_memos_orderId ON order_transaction_memos("orderId");
      `);
    })().catch((err) => {
      memoSchemaReady.delete(pool);
      throw err;
    });
    memoSchemaReady.set(pool, promise);
  }
  await promise;
}

/**
 * Saves a transaction verification memo for an order.
 * Enforces role restriction: ONLY Owner can record memos (D-276).
 */
export async function saveOrderTransactionMemo(
  pool: Pool,
  input: {
    orderId: string;
    transferRef: string;
    verificationStatus: TransactionVerificationStatus;
    adminNotes?: string;
    actor: { id: string; role: string; name: string };
    now?: Date;
  },
): Promise<{
  success: boolean;
  memo?: OrderTransactionMemo;
  error?: string;
  code?: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT';
}> {
  if (input.actor.role !== 'owner') {
    return {
      success: false,
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์บันทึกข้อมูลธุรกรรมคำสั่งซื้อ',
      code: 'FORBIDDEN',
    };
  }

  const cleanTransferRef = input.transferRef?.trim();
  if (!cleanTransferRef) {
    return {
      success: false,
      error: 'กรุณาระบุเลขอ้างอิงการโอนหรือรหัสสลิป',
      code: 'INVALID_INPUT',
    };
  }

  const validStatuses: TransactionVerificationStatus[] = ['verified', 'pending', 'discrepancy'];
  const status = validStatuses.includes(input.verificationStatus) ? input.verificationStatus : 'verified';
  const notes = (input.adminNotes || '').trim();

  await ensureTransactionMemoSchema(pool);

  return inTransaction(pool, async (client) => {
    // 1. Verify order exists
    const orderCheck = await client.query(
      `SELECT id, status FROM orders WHERE id = $1`,
      [input.orderId],
    );
    if (orderCheck.rowCount === 0) {
      return {
        success: false,
        error: 'ไม่พบคำสั่งซื้อที่ระบุในระบบ',
        code: 'NOT_FOUND',
      };
    }

    // 2. Insert new memo record
    const memoId = `MEMO-${randomUUID().slice(0, 12).toUpperCase()}`;
    const timestamp = input.now || new Date();

    const insertRes = await client.query(
      `
      INSERT INTO order_transaction_memos (
        id, "orderId", "transferRef", "verificationStatus", "adminNotes",
        "recordedByUserId", "recordedByName", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      RETURNING id, "orderId", "transferRef", "verificationStatus", "adminNotes",
                "recordedByUserId", "recordedByName", "createdAt", "updatedAt"
      `,
      [
        memoId,
        input.orderId,
        cleanTransferRef,
        status,
        notes,
        input.actor.id,
        input.actor.name,
        timestamp,
      ],
    );

    const r = insertRes.rows[0];
    const memo: OrderTransactionMemo = {
      id: r.id,
      orderId: r.orderId,
      transferRef: r.transferRef,
      verificationStatus: r.verificationStatus,
      adminNotes: r.adminNotes,
      recordedByUserId: r.recordedByUserId,
      recordedByName: r.recordedByName,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    };

    return {
      success: true,
      memo,
    };
  });
}

/**
 * Retrieves all transaction memos for a given order, newest first.
 */
export async function getOrderTransactionMemos(
  pool: Pool,
  orderId: string,
): Promise<OrderTransactionMemo[]> {
  await ensureTransactionMemoSchema(pool);
  const res = await pool.query(
    `
    SELECT id, "orderId", "transferRef", "verificationStatus", "adminNotes",
           "recordedByUserId", "recordedByName", "createdAt", "updatedAt"
    FROM order_transaction_memos
    WHERE "orderId" = $1
    ORDER BY "createdAt" DESC
    `,
    [orderId],
  );

  return res.rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    transferRef: r.transferRef,
    verificationStatus: r.verificationStatus,
    adminNotes: r.adminNotes,
    recordedByUserId: r.recordedByUserId,
    recordedByName: r.recordedByName,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  }));
}

/**
 * Retrieves order items with ticket type names for the automated summary in Drawer.
 */
export async function getOrderItemsForOrder(
  pool: Pool,
  orderId: string,
): Promise<OrderItemDetail[]> {
  await ensureTransactionMemoSchema(pool);
  const res = await pool.query(
    `
    SELECT oi.id, oi."orderId", oi."ticketTypeId", oi.quantity, oi."unitPrice", oi.subtotal,
           tt.name as "ticketTypeName"
    FROM order_items oi
    JOIN ticket_types tt ON oi."ticketTypeId" = tt.id
    WHERE oi."orderId" = $1
    ORDER BY oi.id ASC
    `,
    [orderId],
  );

  return res.rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    ticketTypeId: r.ticketTypeId,
    ticketTypeName: r.ticketTypeName,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unitPrice),
    subtotal: Number(r.subtotal),
  }));
}
