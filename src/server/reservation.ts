import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from './database.ts';
import { isRealPgPool } from './pg-pool-utils.ts';
import {
  calculateCustomerFee,
  roundHalfUp,
  type CustomerFeeMode,
  type OrganizerFeeMode,
  ensureFeeSchema,
} from './fees.ts';
import { getVerifiedGuestSession, type GuestVerifiedSession } from './guest-otp.ts';
import { ensureQueueSchema, QUEUE_CAPACITY, verifyQueueAccess } from './queue.ts';

export class QueueLockedError extends Error {
  constructor(message = 'ขณะนี้มีผู้ใช้งานเต็มจำนวน 200 คิวแล้ว กรุณารอตามลำดับคิวในห้องรอคิว') {
    super(message);
    this.name = 'QueueLockedError';
  }
}

// 15-minute reservation hold window (G-05, AC-13)
export const RESERVATION_HOLD_SECONDS = 15 * 60; // 900 seconds

export interface ReservationItemInput {
  ticketTypeId: string;
  quantity: number;
}

export interface CreateReservationInput {
  verifiedToken: string;
  eventId: string;
  sessionId: string;
  items: ReservationItemInput[];
}

export interface OrderItemDetail {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export function isUbuEmail(emailAddress: string): boolean {
  return /@(?:[a-zA-Z0-9-]+\.)*ubu\.ac\.th$/i.test((emailAddress || '').trim());
}

export interface OrderReservationDetail {
  id: string;
  eventId: string;
  sessionId: string;
  eventTitle?: string;
  eventLocation?: string;
  eventPosterUrl?: string;
  sessionStartTime?: string;
  sessionAdmissionStartTime?: string;
  buyerEmail: string;
  buyerName: string;
  buyerPhone: string;
  status: 'reserved' | 'paid' | 'expired' | 'cancelled' | 'payment_exception';
  items: OrderItemDetail[];
  subtotal: number;
  discountAmount: number;
  customerFeeMode: CustomerFeeMode;
  customerFeeRate: number;
  customerFee: number;
  total: number;
  reservedAt: string;
  expiresAt: string;
}

const reservationSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureReservationSchema(pool: Pool): Promise<void> {
  const existing = reservationSchemaPromises.get(pool);
  if (existing) {
    return existing;
  }
  const promise = (async () => {
    try {
      await ensureFeeSchema(pool);
      await inTransaction(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock($1)', [945162031]);
        await client.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      "buyerEmail" TEXT NOT NULL,
      "buyerName" TEXT NOT NULL,
      "buyerPhone" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      subtotal NUMERIC(12, 2) NOT NULL,
      "discountAmount" NUMERIC(12, 2) NOT NULL DEFAULT 0,
      "customerFee" NUMERIC(12, 2) NOT NULL,
      total NUMERIC(12, 2) NOT NULL,
      "customerFeeMode" TEXT NOT NULL,
      "customerFeeRate" NUMERIC(12, 2) NOT NULL,
      "reservedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS "discountAmount" NUMERIC(12, 2) NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS "ubuPrivilegeApplied" BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS "organizerFeeRate" NUMERIC(12, 2);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS "organizerFeePrivilegeRate" NUMERIC(12, 2);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS "organizerFeeMode" TEXT;
    CREATE INDEX IF NOT EXISTS idx_orders_event_session ON orders("eventId", "sessionId");
    CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders("buyerEmail");
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_event_lower_email ON orders("eventId", LOWER(TRIM("buyerEmail")));
    CREATE INDEX IF NOT EXISTS idx_orders_active_event ON orders("eventId", status, "expiresAt") WHERE status IN ('paid', 'reserved');
    CREATE INDEX IF NOT EXISTS idx_orders_id_active_include ON orders(id) INCLUDE (status, "expiresAt") WHERE status IN ('paid', 'reserved');
    CREATE INDEX IF NOT EXISTS idx_orders_reserved_expires ON orders("expiresAt", id) WHERE status = 'reserved';

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      "ticketTypeId" TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      "unitPrice" NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_orderId ON order_items("orderId");
    CREATE INDEX IF NOT EXISTS idx_order_items_ticketTypeId ON order_items("ticketTypeId");
    CREATE INDEX IF NOT EXISTS idx_order_items_tt_order_qty ON order_items("ticketTypeId", "orderId") INCLUDE (quantity);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_tt_qty ON order_items("orderId", "ticketTypeId") INCLUDE (quantity);

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      "orderItemId" TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      "ticketTypeId" TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
      "ticketCode" TEXT NOT NULL UNIQUE,
      "qrPayload" TEXT NOT NULL UNIQUE,
      price NUMERIC(12, 2),
      status TEXT NOT NULL DEFAULT 'valid',
      "admissionStatus" TEXT NOT NULL DEFAULT 'outside',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS "price" NUMERIC(12, 2);
    CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets("orderId");
    CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets("sessionId");
    CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets("ticketTypeId");
    CREATE INDEX IF NOT EXISTS idx_tickets_code ON tickets("ticketCode");
    CREATE INDEX IF NOT EXISTS idx_tickets_qr_payload ON tickets("qrPayload");
    CREATE INDEX IF NOT EXISTS idx_tickets_refunded_type ON tickets("ticketTypeId") WHERE status = 'refunded';
  `);

        if (isRealPgPool(pool)) {
          await client.query(`
    CREATE TABLE IF NOT EXISTS ticket_type_paid_buckets (
      "ticketTypeId" TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
      bucket SMALLINT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY ("ticketTypeId", bucket)
    );

    CREATE OR REPLACE FUNCTION sync_ticket_type_paid_buckets_on_order()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'paid' THEN
          INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
          SELECT oi."ticketTypeId", (hashtext(NEW.id) & 31)::smallint, SUM(oi.quantity)::int
          FROM order_items oi
          WHERE oi."orderId" = NEW.id
          GROUP BY oi."ticketTypeId"
          ON CONFLICT ("ticketTypeId", bucket) DO UPDATE
            SET qty = ticket_type_paid_buckets.qty + EXCLUDED.qty;
        END IF;
        RETURN NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          IF OLD.status <> 'paid' AND NEW.status = 'paid' THEN
            INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
            SELECT oi."ticketTypeId", (hashtext(NEW.id) & 31)::smallint, SUM(oi.quantity)::int
            FROM order_items oi
            WHERE oi."orderId" = NEW.id
            GROUP BY oi."ticketTypeId"
            ON CONFLICT ("ticketTypeId", bucket) DO UPDATE
              SET qty = ticket_type_paid_buckets.qty + EXCLUDED.qty;
          ELSIF OLD.status = 'paid' AND NEW.status <> 'paid' THEN
            INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
            SELECT oi."ticketTypeId", (hashtext(OLD.id) & 31)::smallint, -SUM(oi.quantity)::int
            FROM order_items oi
            WHERE oi."orderId" = OLD.id
            GROUP BY oi."ticketTypeId"
            ON CONFLICT ("ticketTypeId", bucket) DO UPDATE
              SET qty = ticket_type_paid_buckets.qty + EXCLUDED.qty;
          END IF;
        END IF;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'paid' THEN
          INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
          SELECT oi."ticketTypeId", (hashtext(OLD.id) & 31)::smallint, -SUM(oi.quantity)::int
          FROM order_items oi
          WHERE oi."orderId" = OLD.id
          GROUP BY oi."ticketTypeId"
          ON CONFLICT ("ticketTypeId", bucket) DO UPDATE
            SET qty = ticket_type_paid_buckets.qty + EXCLUDED.qty;
        END IF;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$;

    CREATE OR REPLACE FUNCTION sync_ticket_type_paid_buckets_on_item()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_order_status TEXT;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        SELECT status INTO v_order_status FROM orders WHERE id = NEW."orderId";
        IF v_order_status = 'paid' THEN
          INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
          VALUES (NEW."ticketTypeId", (hashtext(NEW."orderId") & 31)::smallint, NEW.quantity)
          ON CONFLICT ("ticketTypeId", bucket) DO UPDATE
            SET qty = ticket_type_paid_buckets.qty + EXCLUDED.qty;
        END IF;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        SELECT status INTO v_order_status FROM orders WHERE id = OLD."orderId";
        IF v_order_status = 'paid' THEN
          INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
          VALUES (OLD."ticketTypeId", (hashtext(OLD."orderId") & 31)::smallint, -OLD.quantity)
          ON CONFLICT ("ticketTypeId", bucket) DO UPDATE
            SET qty = ticket_type_paid_buckets.qty + EXCLUDED.qty;
        END IF;
        RETURN OLD;
      ELSIF TG_OP = 'UPDATE' THEN
        SELECT status INTO v_order_status FROM orders WHERE id = NEW."orderId";
        IF v_order_status = 'paid' AND (
          OLD."ticketTypeId" IS DISTINCT FROM NEW."ticketTypeId" OR OLD.quantity IS DISTINCT FROM NEW.quantity
        ) THEN
          INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
          VALUES (OLD."ticketTypeId", (hashtext(OLD."orderId") & 31)::smallint, -OLD.quantity)
          ON CONFLICT ("ticketTypeId", bucket) DO UPDATE
            SET qty = ticket_type_paid_buckets.qty + EXCLUDED.qty;
          INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
          VALUES (NEW."ticketTypeId", (hashtext(NEW."orderId") & 31)::smallint, NEW.quantity)
          ON CONFLICT ("ticketTypeId", bucket) DO UPDATE
            SET qty = ticket_type_paid_buckets.qty + EXCLUDED.qty;
        END IF;
        RETURN NEW;
      END IF;
      RETURN NULL;
    END;
    $$;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orders_paid_buckets_iu') THEN
        CREATE TRIGGER trg_orders_paid_buckets_iu
        AFTER INSERT OR UPDATE OF status ON orders
        FOR EACH ROW
        EXECUTE FUNCTION sync_ticket_type_paid_buckets_on_order();
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orders_paid_buckets_d') THEN
        CREATE TRIGGER trg_orders_paid_buckets_d
        BEFORE DELETE ON orders
        FOR EACH ROW
        EXECUTE FUNCTION sync_ticket_type_paid_buckets_on_order();
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_order_items_paid_buckets') THEN
        CREATE TRIGGER trg_order_items_paid_buckets
        AFTER INSERT OR UPDATE OF quantity, "ticketTypeId" OR DELETE ON order_items
        FOR EACH ROW
        EXECUTE FUNCTION sync_ticket_type_paid_buckets_on_item();
      END IF;
      IF NOT EXISTS (SELECT 1 FROM ticket_type_paid_buckets LIMIT 1)
         AND EXISTS (SELECT 1 FROM orders WHERE status = 'paid' LIMIT 1) THEN
        INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
        SELECT oi."ticketTypeId", (hashtext(o.id) & 31)::smallint, SUM(oi.quantity)::int
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE o.status = 'paid'
        GROUP BY oi."ticketTypeId", (hashtext(o.id) & 31)::smallint
        ON CONFLICT ("ticketTypeId", bucket) DO NOTHING;
      END IF;
    END $$;

    CREATE OR REPLACE FUNCTION reserve_tickets_atomic_v2(
      p_order_id TEXT,
      p_event_id TEXT,
      p_session_id TEXT,
      p_buyer_email TEXT,
      p_buyer_email_norm TEXT,
      p_buyer_name TEXT,
      p_buyer_phone TEXT,
      p_now TIMESTAMPTZ,
      p_expires_at TIMESTAMPTZ,
      p_total_tickets INT,
      p_subtotal NUMERIC,
      p_discount_amount NUMERIC,
      p_customer_fee NUMERIC,
      p_order_total NUMERIC,
      p_customer_fee_mode TEXT,
      p_customer_fee_rate NUMERIC,
      p_ubu_privilege_applied BOOLEAN,
      p_organizer_fee_rate NUMERIC,
      p_organizer_fee_privilege_rate NUMERIC,
      p_organizer_fee_mode TEXT,
      p_expected_ubu_mode BOOLEAN,
      p_distinct_tt_ids TEXT[],
      p_distinct_req_qtys INT[],
      p_expected_prices NUMERIC[],
      p_expected_student_priv BOOLEAN[],
      p_expected_student_prices NUMERIC[],
      p_item_ids TEXT[],
      p_item_tt_ids TEXT[],
      p_item_qtys INT[],
      p_item_unit_prices NUMERIC[],
      p_item_subtotals NUMERIC[],
      p_queue_token TEXT DEFAULT NULL,
      p_queue_capacity INT DEFAULT 200
    )
    RETURNS TABLE(
      outcome TEXT,
      err_message TEXT
    )
    LANGUAGE plpgsql
    VOLATILE
    AS $$
    DECLARE
      v_ev RECORD;
      v_limit INT;
      v_already INT;
      v_sess RECORD;
      v_fee RECORD;
      v_eff_cf_mode TEXT;
      v_eff_cf_rate NUMERIC;
      v_eff_of_mode TEXT;
      v_eff_of_rate NUMERIC;
      v_eff_of_priv_rate NUMERIC;
      v_eff_ubu BOOLEAN;
      v_locked_count INT;
      v_idx INT;
      v_tt RECORD;
      v_held INT;
      v_avail INT;
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext(p_event_id), hashtext(p_buyer_email_norm));

      SELECT "limitPerOrder", status, "salesStartTime", "salesEndTime"
      INTO v_ev
      FROM events
      WHERE id = p_event_id;

      IF NOT FOUND THEN
        outcome := 'ERROR';
        err_message := 'ไม่พบคอนเสิร์ตที่ระบุ';
        RETURN NEXT;
        RETURN;
      END IF;

      IF v_ev.status <> 'approved' THEN
        outcome := 'ERROR';
        err_message := 'คอนเสิร์ตนี้ยังไม่เปิดจำหน่าย';
        RETURN NEXT;
        RETURN;
      END IF;

      IF v_ev."salesStartTime" IS NOT NULL AND p_now < v_ev."salesStartTime" THEN
        outcome := 'ERROR';
        err_message := 'ยังไม่ถึงเวลาเปิดจำหน่ายบัตร';
        RETURN NEXT;
        RETURN;
      END IF;

      IF v_ev."salesEndTime" IS NOT NULL AND p_now > v_ev."salesEndTime" THEN
        outcome := 'ERROR';
        err_message := 'หมดเวลาการจำหน่ายบัตรแล้ว';
        RETURN NEXT;
        RETURN;
      END IF;

      v_limit := COALESCE(NULLIF(v_ev."limitPerOrder"::int, 0), 4);
      IF p_total_tickets > v_limit THEN
        outcome := 'ERROR';
        err_message := format('จำนวนบัตรรวมทุกประเภท (%s ใบ) เกินจำกัดต่อคำสั่งซื้อ (%s ใบ)', p_total_tickets, v_limit);
        RETURN NEXT;
        RETURN;
      END IF;

      SELECT GREATEST(0,
        COALESCE((
          SELECT SUM(oi.quantity)::int
          FROM orders o
          JOIN order_items oi ON o.id = oi."orderId"
          WHERE o."eventId" = p_event_id
            AND LOWER(TRIM(o."buyerEmail")) = p_buyer_email_norm
            AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > p_now))
        ), 0) - COALESCE((
          SELECT COUNT(*)::int
          FROM tickets t
          JOIN orders o2 ON t."orderId" = o2.id
          WHERE o2."eventId" = p_event_id
            AND LOWER(TRIM(o2."buyerEmail")) = p_buyer_email_norm
            AND t.status = 'refunded'
        ), 0)
      )::int INTO v_already;

      IF v_already >= v_limit THEN
        outcome := 'ERROR';
        err_message := format('ท่านได้สั่งซื้อบัตรคอนเสิร์ตนี้ครบตามจำนวนจำกัดแล้ว (%s / %s ใบ สำหรับอีเมลนี้) เพื่อกระจายสิทธิ์ให้แก่ผู้ชมท่านอื่น', v_already, v_limit);
        RETURN NEXT;
        RETURN;
      END IF;

      IF v_already + p_total_tickets > v_limit THEN
        outcome := 'ERROR';
        err_message := format('ท่านได้สั่งซื้อหรือมีรายการจองบัตรคอนเสิร์ตนี้ไปแล้ว %s ใบ ไม่สามารถซื้อเพิ่มอีก %s ใบได้ (สามารถซื้อเพิ่มได้อีกไม่เกิน %s ใบ เพื่อไม่ให้เกินเพดานจำกัด %s ใบ ต่อหนึ่งท่านในคอนเสิร์ตนี้)', v_already, p_total_tickets, GREATEST(0, v_limit - v_already), v_limit);
        RETURN NEXT;
        RETURN;
      END IF;

      SELECT status, "endTime"
      INTO v_sess
      FROM event_sessions
      WHERE id = p_session_id AND "eventId" = p_event_id;

      IF NOT FOUND THEN
        outcome := 'ERROR';
        err_message := 'ไม่พบรอบการแสดงที่ระบุในคอนเสิร์ตนี้';
        RETURN NEXT;
        RETURN;
      END IF;

      IF v_sess.status = 'cancelled' THEN
        outcome := 'ERROR';
        err_message := 'รอบการแสดงนี้ถูกยกเลิกแล้ว ไม่สามารถทำการจองบัตรได้';
        RETURN NEXT;
        RETURN;
      END IF;

      IF v_sess.status <> 'approved' THEN
        outcome := 'ERROR';
        err_message := 'รอบการแสดงนี้ยังไม่เปิดจำหน่าย';
        RETURN NEXT;
        RETURN;
      END IF;

      IF v_sess."endTime" IS NOT NULL AND p_now > v_sess."endTime" THEN
        outcome := 'ERROR';
        err_message := 'รอบการแสดงนี้สิ้นสุดลงแล้ว ไม่สามารถทำการจองบัตรได้';
        RETURN NEXT;
        RETURN;
      END IF;

      SELECT "organizerFeeMode", "organizerFeeRate", "organizerFeePrivilegeRate",
             "ubuPrivilegeMode", "customerFeeMode", "customerFeeRate", "organizerFeeLocked"
      INTO v_fee
      FROM event_fee_settings
      WHERE "eventId" = p_event_id;

      IF NOT FOUND THEN
        INSERT INTO event_fee_settings ("eventId", "organizerFeeLocked", "customerFeeMode", "customerFeeRate", "updatedAt")
        VALUES (p_event_id, TRUE, 'percentage', 5, now())
        ON CONFLICT ("eventId") DO NOTHING;

        SELECT "organizerFeeMode", "organizerFeeRate", "organizerFeePrivilegeRate",
               "ubuPrivilegeMode", "customerFeeMode", "customerFeeRate", "organizerFeeLocked"
        INTO v_fee
        FROM event_fee_settings
        WHERE "eventId" = p_event_id
        FOR UPDATE;
      ELSIF NOT COALESCE(v_fee."organizerFeeLocked", FALSE) THEN
        SELECT "organizerFeeMode", "organizerFeeRate", "organizerFeePrivilegeRate",
               "ubuPrivilegeMode", "customerFeeMode", "customerFeeRate", "organizerFeeLocked"
        INTO v_fee
        FROM event_fee_settings
        WHERE "eventId" = p_event_id
        FOR UPDATE;

        IF NOT COALESCE(v_fee."organizerFeeLocked", FALSE) THEN
          UPDATE event_fee_settings
          SET "organizerFeeLocked" = TRUE, "updatedAt" = now()
          WHERE "eventId" = p_event_id;
        END IF;
      END IF;

      v_eff_cf_mode := COALESCE(v_fee."customerFeeMode", 'percentage');
      v_eff_cf_rate := COALESCE(v_fee."customerFeeRate"::numeric, 5);
      v_eff_of_mode := COALESCE(v_fee."organizerFeeMode", 'percentage');
      v_eff_of_rate := COALESCE(v_fee."organizerFeeRate"::numeric, 2);
      v_eff_of_priv_rate := COALESCE(v_fee."organizerFeePrivilegeRate"::numeric, 3);
      v_eff_ubu := COALESCE(v_fee."ubuPrivilegeMode", FALSE);

      IF v_eff_cf_mode IS DISTINCT FROM p_customer_fee_mode
         OR v_eff_cf_rate IS DISTINCT FROM p_customer_fee_rate
         OR v_eff_of_mode IS DISTINCT FROM p_organizer_fee_mode
         OR v_eff_of_rate IS DISTINCT FROM p_organizer_fee_rate
         OR v_eff_of_priv_rate IS DISTINCT FROM p_organizer_fee_privilege_rate
         OR v_eff_ubu IS DISTINCT FROM p_expected_ubu_mode THEN
        outcome := 'RETRY';
        RETURN NEXT;
        RETURN;
      END IF;

      PERFORM 1
      FROM ticket_types
      WHERE id = ANY(p_distinct_tt_ids) AND "sessionId" = p_session_id
      ORDER BY id
      FOR NO KEY UPDATE;

      GET DIAGNOSTICS v_locked_count = ROW_COUNT;
      IF v_locked_count <> array_length(p_distinct_tt_ids, 1) THEN
        outcome := 'ERROR';
        err_message := 'มีประเภทบัตรที่ไม่ได้อยู่ในรอบการแสดงนี้';
        RETURN NEXT;
        RETURN;
      END IF;

      FOR v_idx IN 1..array_length(p_distinct_tt_ids, 1) LOOP
        SELECT id, name, price, quota, "isStudentPrivilege", "studentPrice"
        INTO v_tt
        FROM ticket_types
        WHERE id = p_distinct_tt_ids[v_idx] AND "sessionId" = p_session_id;

        IF NOT FOUND THEN
          outcome := 'ERROR';
          err_message := 'มีประเภทบัตรที่ไม่ได้อยู่ในรอบการแสดงนี้';
          RETURN NEXT;
          RETURN;
        END IF;

        IF v_tt.price::numeric IS DISTINCT FROM p_expected_prices[v_idx]
           OR COALESCE(v_tt."isStudentPrivilege", FALSE) IS DISTINCT FROM p_expected_student_priv[v_idx]
           OR (CASE WHEN v_tt."studentPrice" IS NULL THEN NULL ELSE v_tt."studentPrice"::numeric END) IS DISTINCT FROM p_expected_student_prices[v_idx] THEN
          outcome := 'RETRY';
          RETURN NEXT;
          RETURN;
        END IF;

        SELECT GREATEST(0,
          COALESCE((
            SELECT SUM(b.qty)::int
            FROM ticket_type_paid_buckets b
            WHERE b."ticketTypeId" = v_tt.id
          ), 0)
          + COALESCE((
            SELECT SUM(oi.quantity)::int
            FROM orders o
            JOIN order_items oi ON oi."orderId" = o.id
            WHERE o.status = 'reserved'
              AND o."expiresAt" > p_now
              AND oi."ticketTypeId" = v_tt.id
          ), 0)
          - COALESCE((
            SELECT COUNT(*)::int
            FROM tickets t
            WHERE t."ticketTypeId" = v_tt.id
              AND t.status = 'refunded'
          ), 0)
        )::int INTO v_held;

        v_avail := v_tt.quota::int - COALESCE(v_held, 0);
        IF v_avail < p_distinct_req_qtys[v_idx] THEN
          outcome := 'ERROR';
          err_message := format('บัตรประเภท "%s" เหลือไม่เพียงพอ (เหลือ %s ใบ)', v_tt.name, GREATEST(0, v_avail));
          RETURN NEXT;
          RETURN;
        END IF;
      END LOOP;

      INSERT INTO orders (
        id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
        status, subtotal, "discountAmount", "customerFee", total, "customerFeeMode", "customerFeeRate",
        "ubuPrivilegeApplied", "organizerFeeRate", "organizerFeePrivilegeRate", "organizerFeeMode",
        "reservedAt", "expiresAt", "createdAt", "updatedAt"
      ) VALUES (
        p_order_id, p_event_id, p_session_id, p_buyer_email, p_buyer_name, p_buyer_phone,
        'reserved', p_subtotal, p_discount_amount, p_customer_fee, p_order_total, p_customer_fee_mode, p_customer_fee_rate,
        p_ubu_privilege_applied, p_organizer_fee_rate, p_organizer_fee_privilege_rate, p_organizer_fee_mode,
        p_now, p_expires_at, p_now, p_now
      );

      INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
      SELECT items.id, p_order_id, items."ticketTypeId", items.quantity, items."unitPrice", items.subtotal
      FROM UNNEST(p_item_ids, p_item_tt_ids, p_item_qtys, p_item_unit_prices, p_item_subtotals)
        AS items(id, "ticketTypeId", quantity, "unitPrice", subtotal);

      IF p_queue_token IS NOT NULL THEN
        UPDATE event_queue_entries
        SET status = 'completed', "updatedAt" = now()
        WHERE id = p_queue_token AND "eventId" = p_event_id;

        IF EXISTS (
          SELECT 1 FROM event_queue_entries
          WHERE "eventId" = p_event_id AND status = 'waiting' AND "expiresAt" >= now()
        ) THEN
          UPDATE event_queue_entries
          SET status = 'active',
              "expiresAt" = now() + INTERVAL '15 minutes',
              "updatedAt" = now()
          WHERE id = (
            SELECT id FROM event_queue_entries
            WHERE "eventId" = p_event_id
              AND status = 'waiting'
              AND "expiresAt" >= now()
              AND (
                SELECT COUNT(*)::int FROM event_queue_entries
                WHERE "eventId" = p_event_id AND status = 'active' AND "expiresAt" >= now()
              ) < p_queue_capacity
            ORDER BY "queueNumber" ASC
            LIMIT 1
          );
        END IF;
      END IF;

      outcome := 'OK';
      err_message := NULL;
      RETURN NEXT;
      RETURN;
    END;
    $$;
  `);
        }
      });
    } catch (err) {
      reservationSchemaPromises.delete(pool);
      throw err;
    }
  })();
  reservationSchemaPromises.set(pool, promise);
  return promise;
}

export async function getBuyerTicketCountForEvent(
  pool: Pool | PoolClient,
  eventId: string,
  buyerEmail: string,
  _buyerPhone?: string,
  now = new Date(),
): Promise<number> {
  const emailNorm = (buyerEmail || '').trim().toLowerCase();

  if (!emailNorm) {
    return 0;
  }

  const res = await pool.query(
    `SELECT GREATEST(0,
       COALESCE(SUM(oi.quantity), 0)::int -
       COALESCE((
         SELECT count(*)::int
         FROM tickets t
         JOIN orders o2 ON t."orderId" = o2.id
         WHERE o2."eventId" = $1
           AND LOWER(TRIM(o2."buyerEmail")) = $2
           AND t.status = 'refunded'
       ), 0)
     )::int as total
     FROM orders o
     JOIN order_items oi ON o.id = oi."orderId"
     WHERE o."eventId" = $1
       AND LOWER(TRIM(o."buyerEmail")) = $2
       AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $3))`,
    [eventId, emailNorm, now],
  );

  return Number(res.rows[0]?.total) || 0;
}

export async function getEventLimitAndBuyerTicketCount(
  pool: Pool | PoolClient,
  eventId: string,
  buyerEmail: string,
  now = new Date(),
): Promise<{ found: boolean; limitPerOrder: number; alreadyPurchased: number }> {
  const emailNorm = (buyerEmail || '').trim().toLowerCase();
  const res = await pool.query<{ limitPerOrder: number | string | null; total: number }>(
    `SELECT e."limitPerOrder",
            GREATEST(0,
              COALESCE((
                SELECT SUM(oi.quantity)::int
                FROM orders o
                JOIN order_items oi ON o.id = oi."orderId"
                WHERE o."eventId" = e.id
                  AND LOWER(TRIM(o."buyerEmail")) = $2
                  AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $3))
              ), 0) - COALESCE((
                SELECT count(*)::int
                FROM tickets t
                JOIN orders o2 ON t."orderId" = o2.id
                WHERE o2."eventId" = e.id
                  AND LOWER(TRIM(o2."buyerEmail")) = $2
                  AND t.status = 'refunded'
              ), 0)
            )::int AS total
     FROM events e
     WHERE e.id = $1`,
    [eventId, emailNorm, now],
  );
  if (res.rowCount === 0) {
    return { found: false, limitPerOrder: 4, alreadyPurchased: 0 };
  }
  return {
    found: true,
    limitPerOrder: Number(res.rows[0].limitPerOrder) || 4,
    alreadyPurchased: Number(res.rows[0].total) || 0,
  };
}

interface TicketTypePricingRow {
  id: string;
  name: string;
  price: number | string;
  quota: number | string;
  sessionId: string;
  isStudentPrivilege?: boolean | null;
  studentPrice?: number | string | null;
}

interface FeeSettingsResolved {
  customerFeeMode: CustomerFeeMode;
  customerFeeRate: number;
  organizerFeeMode: OrganizerFeeMode;
  organizerFeeRate: number;
  organizerFeePrivilegeRate: number;
  ubuPrivilegeMode: boolean;
}

function resolveFeeSettings(row?: {
  organizerFeeMode?: string | null;
  organizerFeeRate?: number | string | null;
  organizerFeePrivilegeRate?: number | string | null;
  ubuPrivilegeMode?: boolean | null;
  customerFeeMode?: string | null;
  customerFeeRate?: number | string | null;
} | null): FeeSettingsResolved {
  return {
    customerFeeMode: (row?.customerFeeMode || 'percentage') as CustomerFeeMode,
    customerFeeRate: row?.customerFeeRate != null ? Number(row.customerFeeRate) : 5,
    organizerFeeMode: (row?.organizerFeeMode || 'percentage') as OrganizerFeeMode,
    organizerFeeRate: row?.organizerFeeRate != null ? Number(row.organizerFeeRate) : 2,
    organizerFeePrivilegeRate: row?.organizerFeePrivilegeRate != null ? Number(row.organizerFeePrivilegeRate) : 3,
    ubuPrivilegeMode: Boolean(row?.ubuPrivilegeMode),
  };
}

function validateEventAndLimits(
  event: {
    limitPerOrder: number | string | null;
    status: string;
    salesStartTime: Date | string | null;
    salesEndTime: Date | string | null;
  } | null | undefined,
  totalTickets: number,
  alreadyPurchased: number,
  now: Date,
): number {
  if (!event) {
    throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
  }
  if (event.status !== 'approved') {
    throw new Error('คอนเสิร์ตนี้ยังไม่เปิดจำหน่าย');
  }
  if (event.salesStartTime) {
    const salesStart = new Date(event.salesStartTime);
    if (!Number.isNaN(salesStart.getTime()) && now.getTime() < salesStart.getTime()) {
      throw new Error('ยังไม่ถึงเวลาเปิดจำหน่ายบัตร');
    }
  }
  if (event.salesEndTime) {
    const salesEnd = new Date(event.salesEndTime);
    if (!Number.isNaN(salesEnd.getTime()) && now.getTime() > salesEnd.getTime()) {
      throw new Error('หมดเวลาการจำหน่ายบัตรแล้ว');
    }
  }
  const limitPerOrder = Number(event.limitPerOrder) || 4;
  if (totalTickets > limitPerOrder) {
    throw new Error(`จำนวนบัตรรวมทุกประเภท (${totalTickets} ใบ) เกินจำกัดต่อคำสั่งซื้อ (${limitPerOrder} ใบ)`);
  }
  if (alreadyPurchased >= limitPerOrder) {
    throw new Error(
      `ท่านได้สั่งซื้อบัตรคอนเสิร์ตนี้ครบตามจำนวนจำกัดแล้ว (${alreadyPurchased} / ${limitPerOrder} ใบ สำหรับอีเมลนี้) เพื่อกระจายสิทธิ์ให้แก่ผู้ชมท่านอื่น`,
    );
  }
  if (alreadyPurchased + totalTickets > limitPerOrder) {
    const remainingQuota = Math.max(0, limitPerOrder - alreadyPurchased);
    throw new Error(
      `ท่านได้สั่งซื้อหรือมีรายการจองบัตรคอนเสิร์ตนี้ไปแล้ว ${alreadyPurchased} ใบ ไม่สามารถซื้อเพิ่มอีก ${totalTickets} ใบได้ (สามารถซื้อเพิ่มได้อีกไม่เกิน ${remainingQuota} ใบ เพื่อไม่ให้เกินเพดานจำกัด ${limitPerOrder} ใบ ต่อหนึ่งท่านในคอนเสิร์ตนี้)`,
    );
  }
  return limitPerOrder;
}

function validateSessionWindow(
  sessRow: { id?: string | null; status?: string | null; endTime?: Date | string | null } | null | undefined,
  now: Date,
): void {
  if (!sessRow?.id) {
    throw new Error('ไม่พบรอบการแสดงที่ระบุในคอนเสิร์ตนี้');
  }
  if (sessRow.status === 'cancelled') {
    throw new Error('รอบการแสดงนี้ถูกยกเลิกแล้ว ไม่สามารถทำการจองบัตรได้');
  }
  if (sessRow.status !== 'approved') {
    throw new Error('รอบการแสดงนี้ยังไม่เปิดจำหน่าย');
  }
  if (sessRow.endTime) {
    const sessionEnd = new Date(sessRow.endTime);
    if (!Number.isNaN(sessionEnd.getTime()) && now.getTime() > sessionEnd.getTime()) {
      throw new Error('รอบการแสดงนี้สิ้นสุดลงแล้ว ไม่สามารถทำการจองบัตรได้');
    }
  }
}

function computeReservationPricing(
  sanitizedItems: ReservationItemInput[],
  ticketTypeMap: Map<string, TicketTypePricingRow>,
  buyerEmail: string,
  eventId: string,
  fees: FeeSettingsResolved,
  totalTickets: number,
): {
  orderItemsToInsert: OrderItemDetail[];
  orderSubtotal: number;
  discountAmount: number;
  customerFee: number;
  orderTotal: number;
  hasUbuPrivilege: boolean;
} {
  const hasUbuPrivilege = isUbuEmail(buyerEmail);
  const isUbuFreshyEvent = fees.ubuPrivilegeMode || eventId === 'event-ubu-freshy-2026';

  const orderItemsToInsert: OrderItemDetail[] = [];
  let orderSubtotal = 0;
  let discountAmount = 0;

  for (const item of sanitizedItems) {
    const tt = ticketTypeMap.get(item.ticketTypeId);
    if (!tt) {
      throw new Error('ไม่พบข้อมูลประเภทบัตร');
    }

    const regularUnitPrice = Number(tt.price);
    let actualUnitPrice = regularUnitPrice;
    let itemDiscount = 0;

    if (hasUbuPrivilege) {
      const isStudentTicket = Boolean(tt.isStudentPrivilege) || isUbuFreshyEvent;
      if (isStudentTicket) {
        actualUnitPrice = tt.studentPrice != null
          ? Number(tt.studentPrice)
          : (regularUnitPrice === 150 ? 99 : Math.round(regularUnitPrice * 0.85));
        itemDiscount = roundHalfUp((regularUnitPrice - actualUnitPrice) * item.quantity);
        if (regularUnitPrice === 150 && actualUnitPrice === 99) {
          itemDiscount = roundHalfUp((150 - 99) * item.quantity);
        }
      }
    }

    orderSubtotal = roundHalfUp(orderSubtotal + regularUnitPrice * item.quantity);
    discountAmount = roundHalfUp(discountAmount + itemDiscount);

    orderItemsToInsert.push({
      id: randomUUID(),
      ticketTypeId: tt.id,
      ticketTypeName: tt.name,
      unitPrice: actualUnitPrice,
      quantity: item.quantity,
      subtotal: roundHalfUp(actualUnitPrice * item.quantity),
    });
  }

  // D-37 general UBU discount fallback if not using per-ticket student privilege
  if (hasUbuPrivilege && discountAmount === 0 && !isUbuFreshyEvent) {
    let remainingDiscountTickets = 2;
    const discountedItems: OrderItemDetail[] = [];
    for (const item of [...orderItemsToInsert].sort((a, b) => b.unitPrice - a.unitPrice)) {
      const discountedQuantity = Math.min(item.quantity, remainingDiscountTickets);
      const fullPriceQuantity = item.quantity - discountedQuantity;
      const discountPerTicket = Math.round(item.unitPrice * 0.15);
      if (discountedQuantity > 0) {
        const discountedUnitPrice = roundHalfUp(item.unitPrice - discountPerTicket);
        discountedItems.push({
          ...item,
          quantity: discountedQuantity,
          unitPrice: discountedUnitPrice,
          subtotal: roundHalfUp(discountedUnitPrice * discountedQuantity),
        });
        discountAmount = roundHalfUp(discountAmount + discountPerTicket * discountedQuantity);
        remainingDiscountTickets -= discountedQuantity;
      }
      if (fullPriceQuantity > 0) {
        discountedItems.push({
          ...item,
          id: discountedQuantity > 0 ? randomUUID() : item.id,
          quantity: fullPriceQuantity,
          subtotal: roundHalfUp(item.unitPrice * fullPriceQuantity),
        });
      }
    }
    orderItemsToInsert.splice(0, orderItemsToInsert.length, ...discountedItems);
  }

  const discountedTicketSubtotal = Math.max(0, roundHalfUp(orderSubtotal - discountAmount));

  // AC-69, D-134, D-135: Calculate exact customer fee and total (5% or 6% with Math.ceil whole Baht)
  let { fee: customerFee, total: orderTotal } = calculateCustomerFee(
    fees.customerFeeMode,
    fees.customerFeeRate,
    totalTickets,
    discountedTicketSubtotal,
  );
  if (fees.customerFeeMode === 'percentage') {
    customerFee = Math.ceil(customerFee);
    orderTotal = roundHalfUp(discountedTicketSubtotal + customerFee);
  }

  return {
    orderItemsToInsert,
    orderSubtotal,
    discountAmount,
    customerFee,
    orderTotal,
    hasUbuPrivilege,
  };
}

export async function verifyQueueAndGetEventBuyerQuota(
  pool: Pool,
  eventId: string,
  queueToken: string | null | undefined,
  buyerEmail: string,
  now = new Date(),
): Promise<{ queueAllowed: boolean; found: boolean; limitPerOrder: number; alreadyPurchased: number }> {
  await Promise.all([ensureQueueSchema(pool), ensureReservationSchema(pool)]);
  const emailNorm = (buyerEmail || '').trim().toLowerCase();
  const res = await pool.query<{
    queueAllowedFast: boolean;
    found: boolean;
    limitPerOrder: number | string | null;
    total: number;
  }>(
    `SELECT
       CASE
         WHEN $2::text IS NOT NULL AND EXISTS(
           SELECT 1 FROM event_queue_entries q
           WHERE q.id = $2 AND q."eventId" = $1 AND q.status = 'active' AND q."expiresAt" > now()
         ) THEN TRUE
         ELSE (
           SELECT COUNT(*)::int FROM event_queue_entries q2
           WHERE q2."eventId" = $1 AND q2.status = 'active' AND q2."expiresAt" >= now()
         ) < $5
       END AS "queueAllowedFast",
       (e.id IS NOT NULL) AS found,
       e."limitPerOrder",
       CASE WHEN e.id IS NULL THEN 0 ELSE GREATEST(0,
         COALESCE((
           SELECT SUM(oi.quantity)::int
           FROM orders o
           JOIN order_items oi ON o.id = oi."orderId"
           WHERE o."eventId" = e.id
             AND LOWER(TRIM(o."buyerEmail")) = $3
             AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $4))
         ), 0) - COALESCE((
           SELECT COUNT(*)::int
           FROM tickets t
           JOIN orders o2 ON t."orderId" = o2.id
           WHERE o2."eventId" = e.id
             AND LOWER(TRIM(o2."buyerEmail")) = $3
             AND t.status = 'refunded'
         ), 0)
       )::int END AS total
     FROM (SELECT 1) AS dummy
     LEFT JOIN events e ON e.id = $1`,
    [eventId, queueToken || null, emailNorm, now, QUEUE_CAPACITY],
  );
  const row = res.rows[0];
  let queueAllowed = Boolean(row?.queueAllowedFast);
  if (!queueAllowed) {
    queueAllowed = await verifyQueueAccess(pool, eventId, queueToken);
  }
  return {
    queueAllowed,
    found: Boolean(row?.found),
    limitPerOrder: Number(row?.limitPerOrder) || 4,
    alreadyPurchased: Number(row?.total) || 0,
  };
}

async function createReservationFast(
  pool: Pool,
  input: CreateReservationInput,
  sanitizedItems: ReservationItemInput[],
  totalTickets: number,
  now: Date,
  options?: { queueToken?: string | null; enforceQueue?: boolean },
): Promise<OrderReservationDetail> {
  await Promise.all([
    ensureReservationSchema(pool),
    ...(options?.enforceQueue || options?.queueToken ? [ensureQueueSchema(pool)] : []),
  ]);

  const distinctQtyMap = new Map<string, number>();
  for (const item of sanitizedItems) {
    distinctQtyMap.set(item.ticketTypeId, (distinctQtyMap.get(item.ticketTypeId) ?? 0) + item.quantity);
  }
  const distinctTtIds = [...distinctQtyMap.keys()];
  const checkQueue = Boolean(options?.enforceQueue);
  const queueToken = options?.queueToken ?? null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const queueSelectSql = checkQueue
      ? `CASE
           WHEN $6::text IS NOT NULL AND EXISTS(
             SELECT 1 FROM event_queue_entries q
             WHERE q.id = $6 AND q."eventId" = $2 AND q.status = 'active' AND q."expiresAt" > now()
           ) THEN TRUE
           ELSE (
             SELECT COUNT(*)::int FROM event_queue_entries q2
             WHERE q2."eventId" = $2 AND q2.status = 'active' AND q2."expiresAt" >= now()
           ) < $7
         END AS "queueAllowedFast"`
      : 'TRUE AS "queueAllowedFast"';
    const preParams = checkQueue
      ? [input.verifiedToken, input.eventId, input.sessionId, distinctTtIds, now, queueToken, QUEUE_CAPACITY]
      : [input.verifiedToken, input.eventId, input.sessionId, distinctTtIds, now];
    const preRes = await pool.query<{
      queueAllowedFast: boolean;
      gvsEmail: string | null;
      gvsName: string | null;
      gvsPhone: string | null;
      evId: string | null;
      evLimitPerOrder: number | string | null;
      evStatus: string | null;
      evSalesStartTime: Date | string | null;
      evSalesEndTime: Date | string | null;
      sessId: string | null;
      sessStatus: string | null;
      sessEndTime: Date | string | null;
      organizerFeeMode: string | null;
      organizerFeeRate: number | string | null;
      organizerFeePrivilegeRate: number | string | null;
      ubuPrivilegeMode: boolean | null;
      customerFeeMode: string | null;
      customerFeeRate: number | string | null;
      alreadyPurchased: number;
      ticketTypesJson: TicketTypePricingRow[];
    }>(
      `SELECT
         ${queueSelectSql},
         gvs.email AS "gvsEmail", gvs.name AS "gvsName", gvs.phone AS "gvsPhone",
         ev.id AS "evId", ev."limitPerOrder" AS "evLimitPerOrder",
         ev.status AS "evStatus", ev."salesStartTime" AS "evSalesStartTime", ev."salesEndTime" AS "evSalesEndTime",
         es.id AS "sessId", es.status AS "sessStatus", es."endTime" AS "sessEndTime",
         f."organizerFeeMode", f."organizerFeeRate", f."organizerFeePrivilegeRate",
         f."ubuPrivilegeMode", f."customerFeeMode", f."customerFeeRate",
         CASE WHEN gvs.email IS NULL THEN 0 ELSE GREATEST(0,
           COALESCE((
             SELECT SUM(oi.quantity)::int
             FROM orders o
             JOIN order_items oi ON o.id = oi."orderId"
             WHERE o."eventId" = $2
               AND LOWER(TRIM(o."buyerEmail")) = LOWER(TRIM(gvs.email))
               AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $5))
           ), 0) - COALESCE((
             SELECT COUNT(*)::int
             FROM tickets t
             JOIN orders o2 ON t."orderId" = o2.id
             WHERE o2."eventId" = $2
               AND LOWER(TRIM(o2."buyerEmail")) = LOWER(TRIM(gvs.email))
               AND t.status = 'refunded'
           ), 0)
         )::int END AS "alreadyPurchased",
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', tt.id,
             'name', tt.name,
             'price', tt.price,
             'quota', tt.quota,
             'sessionId', tt."sessionId",
             'isStudentPrivilege', tt."isStudentPrivilege",
             'studentPrice', tt."studentPrice"
           ))
           FROM ticket_types tt
           WHERE tt.id = ANY($4) AND tt."sessionId" = $3
         ), '[]'::json) AS "ticketTypesJson"
       FROM (SELECT 1) AS dummy
       LEFT JOIN guest_verified_sessions gvs
         ON gvs.token = $1 AND gvs.purpose = 'checkout' AND gvs."expiresAt" > $5
       LEFT JOIN events ev ON ev.id = $2
       LEFT JOIN event_sessions es ON es.id = $3 AND es."eventId" = $2
       LEFT JOIN event_fee_settings f ON f."eventId" = $2`,
      preParams,
    );

    const pre = preRes.rows[0];
    if (checkQueue && !pre?.queueAllowedFast) {
      const queueAllowed = await verifyQueueAccess(pool, input.eventId, queueToken);
      if (!queueAllowed) {
        throw new QueueLockedError();
      }
    }
    if (!pre?.gvsEmail) {
      throw new Error('กรุณายืนยันตัวตนผ่าน OTP ก่อนดำเนินการกันบัตร');
    }

    const verifiedSession: Pick<GuestVerifiedSession, 'email' | 'name' | 'phone'> = {
      email: pre.gvsEmail,
      name: pre.gvsName ?? '',
      phone: pre.gvsPhone ?? '',
    };

    validateEventAndLimits(
      pre.evId
        ? {
            limitPerOrder: pre.evLimitPerOrder,
            status: pre.evStatus ?? '',
            salesStartTime: pre.evSalesStartTime,
            salesEndTime: pre.evSalesEndTime,
          }
        : null,
      totalTickets,
      Number(pre.alreadyPurchased) || 0,
      now,
    );

    validateSessionWindow(
      { id: pre.sessId, status: pre.sessStatus, endTime: pre.sessEndTime },
      now,
    );

    const ttRows = Array.isArray(pre.ticketTypesJson) ? pre.ticketTypesJson : [];
    const ticketTypeMap = new Map(ttRows.map(r => [r.id, r]));
    if (ticketTypeMap.size !== distinctTtIds.length) {
      throw new Error('มีประเภทบัตรที่ไม่ได้อยู่ในรอบการแสดงนี้');
    }

    const fees = resolveFeeSettings(pre);
    const pricing = computeReservationPricing(
      sanitizedItems,
      ticketTypeMap,
      verifiedSession.email,
      input.eventId,
      fees,
      totalTickets,
    );

    const orderId = `ORD-${randomUUID().toUpperCase()}`;
    const expiresAt = new Date(now.getTime() + RESERVATION_HOLD_SECONDS * 1000);
    const emailNorm = verifiedSession.email.trim().toLowerCase();

    const distinctReqQtys: number[] = [];
    const expectedPrices: number[] = [];
    const expectedStudentPriv: boolean[] = [];
    const expectedStudentPrices: (number | null)[] = [];

    for (const ttId of distinctTtIds) {
      const tt = ticketTypeMap.get(ttId);
      if (!tt) {
        throw new Error('มีประเภทบัตรที่ไม่ได้อยู่ในรอบการแสดงนี้');
      }
      distinctReqQtys.push(distinctQtyMap.get(ttId) ?? 0);
      expectedPrices.push(Number(tt.price));
      expectedStudentPriv.push(Boolean(tt.isStudentPrivilege));
      expectedStudentPrices.push(tt.studentPrice != null ? Number(tt.studentPrice) : null);
    }

    const execRes = await pool.query<{ outcome: string; err_message: string | null }>(
      `SELECT outcome, err_message
       FROM reserve_tickets_atomic_v2(
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22::text[], $23::int[], $24::numeric[], $25::boolean[], $26::numeric[],
         $27::text[], $28::text[], $29::int[], $30::numeric[], $31::numeric[],
         $32::text, $33::int
       )`,
      [
        orderId,
        input.eventId,
        input.sessionId,
        verifiedSession.email,
        emailNorm,
        verifiedSession.name,
        verifiedSession.phone,
        now,
        expiresAt,
        totalTickets,
        pricing.orderSubtotal,
        pricing.discountAmount,
        pricing.customerFee,
        pricing.orderTotal,
        fees.customerFeeMode,
        fees.customerFeeRate,
        pricing.hasUbuPrivilege && pricing.discountAmount > 0,
        fees.organizerFeeRate,
        fees.organizerFeePrivilegeRate,
        fees.organizerFeeMode,
        fees.ubuPrivilegeMode,
        distinctTtIds,
        distinctReqQtys,
        expectedPrices,
        expectedStudentPriv,
        expectedStudentPrices,
        pricing.orderItemsToInsert.map(i => i.id),
        pricing.orderItemsToInsert.map(i => i.ticketTypeId),
        pricing.orderItemsToInsert.map(i => i.quantity),
        pricing.orderItemsToInsert.map(i => i.unitPrice),
        pricing.orderItemsToInsert.map(i => i.subtotal),
        queueToken,
        QUEUE_CAPACITY,
      ],
    );

    const row = execRes.rows[0];
    if (row?.outcome === 'OK') {
      return {
        id: orderId,
        eventId: input.eventId,
        sessionId: input.sessionId,
        buyerEmail: verifiedSession.email,
        buyerName: verifiedSession.name,
        buyerPhone: verifiedSession.phone,
        status: 'reserved',
        items: pricing.orderItemsToInsert,
        subtotal: pricing.orderSubtotal,
        discountAmount: pricing.discountAmount,
        customerFeeMode: fees.customerFeeMode,
        customerFeeRate: fees.customerFeeRate,
        customerFee: pricing.customerFee,
        total: pricing.orderTotal,
        reservedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
    }

    if (row?.outcome === 'RETRY') {
      continue;
    }

    throw new Error(row?.err_message || 'เกิดข้อผิดพลาดในการกันบัตร');
  }

  throw new Error('ข้อมูลราคาหรือค่าธรรมเนียมมีการเปลี่ยนแปลง กรุณาลองใหม่อีกครั้ง');
}

export async function createReservation(
  pool: Pool,
  input: CreateReservationInput,
  now = new Date(),
  options?: { queueToken?: string | null; enforceQueue?: boolean },
): Promise<OrderReservationDetail> {
  // Input validation
  if (!input.items || input.items.length === 0) {
    throw new Error('กรุณาเลือกประเภทบัตรและจำนวนอย่างน้อย 1 ใบ');
  }

  const sanitizedItems = input.items
    .map(i => ({ ticketTypeId: i.ticketTypeId?.trim(), quantity: Number(i.quantity) }))
    .filter(i => i.quantity > 0);

  if (sanitizedItems.length === 0) {
    throw new Error('กรุณาเลือกจำนวนบัตรมากกว่า 0 ใบ');
  }

  const totalTickets = sanitizedItems.reduce((acc, i) => acc + i.quantity, 0);

  if (isRealPgPool(pool)) {
    return createReservationFast(pool, input, sanitizedItems, totalTickets, now, options);
  }

  // AC-12: Must provide valid OTP verified token with checkout purpose
  const verifiedSession = await getVerifiedGuestSession(pool, input.verifiedToken, now, 'checkout');
  if (!verifiedSession) {
    throw new Error('กรุณายืนยันตัวตนผ่าน OTP ก่อนดำเนินการกันบัตร');
  }

  await ensureReservationSchema(pool);

  return inTransaction(pool, async (client: PoolClient) => {
    const emailNorm = verifiedSession.email.trim().toLowerCase();

    // D-59, AC-10: Acquire transaction-level advisory lock on (eventId, buyerEmail)
    // to serialize concurrent reservation requests for the same buyer and event.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [input.eventId, emailNorm],
    );

    // 1. Verify Event existence, approval status, and sales window
    const eventRes = await client.query<{
      id: string;
      title: string;
      limitPerOrder: number | string | null;
      status: string;
      salesStartTime: Date | string | null;
      salesEndTime: Date | string | null;
    }>(
      'SELECT id, title, "limitPerOrder", status, "salesStartTime", "salesEndTime" FROM events WHERE id = $1',
      [input.eventId],
    );
    if (eventRes.rowCount === 0) {
      throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
    }
    const event = eventRes.rows[0];
    if (event.status !== 'approved') {
      throw new Error('คอนเสิร์ตนี้ยังไม่เปิดจำหน่าย');
    }
    if (event.salesStartTime) {
      const salesStart = new Date(event.salesStartTime);
      if (!Number.isNaN(salesStart.getTime()) && now.getTime() < salesStart.getTime()) {
        throw new Error('ยังไม่ถึงเวลาเปิดจำหน่ายบัตร');
      }
    }
    if (event.salesEndTime) {
      const salesEnd = new Date(event.salesEndTime);
      if (!Number.isNaN(salesEnd.getTime()) && now.getTime() > salesEnd.getTime()) {
        throw new Error('หมดเวลาการจำหน่ายบัตรแล้ว');
      }
    }

    // AC-10, AC-106: Limit check against total tickets in order
    const limitPerOrder = Number(event.limitPerOrder) || 4;
    if (totalTickets > limitPerOrder) {
      throw new Error(`จำนวนบัตรรวมทุกประเภท (${totalTickets} ใบ) เกินจำกัดต่อคำสั่งซื้อ (${limitPerOrder} ใบ)`);
    }

    // D-59: Anti-Scalping Cumulative Buyer Limit check across all orders for this event
    const alreadyPurchased = await getBuyerTicketCountForEvent(
      client,
      input.eventId,
      verifiedSession.email,
      verifiedSession.phone,
      now,
    );

    if (alreadyPurchased >= limitPerOrder) {
      throw new Error(
        `ท่านได้สั่งซื้อบัตรคอนเสิร์ตนี้ครบตามจำนวนจำกัดแล้ว (${alreadyPurchased} / ${limitPerOrder} ใบ สำหรับอีเมลนี้) เพื่อกระจายสิทธิ์ให้แก่ผู้ชมท่านอื่น`,
      );
    }

    if (alreadyPurchased + totalTickets > limitPerOrder) {
      const remainingQuota = Math.max(0, limitPerOrder - alreadyPurchased);
      throw new Error(
        `ท่านได้สั่งซื้อหรือมีรายการจองบัตรคอนเสิร์ตนี้ไปแล้ว ${alreadyPurchased} ใบ ไม่สามารถซื้อเพิ่มอีก ${totalTickets} ใบได้ (สามารถซื้อเพิ่มได้อีกไม่เกิน ${remainingQuota} ใบ เพื่อไม่ให้เกินเพดานจำกัด ${limitPerOrder} ใบ ต่อหนึ่งท่านในคอนเสิร์ตนี้)`,
      );
    }

    // 2. Verify Session belongs to this event, is approved, has not ended, and read fee settings in one round-trip
    const sessionRes = await client.query<{
      id: string;
      status: string;
      endTime: Date | string | null;
      organizerFeeMode?: string | null;
      organizerFeeRate?: number | string | null;
      organizerFeePrivilegeRate?: number | string | null;
      ubuPrivilegeMode?: boolean | null;
      customerFeeMode?: string | null;
      customerFeeRate?: number | string | null;
      organizerFeeLocked?: boolean | null;
    }>(
      `SELECT s.id, s.status, s."endTime",
              f."organizerFeeMode", f."organizerFeeRate", f."organizerFeePrivilegeRate",
              f."ubuPrivilegeMode", f."customerFeeMode", f."customerFeeRate", f."organizerFeeLocked"
       FROM event_sessions s
       LEFT JOIN event_fee_settings f ON f."eventId" = s."eventId"
       WHERE s.id = $1 AND s."eventId" = $2`,
      [input.sessionId, input.eventId],
    );
    if (sessionRes.rowCount === 0) {
      throw new Error('ไม่พบรอบการแสดงที่ระบุในคอนเสิร์ตนี้');
    }
    const sessRow = sessionRes.rows[0];
    if (sessRow.status === 'cancelled') {
      throw new Error('รอบการแสดงนี้ถูกยกเลิกแล้ว ไม่สามารถทำการจองบัตรได้');
    }
    if (sessRow.status !== 'approved') {
      throw new Error('รอบการแสดงนี้ยังไม่เปิดจำหน่าย');
    }
    if (sessRow.endTime) {
      const sessionEnd = new Date(sessRow.endTime);
      if (!Number.isNaN(sessionEnd.getTime()) && now.getTime() > sessionEnd.getTime()) {
        throw new Error('รอบการแสดงนี้สิ้นสุดลงแล้ว ไม่สามารถทำการจองบัตรได้');
      }
    }

    // 3. Resolve organizer/customer fee settings BEFORE locking ticket_types.
    // Only acquire FOR UPDATE on event_fee_settings if not yet locked (first reservation per G-49, AC-111).
    let customerFeeMode: CustomerFeeMode = 'percentage';
    let customerFeeRate = 5;
    let organizerFeeMode: OrganizerFeeMode = 'percentage';
    let organizerFeeRate = 2;
    let organizerFeePrivilegeRate = 3;
    let ubuPrivilegeModeFlag = Boolean(sessRow.ubuPrivilegeMode);

    if (sessRow.organizerFeeLocked === true) {
      customerFeeMode = (sessRow.customerFeeMode || 'percentage') as CustomerFeeMode;
      customerFeeRate = sessRow.customerFeeRate != null ? Number(sessRow.customerFeeRate) : 5;
      organizerFeeMode = (sessRow.organizerFeeMode || 'percentage') as OrganizerFeeMode;
      organizerFeeRate = sessRow.organizerFeeRate != null ? Number(sessRow.organizerFeeRate) : 2;
      organizerFeePrivilegeRate = sessRow.organizerFeePrivilegeRate != null ? Number(sessRow.organizerFeePrivilegeRate) : 3;
    } else {
      let feeRes = await client.query(
        `SELECT "organizerFeeMode", "organizerFeeRate", "organizerFeePrivilegeRate", "ubuPrivilegeMode", "customerFeeMode", "customerFeeRate", "organizerFeeLocked"
         FROM event_fee_settings
         WHERE "eventId" = $1`,
        [input.eventId],
      );

      if (feeRes.rowCount === 0) {
        const insFeeRes = await client.query(
          `INSERT INTO event_fee_settings ("eventId", "organizerFeeLocked", "customerFeeMode", "customerFeeRate", "updatedAt")
           VALUES ($1, TRUE, 'percentage', 5, now())
           ON CONFLICT ("eventId") DO NOTHING`,
          [input.eventId],
        );
        if (!insFeeRes.rowCount) {
          feeRes = await client.query(
            `SELECT "organizerFeeMode", "organizerFeeRate", "organizerFeePrivilegeRate", "ubuPrivilegeMode", "customerFeeMode", "customerFeeRate", "organizerFeeLocked"
             FROM event_fee_settings
             WHERE "eventId" = $1
             FOR UPDATE`,
            [input.eventId],
          );
        }
      } else if (!feeRes.rows[0].organizerFeeLocked) {
        feeRes = await client.query(
          `SELECT "organizerFeeMode", "organizerFeeRate", "organizerFeePrivilegeRate", "ubuPrivilegeMode", "customerFeeMode", "customerFeeRate", "organizerFeeLocked"
           FROM event_fee_settings
           WHERE "eventId" = $1
           FOR UPDATE`,
          [input.eventId],
        );
      }

      if (feeRes.rowCount && feeRes.rowCount > 0) {
        const row = feeRes.rows[0];
        customerFeeMode = (row.customerFeeMode || 'percentage') as CustomerFeeMode;
        customerFeeRate = row.customerFeeRate != null ? Number(row.customerFeeRate) : 5;
        organizerFeeMode = (row.organizerFeeMode || 'percentage') as OrganizerFeeMode;
        organizerFeeRate = row.organizerFeeRate != null ? Number(row.organizerFeeRate) : 2;
        organizerFeePrivilegeRate = row.organizerFeePrivilegeRate != null ? Number(row.organizerFeePrivilegeRate) : 3;
        ubuPrivilegeModeFlag = Boolean(row.ubuPrivilegeMode);

        if (!row.organizerFeeLocked) {
          await client.query(
            `UPDATE event_fee_settings
             SET "organizerFeeLocked" = TRUE, "updatedAt" = now()
             WHERE "eventId" = $1`,
            [input.eventId],
          );
        }
      }
    }

    // 4. Lock ticket types FIRST (FOR NO KEY UPDATE allows concurrent FK child inserts without blocking quota serialization)
    const ticketTypeIds = sanitizedItems.map(i => i.ticketTypeId);
    const ttRes = await client.query(
      `SELECT id, name, price, quota, "sessionId", "isStudentPrivilege", "studentPrice"
       FROM ticket_types
       WHERE id = ANY($1) AND "sessionId" = $2
       FOR NO KEY UPDATE`,
      [ticketTypeIds, input.sessionId],
    );

    if (ttRes.rowCount !== ticketTypeIds.length) {
      // AC-06: Sibling session tickets are rejected
      throw new Error('มีประเภทบัตรที่ไม่ได้อยู่ในรอบการแสดงนี้');
    }

    const ticketTypeMap = new Map(ttRes.rows.map(r => [r.id, r]));

    // 5. Calculate UBU Privilege & item pricing before running quota check + insert
    const hasUbuPrivilege = isUbuEmail(verifiedSession.email);
    const isUbuPrivilegeMode = ubuPrivilegeModeFlag;
    const isUbuFreshyEvent = isUbuPrivilegeMode || input.eventId === 'event-ubu-freshy-2026';

    const orderItemsToInsert: {
      id: string;
      ticketTypeId: string;
      ticketTypeName: string;
      unitPrice: number;
      quantity: number;
      subtotal: number;
    }[] = [];

    let orderSubtotal = 0;
    let discountAmount = 0;

    for (const item of sanitizedItems) {
      const tt = ticketTypeMap.get(item.ticketTypeId);
      if (!tt) {
        throw new Error('ไม่พบข้อมูลประเภทบัตร');
      }

      const regularUnitPrice = Number(tt.price);
      let actualUnitPrice = regularUnitPrice;
      let itemDiscount = 0;

      if (hasUbuPrivilege) {
        const isStudentTicket = Boolean(tt.isStudentPrivilege) || isUbuFreshyEvent;
        if (isStudentTicket) {
          actualUnitPrice = tt.studentPrice != null
            ? Number(tt.studentPrice)
            : (regularUnitPrice === 150 ? 99 : Math.round(regularUnitPrice * 0.85));
          itemDiscount = roundHalfUp((regularUnitPrice - actualUnitPrice) * item.quantity);
          if (regularUnitPrice === 150 && actualUnitPrice === 99) {
            itemDiscount = roundHalfUp((150 - 99) * item.quantity);
          }
        }
      }

      orderSubtotal = roundHalfUp(orderSubtotal + regularUnitPrice * item.quantity);
      discountAmount = roundHalfUp(discountAmount + itemDiscount);

      orderItemsToInsert.push({
        id: randomUUID(),
        ticketTypeId: tt.id,
        ticketTypeName: tt.name,
        unitPrice: actualUnitPrice,
        quantity: item.quantity,
        subtotal: roundHalfUp(actualUnitPrice * item.quantity),
      });
    }

    // D-37 general UBU discount fallback if not using per-ticket student privilege
    if (hasUbuPrivilege && discountAmount === 0 && !isUbuFreshyEvent) {
      let remainingDiscountTickets = 2;
      const discountedItems: typeof orderItemsToInsert = [];
      for (const item of [...orderItemsToInsert].sort((a, b) => b.unitPrice - a.unitPrice)) {
        const discountedQuantity = Math.min(item.quantity, remainingDiscountTickets);
        const fullPriceQuantity = item.quantity - discountedQuantity;
        const discountPerTicket = Math.round(item.unitPrice * 0.15);
        if (discountedQuantity > 0) {
          const discountedUnitPrice = roundHalfUp(item.unitPrice - discountPerTicket);
          discountedItems.push({ ...item, quantity: discountedQuantity, unitPrice: discountedUnitPrice, subtotal: roundHalfUp(discountedUnitPrice * discountedQuantity) });
          discountAmount = roundHalfUp(discountAmount + discountPerTicket * discountedQuantity);
          remainingDiscountTickets -= discountedQuantity;
        }
        if (fullPriceQuantity > 0) {
          discountedItems.push({ ...item, id: discountedQuantity > 0 ? randomUUID() : item.id, quantity: fullPriceQuantity, subtotal: roundHalfUp(item.unitPrice * fullPriceQuantity) });
        }
      }
      orderItemsToInsert.splice(0, orderItemsToInsert.length, ...discountedItems);
    }

    const discountedTicketSubtotal = Math.max(0, roundHalfUp(orderSubtotal - discountAmount));

    // 6. Calculate exact customer fee and total (AC-69, D-134, D-135: 5% or 6% with Math.ceil whole Baht)
    let { fee: customerFee, total: orderTotal } = calculateCustomerFee(
      customerFeeMode,
      customerFeeRate,
      totalTickets,
      discountedTicketSubtotal,
    );
    if (customerFeeMode === 'percentage') {
      customerFee = Math.ceil(customerFee);
      orderTotal = roundHalfUp(discountedTicketSubtotal + customerFee);
    }

    // 7 & 8. Atomic quota check + Order/OrderItem insert (AC-13, AC-14, AC-61)
    const orderId = `ORD-${randomUUID().toUpperCase()}`;
    const expiresAt = new Date(now.getTime() + RESERVATION_HOLD_SECONDS * 1000);

    if (sanitizedItems.length === 1) {
      const singleItem = sanitizedItems[0];
      const tt = ticketTypeMap.get(singleItem.ticketTypeId);
      if (!tt) {
        throw new Error('ไม่พบข้อมูลประเภทบัตร');
      }
      const totalTypeQuota = Number(tt.quota);
      const checkInsertRes = await client.query<{ held: number }>(
        `WITH held_calc AS (
           SELECT GREATEST(0,
             coalesce(sum(oi.quantity), 0)::int -
             coalesce((SELECT count(*)::int FROM tickets t WHERE t."ticketTypeId" = $20 AND t.status = 'refunded'), 0)
           )::int AS held
           FROM order_items oi
           JOIN orders o ON oi."orderId" = o.id
           WHERE oi."ticketTypeId" = $20
             AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $19))
         ),
         ins_order AS (
           INSERT INTO orders (
             id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
             status, subtotal, "discountAmount", "customerFee", total, "customerFeeMode", "customerFeeRate",
             "ubuPrivilegeApplied", "organizerFeeRate", "organizerFeePrivilegeRate", "organizerFeeMode",
             "reservedAt", "expiresAt", "createdAt", "updatedAt"
           )
           SELECT $1, $2, $3, $4, $5, $6, 'reserved', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $17, $17
           FROM held_calc
           WHERE ($21::int - held_calc.held) >= $22::int
           RETURNING id
         ),
         ins_items AS (
           INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
           SELECT items.id, ins_order.id, items."ticketTypeId", items.quantity, items."unitPrice", items.subtotal
           FROM ins_order
           CROSS JOIN UNNEST($23::text[], $24::text[], $25::int[], $26::numeric[], $27::numeric[])
             AS items(id, "ticketTypeId", quantity, "unitPrice", subtotal)
         )
         SELECT held FROM held_calc`,
        [
          orderId,
          input.eventId,
          input.sessionId,
          verifiedSession.email,
          verifiedSession.name,
          verifiedSession.phone,
          orderSubtotal,
          discountAmount,
          customerFee,
          orderTotal,
          customerFeeMode,
          customerFeeRate,
          hasUbuPrivilege && discountAmount > 0,
          organizerFeeRate,
          organizerFeePrivilegeRate,
          organizerFeeMode,
          now,
          expiresAt,
          now,
          singleItem.ticketTypeId,
          totalTypeQuota,
          singleItem.quantity,
          orderItemsToInsert.map(i => i.id),
          orderItemsToInsert.map(i => i.ticketTypeId),
          orderItemsToInsert.map(i => i.quantity),
          orderItemsToInsert.map(i => i.unitPrice),
          orderItemsToInsert.map(i => i.subtotal),
        ],
      );
      const held = Number(checkInsertRes.rows[0]?.held) || 0;
      const availableQuota = totalTypeQuota - held;
      if (availableQuota < singleItem.quantity) {
        throw new Error(`บัตรประเภท "${tt.name}" เหลือไม่เพียงพอ (เหลือ ${Math.max(0, availableQuota)} ใบ)`);
      }
    } else {
      const heldByType = new Map<string, number>();
      const heldRes = await client.query<{ ticketTypeId: string; held: number }>(
        `SELECT tt.id AS "ticketTypeId",
                GREATEST(0,
                  COALESCE((
                    SELECT SUM(oi.quantity)::int
                    FROM order_items oi
                    JOIN orders o ON oi."orderId" = o.id
                    WHERE oi."ticketTypeId" = tt.id
                      AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $2))
                  ), 0) - COALESCE((
                    SELECT COUNT(*)::int
                    FROM tickets t
                    WHERE t."ticketTypeId" = tt.id AND t.status = 'refunded'
                  ), 0)
                )::int AS held
         FROM UNNEST($1::text[]) AS tt(id)`,
        [ticketTypeIds, now],
      );
      for (const r of heldRes.rows) {
        heldByType.set(r.ticketTypeId, Number(r.held) || 0);
      }

      for (const item of sanitizedItems) {
        const tt = ticketTypeMap.get(item.ticketTypeId);
        if (!tt) {
          throw new Error('ไม่พบข้อมูลประเภทบัตร');
        }
        const held = heldByType.get(item.ticketTypeId) ?? 0;
        const availableQuota = Number(tt.quota) - held;
        if (availableQuota < item.quantity) {
          throw new Error(`บัตรประเภท "${tt.name}" เหลือไม่เพียงพอ (เหลือ ${Math.max(0, availableQuota)} ใบ)`);
        }
      }

      await client.query(
        `WITH ins_order AS (
           INSERT INTO orders (
             id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
             status, subtotal, "discountAmount", "customerFee", total, "customerFeeMode", "customerFeeRate",
             "ubuPrivilegeApplied", "organizerFeeRate", "organizerFeePrivilegeRate", "organizerFeeMode",
             "reservedAt", "expiresAt", "createdAt", "updatedAt"
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'reserved', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19)
         )
         INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
         SELECT id, $1, "ticketTypeId", quantity, "unitPrice", subtotal
         FROM UNNEST($20::text[], $21::text[], $22::int[], $23::numeric[], $24::numeric[])
           AS items(id, "ticketTypeId", quantity, "unitPrice", subtotal)`,
        [
          orderId,
          input.eventId,
          input.sessionId,
          verifiedSession.email,
          verifiedSession.name,
          verifiedSession.phone,
          orderSubtotal,
          discountAmount,
          customerFee,
          orderTotal,
          customerFeeMode,
          customerFeeRate,
          hasUbuPrivilege && discountAmount > 0,
          organizerFeeRate,
          organizerFeePrivilegeRate,
          organizerFeeMode,
          now,
          expiresAt,
          now,
          orderItemsToInsert.map(i => i.id),
          orderItemsToInsert.map(i => i.ticketTypeId),
          orderItemsToInsert.map(i => i.quantity),
          orderItemsToInsert.map(i => i.unitPrice),
          orderItemsToInsert.map(i => i.subtotal),
        ],
      );
    }

    return {
      id: orderId,
      eventId: input.eventId,
      sessionId: input.sessionId,
      buyerEmail: verifiedSession.email,
      buyerName: verifiedSession.name,
      buyerPhone: verifiedSession.phone,
      status: 'reserved',
      items: orderItemsToInsert,
      subtotal: orderSubtotal,
      discountAmount,
      customerFeeMode,
      customerFeeRate,
      customerFee,
      total: orderTotal,
      reservedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  });
}

export async function expireOrders(pool: Pool, now = new Date()): Promise<number> {
  await ensureReservationSchema(pool);
  const res = await pool.query(
    `UPDATE orders
     SET status = 'expired', "updatedAt" = $1
     WHERE status = 'reserved' AND "expiresAt" <= $1`,
    [now],
  );
  return res.rowCount ?? 0;
}

export async function getTicketTypeAvailableQuota(
  pool: Pool,
  ticketTypeId: string,
  now = new Date(),
): Promise<{ totalQuota: number; heldQuota: number; availableQuota: number }> {
  await ensureReservationSchema(pool);
  const res = await pool.query(
    `SELECT tt.quota as "totalQuota",
            GREATEST(0, COALESCE(
              (SELECT SUM(oi.quantity)::int
               FROM order_items oi
               JOIN orders o ON oi."orderId" = o.id
               WHERE oi."ticketTypeId" = tt.id
                 AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $2))
              ), 0
            ) - COALESCE(
              (SELECT COUNT(*)::int
               FROM tickets t
               WHERE t."ticketTypeId" = tt.id AND t.status = 'refunded'
              ), 0
            )) as "heldQuota"
     FROM ticket_types tt
     WHERE tt.id = $1`,
    [ticketTypeId, now],
  );
  if (res.rowCount === 0) {
    throw new Error('ไม่พบประเภทบัตรที่ระบุ');
  }
  const totalQuota = Number(res.rows[0].totalQuota) || 0;
  const heldQuota = Number(res.rows[0].heldQuota) || 0;
  const availableQuota = Math.max(0, totalQuota - heldQuota);
  return { totalQuota, heldQuota, availableQuota };
}

export async function getOrderReservation(
  pool: Pool,
  orderId: string,
  now = new Date(),
): Promise<OrderReservationDetail | null> {
  await ensureReservationSchema(pool);

  const orderRes = await pool.query(
    `SELECT o.id, o."eventId", o."sessionId", o."buyerEmail", o."buyerName", o."buyerPhone",
            o.status, o.subtotal, o."discountAmount", o."customerFee", o.total, o."customerFeeMode", o."customerFeeRate",
            o."reservedAt", o."expiresAt",
            e.title as "eventTitle", e.location as "eventLocation", e."posterUrl" as "eventPosterUrl",
            s."startTime" as "sessionStartTime", s."admissionStartTime" as "sessionAdmissionStartTime"
     FROM orders o
     JOIN events e ON o."eventId" = e.id
     JOIN event_sessions s ON o."sessionId" = s.id
     WHERE o.id = $1`,
    [orderId],
  );

  if (orderRes.rowCount === 0) return null;
  const o = orderRes.rows[0];

  let status = o.status as 'reserved' | 'paid' | 'expired' | 'cancelled';
  const expiresAt = new Date(o.expiresAt);
  if (status === 'reserved' && expiresAt.getTime() <= now.getTime()) {
    status = 'expired';
    // Transition to expired atomically in DB only when actually past deadline (AC-71)
    await pool.query(
      `UPDATE orders
       SET status = 'expired', "updatedAt" = $2
       WHERE id = $1 AND status = 'reserved' AND "expiresAt" <= $2`,
      [orderId, now],
    );
  }

  const itemsRes = await pool.query(
    `SELECT oi.id, oi."ticketTypeId", tt.name as "ticketTypeName",
            oi."unitPrice", oi.quantity, oi.subtotal
     FROM order_items oi
     JOIN ticket_types tt ON oi."ticketTypeId" = tt.id
     WHERE oi."orderId" = $1`,
    [orderId],
  );

  return {
    id: o.id,
    eventId: o.eventId,
    sessionId: o.sessionId,
    eventTitle: o.eventTitle || undefined,
    eventLocation: o.eventLocation || undefined,
    eventPosterUrl: o.eventPosterUrl || undefined,
    sessionStartTime: o.sessionStartTime ? new Date(o.sessionStartTime).toISOString() : undefined,
    sessionAdmissionStartTime: o.sessionAdmissionStartTime ? new Date(o.sessionAdmissionStartTime).toISOString() : undefined,
    buyerEmail: o.buyerEmail,
    buyerName: o.buyerName,
    buyerPhone: o.buyerPhone,
    status,
    items: itemsRes.rows.map(r => ({
      id: r.id,
      ticketTypeId: r.ticketTypeId,
      ticketTypeName: r.ticketTypeName,
      unitPrice: Number(r.unitPrice),
      quantity: Number(r.quantity),
      subtotal: Number(r.subtotal),
    })),
    subtotal: Number(o.subtotal),
    discountAmount: Number(o.discountAmount) || 0,
    customerFeeMode: o.customerFeeMode as CustomerFeeMode,
    customerFeeRate: Number(o.customerFeeRate),
    customerFee: Number(o.customerFee),
    total: Number(o.total),
    reservedAt: o.reservedAt.toISOString(),
    expiresAt: o.expiresAt.toISOString(),
  };
}
