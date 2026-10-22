import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { emailTransport, type EmailTransport } from './email.ts';
import { ensureTicketSchema, getOrderTickets, type TicketDetail } from './tickets.ts';
import { ensureReservationSchema } from './reservation.ts';
import { formatBaht } from '../lib/locale.ts';

export interface TicketEmailDeliveryRecord {
  id: string;
  orderId: string;
  recipientEmail: string;
  status: 'sent' | 'failed' | 'pending';
  messageId?: string;
  error?: string;
  retryCount: number;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
  buyerName?: string;
  eventTitle?: string;
}

export async function ensureTicketDeliverySchema(pool: Pool): Promise<void> {
  await ensureTicketSchema(pool);
  await ensureReservationSchema(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_email_deliveries (
      id TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      "recipientEmail" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      "messageId" TEXT,
      error TEXT,
      "retryCount" INTEGER NOT NULL DEFAULT 0,
      "sentAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_order ON ticket_email_deliveries("orderId");
    CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_status ON ticket_email_deliveries(status);
  `);
}

/**
 * Builds email HTML & text content for ticket delivery (AC-20).
 * Strict adherence to D-14: zero emojis, Thai language, Kanit font / clean sans-serif.
 */
export function buildTicketEmailContent(
  orderId: string,
  buyerName: string,
  eventTitle: string,
  location: string,
  sessionStartTime: string,
  tickets: TicketDetail[],
  orderUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `[TICKET] บัตรคอนเสิร์ตและ QR Code สำหรับเข้างาน - คำสั่งซื้อ ${orderId}`;

  const ticketsHtml = tickets
    .map(
      (t, idx) => `
      <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 16px; background-color: #ffffff;">
        <div style="font-size: 13px; color: #64748b; margin-bottom: 4px;">ใบที่ ${idx + 1} จาก ${tickets.length}</div>
        <div style="font-size: 16px; font-weight: bold; color: #1848ed; margin-bottom: 4px;">${t.ticketTypeName}</div>
        <div style="font-size: 14px; margin-bottom: 12px;">ราคา: ${formatBaht(t.ticketPrice)}</div>
        <div style="text-align: center; margin: 12px 0;">
          <img src="${t.qrCodeUrl}" alt="Ticket QR ${t.ticketCode}" width="160" height="160" style="display: inline-block; border-radius: 4px; border: 1px solid #cbd5e1;" />
        </div>
        <div style="font-family: monospace; font-size: 14px; font-weight: bold; text-align: center; color: #0f172a;">
          รหัสบัตร: ${t.ticketCode}
        </div>
      </div>
    `,
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="font-family: sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background-color: #1848ed; color: #ffffff; padding: 20px 24px;">
          <h1 style="margin: 0; font-size: 20px; font-weight: bold;">TICKET - บัตรคอนเสิร์ตของคุณ</h1>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 15px; margin-top: 0;">เรียนคุณ <strong>${buyerName}</strong>,</p>
          <p style="font-size: 14px; color: #334155; line-height: 1.5;">
            การชำระเงินสำหรับคำสั่งซื้อ <strong>${orderId}</strong> เสร็จสมบูรณ์แล้ว ระบบได้ออกบัตรคอนเสิร์ตจำนวน <strong>${tickets.length} ใบ</strong> ให้ท่านเรียบร้อยแล้ว
          </p>

          <div style="background-color: #f1f5f9; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <div style="font-size: 15px; font-weight: bold; margin-bottom: 6px;">${eventTitle}</div>
            <div style="font-size: 13px; color: #475569; margin-bottom: 4px;">สถานที่: ${location}</div>
            <div style="font-size: 13px; color: #475569;">รอบการแสดง: ${new Date(sessionStartTime).toLocaleString('th-TH')}</div>
          </div>

          <h3 style="font-size: 16px; margin: 24px 0 12px; color: #0f172a;">รายการบัตรสำหรับเข้างาน (QR Code แยกเฉพาะใบ)</h3>
          ${ticketsHtml}

          <div style="text-align: center; margin: 28px 0 16px;">
            <a href="${orderUrl}" style="background-color: #1848ed; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px; display: inline-block;">
              เปิดดูบัตรผ่านเว็บไซต์
            </a>
          </div>

          <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            * บัตรทุกใบในคำสั่งซื้อนี้ใช้ข้อมูลผู้ซื้อเดียวกัน กรุณาแสดง QR Code ต่อทีมสแกน ณ ประตูทางเข้าในวันจัดงาน<br>
            อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const ticketsText = tickets
    .map(
      (t, idx) =>
        `ใบที่ ${idx + 1}: ${t.ticketTypeName} (รหัสบัตร: ${t.ticketCode}) - ราคา ${formatBaht(t.ticketPrice)}`,
    )
    .join('\n');

  const text = `
TICKET - บัตรคอนเสิร์ตของคุณ
คำสั่งซื้อ: ${orderId}
ผู้ซื้อ: ${buyerName}

งาน: ${eventTitle}
สถานที่: ${location}
รอบการแสดง: ${new Date(sessionStartTime).toLocaleString('th-TH')}

รายการบัตร (${tickets.length} ใบ):
${ticketsText}

สามารถเปิดดูบัตรและ QR Code ได้ที่ลิงก์:
${orderUrl}
  `.trim();

  return { subject, html, text };
}

export async function sendOrderTicketsEmail(
  pool: Pool,
  orderId: string,
  options?: {
    transport?: EmailTransport;
    now?: Date;
    baseUrl?: string;
  },
): Promise<TicketEmailDeliveryRecord> {
  await ensureTicketDeliverySchema(pool);
  const now = options?.now || new Date();
  const transport = options?.transport || emailTransport;
  const baseUrl = options?.baseUrl || 'http://127.0.0.1:3000';

  // 1. Fetch order details
  const orderRes = await pool.query(
    `SELECT o.id, o."buyerName", o."buyerEmail", o."buyerPhone", o.status, o."eventId",
            e.title as "eventTitle", e.location,
            es."startTime" as "sessionStartTime"
     FROM orders o
     JOIN events e ON o."eventId" = e.id
     JOIN event_sessions es ON o."sessionId" = es.id
     WHERE o.id = $1`,
    [orderId],
  );

  if (orderRes.rowCount === 0) {
    throw new Error('ไม่พบคำสั่งซื้อที่ระบุ');
  }

  const order = orderRes.rows[0];

  // 2. Fetch issued tickets
  const tickets = await getOrderTickets(pool, orderId);
  if (tickets.length === 0) {
    throw new Error('คำสั่งซื้อนี้ยังไม่มีบัตรที่ออกสำเร็จ จึงไม่สามารถจัดส่งอีเมลบัตรได้');
  }

  // Check if email was already sent successfully for this order (AC-18 idempotency)
  const existingDelivery = await getOrderEmailDelivery(pool, orderId);
  if (existingDelivery?.status === 'sent') {
    return existingDelivery;
  }

  const deliveryId = `EML-${randomUUID().slice(0, 8).toUpperCase()}`;
  const orderUrl = `${baseUrl}/my-tickets?orderId=${order.id}`;

  const { subject, html, text } = buildTicketEmailContent(
    orderId,
    order.buyerName,
    order.eventTitle,
    order.location,
    order.sessionStartTime,
    tickets,
    orderUrl,
  );

  try {
    const sendResult = await transport.send({
      from: 'TICKET <tickets@ticket.invalid>',
      to: order.buyerEmail,
      subject,
      html,
      text,
    });

    await pool.query(
      `INSERT INTO ticket_email_deliveries (
         id, "orderId", "recipientEmail", status, "messageId", "sentAt", "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, 'sent', $4, $5, $5, $5)`,
      [deliveryId, orderId, order.buyerEmail, sendResult.id, now],
    );

    return {
      id: deliveryId,
      orderId,
      recipientEmail: order.buyerEmail,
      status: 'sent',
      messageId: sendResult.id,
      retryCount: 0,
      sentAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      buyerName: order.buyerName,
      eventTitle: order.eventTitle,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งอีเมล';

    // Record delivery failure in database without rolling back order or tickets (AC-75)
    await pool.query(
      `INSERT INTO ticket_email_deliveries (
         id, "orderId", "recipientEmail", status, error, "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, 'failed', $4, $5, $5)`,
      [deliveryId, orderId, order.buyerEmail, errorMsg, now],
    );

    return {
      id: deliveryId,
      orderId,
      recipientEmail: order.buyerEmail,
      status: 'failed',
      error: errorMsg,
      retryCount: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      buyerName: order.buyerName,
      eventTitle: order.eventTitle,
    };
  }
}

/**
 * Retries a failed ticket email delivery without modifying order or tickets (AC-75).
 */
export async function retryTicketEmailDelivery(
  pool: Pool,
  deliveryId: string,
  options?: {
    transport?: EmailTransport;
    now?: Date;
    baseUrl?: string;
  },
): Promise<TicketEmailDeliveryRecord> {
  await ensureTicketDeliverySchema(pool);
  const now = options?.now || new Date();
  const transport = options?.transport || emailTransport;
  const baseUrl = options?.baseUrl || 'http://127.0.0.1:3000';

  const res = await pool.query(
    `SELECT d.id, d."orderId", d."recipientEmail", d.status, d."retryCount",
            o."buyerName", o."eventId", e.title as "eventTitle", e.location,
            es."startTime" as "sessionStartTime"
     FROM ticket_email_deliveries d
     JOIN orders o ON d."orderId" = o.id
     JOIN events e ON o."eventId" = e.id
     JOIN event_sessions es ON o."sessionId" = es.id
     WHERE d.id = $1`,
    [deliveryId],
  );

  if (res.rowCount === 0) {
    throw new Error('ไม่พบรายการประวัติการส่งอีเมลที่ระบุ');
  }

  const delivery = res.rows[0];
  const tickets = await getOrderTickets(pool, delivery.orderId);

  const orderUrl = `${baseUrl}/events/${delivery.eventId}`;
  const { subject, html, text } = buildTicketEmailContent(
    delivery.orderId,
    delivery.buyerName,
    delivery.eventTitle,
    delivery.location,
    delivery.sessionStartTime,
    tickets,
    orderUrl,
  );

  const nextRetryCount = (delivery.retryCount || 0) + 1;

  try {
    const sendResult = await transport.send({
      from: 'TICKET <tickets@ticket.invalid>',
      to: delivery.recipientEmail,
      subject,
      html,
      text,
    });

    await pool.query(
      `UPDATE ticket_email_deliveries
       SET status = 'sent', "messageId" = $2, error = NULL, "retryCount" = $3, "sentAt" = $4, "updatedAt" = $4
       WHERE id = $1`,
      [deliveryId, sendResult.id, nextRetryCount, now],
    );

    return {
      id: deliveryId,
      orderId: delivery.orderId,
      recipientEmail: delivery.recipientEmail,
      status: 'sent',
      messageId: sendResult.id,
      retryCount: nextRetryCount,
      sentAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      buyerName: delivery.buyerName,
      eventTitle: delivery.eventTitle,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลองส่งใหม่';

    await pool.query(
      `UPDATE ticket_email_deliveries
       SET status = 'failed', error = $2, "retryCount" = $3, "updatedAt" = $4
       WHERE id = $1`,
      [deliveryId, errorMsg, nextRetryCount, now],
    );

    return {
      id: deliveryId,
      orderId: delivery.orderId,
      recipientEmail: delivery.recipientEmail,
      status: 'failed',
      error: errorMsg,
      retryCount: nextRetryCount,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      buyerName: delivery.buyerName,
      eventTitle: delivery.eventTitle,
    };
  }
}

export async function listFailedEmailDeliveries(pool: Pool): Promise<TicketEmailDeliveryRecord[]> {
  await ensureTicketDeliverySchema(pool);
  const res = await pool.query(
    `SELECT d.id, d."orderId", d."recipientEmail", d.status, d."messageId", d.error,
            d."retryCount", d."sentAt", d."createdAt", d."updatedAt",
            o."buyerName", e.title as "eventTitle"
     FROM ticket_email_deliveries d
     JOIN orders o ON d."orderId" = o.id
     JOIN events e ON o."eventId" = e.id
     WHERE d.status = 'failed'
     ORDER BY d."createdAt" DESC`,
  );

  return res.rows.map(r => ({
    id: r.id,
    orderId: r.orderId,
    recipientEmail: r.recipientEmail,
    status: r.status as 'failed',
    messageId: r.messageId || undefined,
    error: r.error || undefined,
    retryCount: Number(r.retryCount),
    sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : undefined,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
    buyerName: r.buyerName,
    eventTitle: r.eventTitle,
  }));
}

export async function getOrderEmailDelivery(
  pool: Pool,
  orderId: string,
): Promise<TicketEmailDeliveryRecord | null> {
  await ensureTicketDeliverySchema(pool);
  const res = await pool.query(
    `SELECT d.id, d."orderId", d."recipientEmail", d.status, d."messageId", d.error,
            d."retryCount", d."sentAt", d."createdAt", d."updatedAt"
     FROM ticket_email_deliveries d
     WHERE d."orderId" = $1
     ORDER BY d."createdAt" DESC
     LIMIT 1`,
    [orderId],
  );

  if (res.rowCount === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    orderId: r.orderId,
    recipientEmail: r.recipientEmail,
    status: r.status as 'sent' | 'failed' | 'pending',
    messageId: r.messageId || undefined,
    error: r.error || undefined,
    retryCount: Number(r.retryCount),
    sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : undefined,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}
