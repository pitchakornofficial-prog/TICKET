import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { safeRevalidateTag } from '@/server/cache';
import { revokeDirectTickets } from '@/server/direct-tickets';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id } = await props.params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น (403)' }, { status: 403 });
  }

  let body: { ticketIds?: string[]; reason?: string } = {};
  try {
    body = await readBoundedJson(request, 32 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
  }

  const pool = auth.options.database as Pool;

  try {
    const result = await revokeDirectTickets(pool, {
      orderId: id,
      ticketIds: body.ticketIds,
      revokedByUserId: session.user.id,
      reason: body.reason,
    });

    safeRevalidateTag('events');

    // Trigger ticket revoked email notification asynchronously
    try {
      const orderInfo = await pool.query<{
        buyerName: string;
        buyerEmail: string;
        eventTitle: string;
      }>(
        `SELECT o."buyerName", o."buyerEmail", e.title as "eventTitle"
         FROM orders o
         JOIN events e ON o."eventId" = e.id
         WHERE o.id = $1`,
        [id],
      );
      if (orderInfo.rows[0]) {
        const row = orderInfo.rows[0];
        const { readScenarioEmailTemplate, interpolateEmailVariables } = await import('@/server/email-master-template');
        const { emailTransport } = await import('@/server/email');

        const template = await readScenarioEmailTemplate(pool, 'ticket_revoked');
        const vars = {
          concert_name: row.eventTitle,
          buyer_name: row.buyerName,
          ticket_codes: result.releasedTicketCodes.join(', ') || '-',
          revoke_reason: body.reason || 'การเพิกถอนสิทธิ์บัตรตามคำสั่งของผู้ดูแลระบบ',
        };

        const subject = template.subject
          ? interpolateEmailVariables(template.subject, vars)
          : `[TICKET] แจ้งการเพิกถอนสิทธิ์บัตรคอนเสิร์ต ${row.eventTitle}`;
        const greeting = template.greetingText
          ? interpolateEmailVariables(template.greetingText, vars)
          : `เรียนคุณ ${row.buyerName},`;
        const bodyText = template.bodyText
          ? interpolateEmailVariables(template.bodyText, vars).replace(/\n/g, '<br/>')
          : `ขอเรียนแจ้งให้ทราบว่า บัตรคอนเสิร์ต ${row.eventTitle} ของท่านได้ถูกเพิกถอนสิทธิ์เรียบร้อยแล้ว เนื่องจาก ${vars.revoke_reason}`;
        const footerNotes = template.footerNotes
          ? interpolateEmailVariables(template.footerNotes, vars).replace(/\n/g, '<br/>')
          : 'รหัส QR Code เดิมจะไม่สามารถนำมาสแกนผ่านประตูทางเข้าได้อีกต่อไป หากท่านมีข้อสงสัย โปรดติดต่อฝ่ายบริการลูกค้า';

        const origin = new URL(request.url).origin;
        const buttonUrl = template.primaryButtonUrl
          ? interpolateEmailVariables(template.primaryButtonUrl, vars)
          : '/contact';
        const safeButtonUrl = buttonUrl.startsWith('http') ? buttonUrl : `${origin}${buttonUrl}`;

        const html = `
          <div style="font-family: sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
            <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; padding: 24px;">
              <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #0f172a;">${template.headerTitle || 'TICKET - แจ้งการเพิกถอนสิทธิ์บัตรคอนเสิร์ต'}</h2>
              <p style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">${greeting}</p>
              <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
                ${bodyText}
              </div>
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <div style="font-size: 13px; font-weight: 600; color: #991b1b; margin-bottom: 6px;">บัตรที่ถูกยกเลิกสิทธิ์: ${vars.ticket_codes}</div>
                <div style="font-size: 13px; color: #7f1d1d; line-height: 1.5;">เหตุผล: ${vars.revoke_reason}</div>
              </div>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${safeButtonUrl}" style="background-color: ${template.primaryButtonColor || '#0f172a'}; color: ${template.primaryButtonTextColor || '#ffffff'}; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
                  ${template.primaryButtonText || 'ติดต่อฝ่ายบริการลูกค้า'}
                </a>
              </div>
              <div style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 24px; line-height: 1.6;">
                ${footerNotes}
              </div>
            </div>
          </div>
        `;

        await emailTransport.send({
          from: 'TICKET <tickets@ticket.invalid>',
          to: row.buyerEmail,
          subject,
          text: `แจ้งการเพิกถอนสิทธิ์บัตร ${vars.ticket_codes} งาน ${row.eventTitle}`,
          html,
        });
      }
    } catch (emailErr) {
      console.warn('Failed to send ticket revoked email:', emailErr);
    }

    return Response.json(
      {
        ok: true,
        revokedCount: result.revokedCount,
        releasedTicketCodes: result.releasedTicketCodes,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการยกเลิกบัตร', { defaultStatus: 400 });
  }
}
