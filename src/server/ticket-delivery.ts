import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  DEFAULT_EMAIL_MASTER_TEMPLATE,
  type EmailTemplateState,
  interpolateEmailVariables,
  normalizeEmailSectionOrder,
  readEmailMasterTemplate,
} from './email-master-template.ts';
import { emailTransport, type EmailTransport } from './email.ts';
import { createOrderTicketAccessToken } from './order-access-token.ts';
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

function ticketOrderUrl(order: { id: string; buyerEmail: string; buyerPhone: string }, override?: string): string {
  const rawBaseUrl =
    override ||
    process.env.BETTER_AUTH_URL ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3000');
  if (!rawBaseUrl) throw new Error('BETTER_AUTH_URL is required for ticket email links');
  const url = new URL(rawBaseUrl);
  if (
    process.env.NODE_ENV === 'production' &&
    (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error('Ticket email links require a public HTTPS origin');
  }
  const baseUrl = url.origin;
  const accessToken = createOrderTicketAccessToken(order.id, order.buyerEmail, order.buyerPhone);
  return `${baseUrl}/orders/${order.id}/success?tab=tickets&token=${encodeURIComponent(accessToken)}`;
}

const ticketDeliverySchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureTicketDeliverySchema(pool: Pool): Promise<void> {
  const existing = ticketDeliverySchemaPromises.get(pool);
  if (existing) return existing;
  const promise = (async () => {
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
  })().catch((err) => {
    ticketDeliverySchemaPromises.delete(pool);
    throw err;
  });
  ticketDeliverySchemaPromises.set(pool, promise);
  await promise;
}

const thLocaleDateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function sanitizeEmailUrl(raw: string | null | undefined, options?: { allowDataImage?: boolean }): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  if (options?.allowDataImage && /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
    if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopback)) {
      return parsed.toString();
    }
  } catch {
    return '';
  }

  return '';
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
  template?: EmailTemplateState,
): { subject: string; html: string; text: string } {
  const activeTemplate = template || DEFAULT_EMAIL_MASTER_TEMPLATE;
  const formattedSessionStart = thLocaleDateTimeFormatter.format(new Date(sessionStartTime));

  let baseUrl = '';
  try {
    const safeOrderOrigin = sanitizeEmailUrl(orderUrl);
    if (safeOrderOrigin && (safeOrderOrigin.startsWith('https://') || safeOrderOrigin.startsWith('http://'))) {
      baseUrl = new URL(safeOrderOrigin).origin;
    }
  } catch {
    baseUrl = '';
  }

  const firstTicket = tickets[0];
  const vars = {
    concert_name: eventTitle,
    buyer_name: buyerName,
    buyer_email: firstTicket?.buyerEmail || '',
    order_id: orderId,
    total_tickets: tickets.length,
    session_date: formattedSessionStart.split(' ')[0] || '',
    session_time: formattedSessionStart.split(' ')[1] || '',
    location,
    ticket_code: tickets.map(t => t.ticketCode).join(', '),
    ticket_type: tickets.map(t => t.ticketTypeName).join(', '),
    ticket_price: tickets.map(t => formatBaht(t.ticketPrice)).join(', '),
  };

  const rawSubject = activeTemplate.subject
    ? interpolateEmailVariables(activeTemplate.subject, vars)
    : `[TICKET] บัตรคอนเสิร์ตและ QR Code สำหรับเข้างาน - คำสั่งซื้อ ${orderId}`;
  const subject = rawSubject.includes(orderId) ? rawSubject : `[TICKET] ${rawSubject} - คำสั่งซื้อ ${orderId}`;

  const safeOrderId = escapeHtml(orderId);
  const safeBuyerName = escapeHtml(buyerName);
  const safeEventTitle = escapeHtml(eventTitle);
  const safeLocation = escapeHtml(location);
  const safeFormattedSessionStart = escapeHtml(formattedSessionStart);
  const safeSubject = escapeHtml(subject);
  const safeOrderUrl = escapeHtml(sanitizeEmailUrl(orderUrl) || '#');

<<<<<<< HEAD
  const greetingHtml = activeTemplate.greetingText
    ? escapeHtml(interpolateEmailVariables(activeTemplate.greetingText, vars))
    : `เรียนคุณ <strong>${safeBuyerName}</strong>,`;
=======
  let baseUrl = '';
  try {
    const safeOrderOrigin = sanitizeEmailUrl(orderUrl);
    if (safeOrderOrigin && (safeOrderOrigin.startsWith('https://') || safeOrderOrigin.startsWith('http://'))) {
      baseUrl = new URL(safeOrderOrigin).origin;
    }
  } catch {
    baseUrl = '';
  }

  const ticketsHtml = tickets
    .map((t, idx) => {
      const safeTicketTypeName = escapeHtml(t.ticketTypeName);
      const safeTicketCode = escapeHtml(t.ticketCode);
      const safeQrUrl = baseUrl
        ? `${escapeHtml(baseUrl)}/api/public/tickets/${encodeURIComponent(t.id)}/qr`
        : escapeHtml(sanitizeEmailUrl(t.qrCodeUrl, { allowDataImage: true }));
      const qrBlock = safeQrUrl
        ? `<div style="text-align: center; margin: 12px 0;">
          <img src="${safeQrUrl}" alt="Ticket QR ${safeTicketCode}" width="160" height="160" style="display: inline-block; border-radius: 8px; background-color: #ffffff; padding: 0; border: none;" />
        </div>`
        : '';
>>>>>>> b980c78410ec9db8785c5cecc11bb7070c8eec73

  const bodyHtml = activeTemplate.bodyText
    ? escapeHtml(interpolateEmailVariables(activeTemplate.bodyText, vars)).replace(/\n/g, '<br/>')
    : `การชำระเงินสำหรับคำสั่งซื้อ <strong>${safeOrderId}</strong> เสร็จสมบูรณ์แล้ว ระบบได้ออกบัตรคอนเสิร์ตจำนวน <strong>${tickets.length} ใบ</strong> ให้ท่านเรียบร้อยแล้ว`;

  const footerNotesHtml = activeTemplate.footerNotes
    ? escapeHtml(interpolateEmailVariables(activeTemplate.footerNotes, vars)).replace(/\n/g, '<br/>')
    : '* บัตรทุกใบในคำสั่งซื้อนี้ใช้ข้อมูลผู้ซื้อเดียวกัน กรุณาแสดง QR Code ต่อทีมสแกน ณ ประตูทางเข้าในวันจัดงาน<br/>อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ';

  const qrSize = activeTemplate.qrSize || 160;
  const isLargeBatch = tickets.length > 20;

  const ticketsHtml = isLargeBatch
    ? ''
    : tickets
        .map((t, idx) => {
          const safeTicketTypeName = escapeHtml(t.ticketTypeName);
          const safeTicketCode = escapeHtml(t.ticketCode);
          const qrImgUrl = baseUrl
            ? `${escapeHtml(baseUrl)}/api/public/tickets/${encodeURIComponent(t.id)}/qr`
            : escapeHtml(sanitizeEmailUrl(t.qrCodeUrl, { allowDataImage: true }));
          const cardImgUrl = baseUrl ? `${escapeHtml(baseUrl)}/api/public/tickets/${encodeURIComponent(t.id)}/image` : '';

          const qrBlock = activeTemplate.showQrCode && qrImgUrl
            ? `<div style="text-align: center; margin: 16px 0 10px;">
                <img src="${qrImgUrl}" alt="Ticket QR ${safeTicketCode}" width="${qrSize}" height="${qrSize}" style="display: inline-block; border-radius: 8px; background-color: #ffffff; padding: 0; border: none;" />
                <div style="font-size: 11px; color: #64748b; margin-top: 6px;">${escapeHtml(activeTemplate.qrHelperText || '* แสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน')}</div>
              </div>`
            : '';

          const downloadCardLink = cardImgUrl
            ? `<div style="text-align: center; margin-top: 10px;">
                <a href="${cardImgUrl}" target="_blank" rel="noreferrer" style="font-size: 12px; color: #0f172a; text-decoration: underline;">
                  ดาวน์โหลดรูปบัตรคอนเสิร์ต (PNG)
                </a>
              </div>`
            : '';

          const isDarkTheme = activeTemplate.ticketCardTheme === 'dark';
          const isBrandTheme = activeTemplate.ticketCardTheme === 'brand';
          const cardBg = isDarkTheme ? '#0f172a' : isBrandTheme ? '#1e3a8a' : '#ffffff';
          const cardBorder = isDarkTheme ? '#1e293b' : isBrandTheme ? '#1d4ed8' : '#e2e8f0';
          const textPrimary = isDarkTheme || isBrandTheme ? '#ffffff' : '#0f172a';
          const textSecondary = isDarkTheme || isBrandTheme ? '#94a3b8' : '#64748b';
          const dividerColor = isDarkTheme || isBrandTheme ? '#334155' : '#e2e8f0';

          return `
          <div style="border: 1px solid ${cardBorder}; border-radius: 8px; margin-bottom: 16px; background-color: ${cardBg}; color: ${textPrimary}; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <!-- Card Top Header -->
            <div style="padding: 12px 18px; border-bottom: 1px solid ${dividerColor}; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.06);">
              <div style="font-size: 12px; font-weight: 500; color: ${textSecondary}; text-transform: uppercase; letter-spacing: 0.5px;">
                บัตรใบที่ ${idx + 1} จาก ${tickets.length}
              </div>
              <div style="font-size: 13px; font-weight: 600; color: #0f172a;">
                ${safeTicketTypeName}
              </div>
            </div>

            <!-- Card Body -->
            <div style="padding: 18px;">
              <div style="font-size: 16px; font-weight: 600; color: ${textPrimary}; margin-bottom: 8px;">
                ${safeEventTitle}
              </div>

              <div style="font-size: 13px; color: ${textSecondary}; line-height: 1.6; margin-bottom: 14px;">
                <div>รอบการแสดง: <strong style="color: ${textPrimary};">${safeFormattedSessionStart}</strong></div>
                <div>สถานที่: <strong style="color: ${textPrimary};">${safeLocation}</strong></div>
                <div>ราคา: <strong style="color: ${textPrimary};">${escapeHtml(formatBaht(t.ticketPrice))}</strong></div>
              </div>

              <!-- Perforated Tear-off divider -->
              <div style="border-top: 1px dashed ${dividerColor}; margin: 14px 0;"></div>

              <!-- QR & Code Section -->
              ${qrBlock}

              <div style="font-family: monospace; font-size: 15px; font-weight: 600; text-align: center; color: ${textPrimary}; letter-spacing: 1px; margin-top: 6px;">
                รหัสบัตร: ${safeTicketCode}
              </div>

              ${downloadCardLink}
            </div>
          </div>
        `;
        })
        .join('');

  const quotaAlertHtml = isLargeBatch
    ? `
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 0 0 16px 0; font-size: 13px; color: #475569; line-height: 1.6;">
        <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">
          คำสั่งซื้อนี้มีบัตรทั้งหมด ${tickets.length} ใบ (เกินโควตาการแสดงผลรูปบัตรในอีเมล 20 ใบ)
        </div>
        <div>
          เพื่อความรวดเร็วและป้องกันอีเมลเกินขนาด ระบบได้สรุปรหัสบัตรทุกใบในตารางด้านล่างนี้ โดยท่านสามารถเปิดดูและดาวน์โหลดรูปบัตรความละเอียดสูงทั้งหมดได้ผ่านเว็บไซต์
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 0 0 20px 0; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
            <th style="padding: 8px 12px; font-weight: 500;">ลำดับ</th>
            <th style="padding: 8px 12px; font-weight: 500;">ประเภทบัตร</th>
            <th style="padding: 8px 12px; font-weight: 500;">รหัสบัตร</th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map((t, idx) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 12px; color: #64748b;">${idx + 1}</td>
              <td style="padding: 8px 12px; font-weight: 500; color: #0f172a;">${escapeHtml(t.ticketTypeName)}</td>
              <td style="padding: 8px 12px; font-family: monospace; color: #0f172a;">${escapeHtml(t.ticketCode)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '';

  const posterUrl = activeTemplate.posterUrl?.trim() || '';
  const showPoster = activeTemplate.showConcertPoster !== false && Boolean(posterUrl);
  const posterBlockHtml = showPoster
    ? `<div style="margin: 0 0 20px 0; overflow: hidden;">
        <img src="${escapeHtml(posterUrl)}" alt="${safeEventTitle}" style="width: 100%; height: 220px; object-fit: cover; object-position: center; display: block;" />
      </div>`
    : '';

  const bodyBlockHtml = `
    <div style="padding: 20px 24px 0;">
      <p style="font-size: 15px; margin-top: 0; font-weight: 600;">${greetingHtml}</p>
      <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
        ${bodyHtml}
      </div>
      <div style="background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; padding: 16px; margin: 20px 0;">
        <div style="font-size: 15px; font-weight: 600; margin-bottom: 6px; color: #0f172a;">${safeEventTitle}</div>
        <div style="font-size: 13px; color: #475569; margin-bottom: 4px;">สถานที่: <strong>${safeLocation}</strong></div>
        <div style="font-size: 13px; color: #475569;">รอบการแสดง: <strong>${safeFormattedSessionStart}</strong></div>
      </div>
    </div>
  `;

  const passesBlockHtml = activeTemplate.showTicketCard
    ? `
      <div style="padding: 20px 24px 0;">
        ${ticketsHtml}
        ${quotaAlertHtml}
      </div>
    `
    : '';

  const sectionOrder = normalizeEmailSectionOrder(activeTemplate.sectionOrder);
  const sectionHtmlMap: Record<'poster' | 'body' | 'pass', string> = {
    poster: posterBlockHtml,
    body: bodyBlockHtml,
    pass: passesBlockHtml,
  };
  const orderedSectionsHtml = sectionOrder.map((key) => sectionHtmlMap[key]).join('');

  const btnAlign = activeTemplate.primaryButtonAlign || 'center';
  const btnTextAlign = btnAlign === 'left' ? 'left' : btnAlign === 'right' ? 'right' : 'center';
  const btnColor = activeTemplate.primaryButtonColor || '#0f172a';
  const btnTextColor = activeTemplate.primaryButtonTextColor || '#ffffff';
  const secBgColor = activeTemplate.secondaryButtonBgColor || '#ffffff';
  const secTextColor = activeTemplate.secondaryButtonTextColor || '#0f172a';
  const secBorderColor = activeTemplate.secondaryButtonBorderColor || '#cbd5e1';

  const secondaryBtnHtml = activeTemplate.showSecondaryButton
    ? `<a href="${activeTemplate.secondaryButtonAction === 'download_all' ? safeOrderUrl : (activeTemplate.secondaryButtonCustomUrl || `${baseUrl}/my-tickets`)}" style="background-color: ${secBgColor}; border: 1px solid ${secBorderColor}; color: ${secTextColor}; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; display: inline-block; margin-left: 8px;">
        ${escapeHtml(activeTemplate.secondaryButtonText || 'ดูรายการบัตรของฉัน')}
      </a>`
    : '';

  const primaryBtnLabel = isLargeBatch
    ? `${activeTemplate.primaryButtonText || 'เปิดดูและดาวน์โหลดบัตรทั้งหมด'} (${tickets.length} ใบ)`
    : (activeTemplate.primaryButtonText || 'เปิดดูบัตรผ่านเว็บไซต์');

  const html = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="utf-8">
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${safeSubject}</title>
    </head>
    <body style="font-family: sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
        <div style="background-color: #ffffff; color: #0f172a; padding: 20px 24px; border-bottom: 1px solid #e2e8f0;">
          <h1 style="margin: 0; font-size: 18px; font-weight: 600;">${escapeHtml(activeTemplate.headerTitle || 'TICKET - บัตรคอนเสิร์ตของคุณ')}</h1>
        </div>
        <div style="padding: 0 0 24px 0;">
          ${orderedSectionsHtml}

          <div style="padding: 0 24px;">
            <div style="text-align: ${btnTextAlign}; margin: 28px 0 16px;">
              <a href="${safeOrderUrl}" style="background-color: ${btnColor}; color: ${btnTextColor}; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
                ${escapeHtml(primaryBtnLabel)}
              </a>
              ${secondaryBtnHtml}
            </div>

            <p style="font-size: 12px; color: #64748b; line-height: 1.6; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              ${footerNotesHtml}
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const ticketsText = isLargeBatch
    ? `${tickets.slice(0, 20).map((t, idx) => `ใบที่ ${idx + 1}: ${t.ticketTypeName} (รหัสบัตร: ${t.ticketCode})`).join('\n')}\n... และบัตรอีก ${tickets.length - 20} ใบ (ดูและดาวน์โหลดบัตรทั้งหมดได้ที่ลิงก์ด้านล่าง)`
    : tickets.map((t, idx) => `ใบที่ ${idx + 1}: ${t.ticketTypeName} (รหัสบัตร: ${t.ticketCode}) - ราคา ${formatBaht(t.ticketPrice)}`).join('\n');

  const text = `
TICKET - บัตรคอนเสิร์ตของคุณ
คำสั่งซื้อ: ${orderId}
ผู้ซื้อ: ${buyerName}

งาน: ${eventTitle}
สถานที่: ${location}
รอบการแสดง: ${formattedSessionStart}

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
    preloadedTickets?: TicketDetail[];
    skipExistingCheck?: boolean;
  },
): Promise<TicketEmailDeliveryRecord> {
  await ensureTicketDeliverySchema(pool);
  const now = options?.now || new Date();
  const transport = options?.transport || emailTransport;

  let order: {
    id: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string;
    eventTitle: string;
    location: string;
    sessionStartTime: string;
  };
  let tickets: TicketDetail[];

  if (options?.preloadedTickets && options.preloadedTickets.length > 0) {
    tickets = options.preloadedTickets;
    const first = tickets[0];
    order = {
      id: orderId,
      buyerName: first.buyerName,
      buyerEmail: first.buyerEmail,
      buyerPhone: first.buyerPhone,
      eventTitle: first.eventTitle,
      location: first.location,
      sessionStartTime: first.sessionStartTime,
    };
  } else {
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

    order = orderRes.rows[0];

    // 2. Fetch issued tickets
    tickets = await getOrderTickets(pool, orderId);
    if (tickets.length === 0) {
      throw new Error('คำสั่งซื้อนี้ยังไม่มีบัตรที่ออกสำเร็จ จึงไม่สามารถจัดส่งอีเมลบัตรได้');
    }
  }

  // Check if email was already sent successfully for this order (AC-18 idempotency)
  if (!options?.skipExistingCheck) {
    const existingDelivery = await getOrderEmailDelivery(pool, orderId);
    if (existingDelivery?.status === 'sent') {
      return existingDelivery;
    }
  }

  const deliveryId = `EML-${randomUUID().slice(0, 8).toUpperCase()}`;
  // Direct ticket view link with signed token so buyer can open ticket straight from email without OTP
  const orderUrl = ticketOrderUrl(
    { id: order.id, buyerEmail: order.buyerEmail, buyerPhone: order.buyerPhone },
    options?.baseUrl,
  );

  const emailTemplate = await readEmailMasterTemplate(pool);
  const { subject, html, text } = buildTicketEmailContent(
    orderId,
    order.buyerName,
    order.eventTitle,
    order.location,
    order.sessionStartTime,
    tickets,
    orderUrl,
    emailTemplate,
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

  const res = await pool.query(
    `SELECT d.id, d."orderId", d."recipientEmail", d.status, d."retryCount", o."buyerPhone",
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

  const orderUrl = ticketOrderUrl(
    { id: delivery.orderId, buyerEmail: delivery.recipientEmail, buyerPhone: delivery.buyerPhone },
    options?.baseUrl,
  );
  const emailTemplate = await readEmailMasterTemplate(pool);
  const { subject, html, text } = buildTicketEmailContent(
    delivery.orderId,
    delivery.buyerName,
    delivery.eventTitle,
    delivery.location,
    delivery.sessionStartTime,
    tickets,
    orderUrl,
    emailTemplate,
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

export async function sendDirectIssuedTicketsEmail(
  pool: Pool,
  orderId: string,
  options?: {
    now?: Date;
    transport?: EmailTransport;
  },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  await ensureTicketDeliverySchema(pool);
  const now = options?.now || new Date();
  const transport = options?.transport || emailTransport;

  const orderRes = await pool.query<{
    id: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string;
    orderSource: string;
    referenceNote: string | null;
    priceDisplayMode: string | null;
    eventTitle: string;
    location: string;
    sessionStartTime: Date;
    sessionEndTime: Date;
  }>(
    `SELECT o.id, o."buyerName", o."buyerEmail", o."buyerPhone", o."orderSource",
            o."referenceNote", o."priceDisplayMode",
            e.title as "eventTitle", e.location,
            es."startTime" as "sessionStartTime", es."endTime" as "sessionEndTime"
     FROM orders o
     JOIN events e ON o."eventId" = e.id
     JOIN event_sessions es ON o."sessionId" = es.id
     WHERE o.id = $1`,
    [orderId],
  );

  if (orderRes.rowCount === 0) {
    throw new Error('ไม่พบรายการออกบัตรที่ระบุ');
  }
  const order = orderRes.rows[0];
  const tickets = await getOrderTickets(pool, orderId);
  if (tickets.length === 0) {
    throw new Error('ไม่พบบัตรในรายการนี้');
  }

  const deliveryId = `EML-${randomUUID().slice(0, 8).toUpperCase()}`;
  const subject = `[TICKET] บัตรคอนเสิร์ต ${order.eventTitle} (รายการออกบัตรตรง #${order.id})`;

  const rawBaseUrl =
    process.env.BETTER_AUTH_URL ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3000');
  let baseUrl = '';
  try {
    if (rawBaseUrl) baseUrl = new URL(rawBaseUrl).origin;
  } catch {
    baseUrl = '';
  }

  const formattedDate = thLocaleDateTimeFormatter.format(new Date(order.sessionStartTime));
  const isLargeBatch = tickets.length > 20;

  let ticketsHtml = '';
  let ticketsText = '';

  if (!isLargeBatch) {
    ticketsHtml = `
      <div style="margin-top: 24px;">
        <h3 style="font-size: 16px; font-weight: 400; color: #0f172a; margin-bottom: 16px;">
          รายการบัตรเข้าชม (${tickets.length} ใบ)
        </h3>
        ${tickets.map((t, idx) => `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <div style="font-size: 13px; color: #64748b; margin-bottom: 4px;">บัตรใบที่ ${idx + 1} จาก ${tickets.length}</div>
            <div style="font-size: 16px; font-weight: 400; color: #0f172a; margin-bottom: 4px;">${escapeHtml(t.ticketTypeName)}</div>
            <div style="font-family: monospace; font-size: 14px; font-weight: 400; color: #2563eb; margin-bottom: 12px;">รหัสบัตร: ${escapeHtml(t.ticketCode)}</div>
            <div style="text-align: center; margin: 8px 0;">
              <img src="${baseUrl ? `${escapeHtml(baseUrl)}/api/public/tickets/${encodeURIComponent(t.id)}/qr` : t.qrCodeUrl}" alt="Ticket QR" width="160" height="160" style="display: inline-block; border-radius: 8px; background-color: #ffffff; padding: 0; border: none;" />
              <div style="font-family: monospace; font-size: 10px; color: #64748b; margin-top: 6px;">${escapeHtml(t.ticketCode)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    ticketsText = tickets.map((t, idx) => `[ใบที่ ${idx + 1}] ประเภท: ${t.ticketTypeName} | รหัสบัตร: ${t.ticketCode}`).join('\n');
  } else {
    ticketsHtml = `
      <div style="margin-top: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
        <h3 style="font-size: 16px; font-weight: 400; color: #0f172a; margin-bottom: 8px;">
          สรุปรายการบัตรที่ออกตรง (${tickets.length} ใบ)
        </h3>
        <p style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 16px;">
          เนื่องจากรายการนี้มีจำนวนบัตรมากกว่า 20 ใบ เพื่อป้องกันอีเมลเกินขนาด ระบบได้จัดเตรียมไฟล์รหัสบัตรและรูปภาพการ์ดบัตรแบบครบชุด ท่านสามารถเข้าสู่ระบบหลังบ้านเพื่อดาวน์โหลดไฟล์ .zip ได้ทันที
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="border-bottom: 2px solid #cbd5e1; text-align: left;">
              <th style="padding: 6px 8px;">ลำดับ</th>
              <th style="padding: 6px 8px;">ประเภทบัตร</th>
              <th style="padding: 6px 8px;">รหัสบัตร</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.map((t, idx) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; color: #64748b;">${idx + 1}</td>
                <td style="padding: 6px 8px; font-weight: 400; color: #0f172a;">${escapeHtml(t.ticketTypeName)}</td>
                <td style="padding: 6px 8px; font-family: monospace; color: #2563eb;">${escapeHtml(t.ticketCode)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    ticketsText = tickets.map((t, idx) => `${idx + 1}. ${t.ticketTypeName} - รหัส: ${t.ticketCode}`).join('\n');
  }

  const html = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background-color: #0f172a; padding: 20px 24px; color: #ffffff;">
          <h1 style="font-size: 20px; font-weight: 400; margin: 0;">TICKET</h1>
          <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">ระบบจำหน่ายบัตรคอนเสิร์ต</div>
        </div>
        <div style="padding: 24px;">
          <div style="display: inline-block; background-color: #e0f2fe; color: #0369a1; font-size: 12px; font-weight: 400; padding: 4px 10px; border-radius: 9999px; margin-bottom: 12px;">
            รายการออกบัตรตรง (Direct Issuance)
          </div>
          <h2 style="font-size: 18px; font-weight: 400; color: #0f172a; margin: 0 0 16px 0;">
            ${escapeHtml(order.eventTitle)}
          </h2>
          <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; line-height: 1.6;">
            <div><strong>หมายเลขรายการ:</strong> ${escapeHtml(order.id)}</div>
            <div><strong>ผู้รับมอบบัตร:</strong> ${escapeHtml(order.buyerName)}</div>
            <div><strong>รอบการแสดง:</strong> ${escapeHtml(formattedDate)}</div>
            <div><strong>สถานที่จัดงาน:</strong> ${escapeHtml(order.location)}</div>
            ${order.referenceNote ? `<div><strong>หมายเหตุอ้างอิง:</strong> ${escapeHtml(order.referenceNote)}</div>` : ''}
          </div>
          ${ticketsHtml}
        </div>
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b;">
          อีเมลนี้ถูกส่งโดยระบบอัตโนมัติของ TICKET เพื่อยืนยันการจัดสรรบัตรตรง
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
TICKET - รายการออกบัตรตรง
คอนเสิร์ต: ${order.eventTitle}
หมายเลขรายการ: ${order.id}
ผู้รับมอบ: ${order.buyerName}
รอบการแสดง: ${formattedDate}
สถานที่: ${order.location}
${order.referenceNote ? `หมายเหตุ: ${order.referenceNote}\n` : ''}
จำนวนบัตร: ${tickets.length} ใบ

${ticketsText}
  `.trim();

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

    return { success: true, messageId: sendResult.id };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการจัดส่งอีเมล';
    await pool.query(
      `INSERT INTO ticket_email_deliveries (
         id, "orderId", "recipientEmail", status, error, "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, 'failed', $4, $5, $5)`,
      [deliveryId, orderId, order.buyerEmail, errorMsg, now],
    );
    return { success: false, error: errorMsg };
  }
}
