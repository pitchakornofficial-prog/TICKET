import { isPayloadTooLargeError, payloadTooLargeResponse, readOptionalBoundedJson } from '@/server/http-body';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { rejectRefundRequest } from '@/server/refunds';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id: refundRequestId } = await params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (session?.user.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้น' },
      { status: 403 },
    );
  }

  const pool = getDatabasePool();
  try {
    const body = await readOptionalBoundedJson<{ rejectionReason: string }>(request, 32 * 1024);
    const rejectionReason = body.rejectionReason || '';

    const result = await rejectRefundRequest(pool, {
      refundRequestId,
      rejectionReason,
      reviewerUserId: session.user.id,
      reviewerName: session.user.name,
      reviewerRole: session.user.role,
    });

    if (!result.success) {
      const status =
        result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;

      return Response.json({ message: result.error, code: result.code }, { status });
    }

    // Trigger refund rejected email notification asynchronously
    try {
      const reqInfo = await pool.query<{
        orderId: string;
        buyerName: string;
        buyerEmail: string;
        eventTitle: string;
      }>(
        `SELECT rr."orderId", o."buyerName", o."buyerEmail", e.title as "eventTitle"
         FROM refund_requests rr
         JOIN orders o ON rr."orderId" = o.id
         JOIN events e ON o."eventId" = e.id
         WHERE rr.id = $1`,
        [refundRequestId],
      );
      if (reqInfo.rows[0]) {
        const row = reqInfo.rows[0];
        const { readScenarioEmailTemplate, interpolateEmailVariables } = await import('@/server/email-master-template');
        const { emailTransport } = await import('@/server/email');

        const template = await readScenarioEmailTemplate(pool, 'refund_rejected');
        const vars = {
          order_id: row.orderId,
          buyer_name: row.buyerName,
          concert_name: row.eventTitle,
          reject_reason: rejectionReason || 'ไม่ผ่านเกณฑ์การพิจารณาตามนโยบายของผู้จัดงาน',
        };

        const subject = template.subject
          ? interpolateEmailVariables(template.subject, vars)
          : `[TICKET] ผลการพิจารณาคำขอคืนเงิน - คำสั่งซื้อ ${row.orderId}`;
        const greeting = template.greetingText
          ? interpolateEmailVariables(template.greetingText, vars)
          : `เรียนคุณ ${row.buyerName},`;
        const bodyText = template.bodyText
          ? interpolateEmailVariables(template.bodyText, vars).replace(/\n/g, '<br/>')
          : `ตามที่ท่านได้ยื่นคำขอคืนเงินสำหรับคำสั่งซื้อ ${row.orderId} ทีมงานได้ตรวจสอบคำขอของท่านแล้ว ขอเรียนแจ้งว่าไม่สามารถอนุมัติการคืนเงินในครั้งนี้ได้ เนื่องจากเหตุผลดังต่อไปนี้:`;
        const footerNotes = template.footerNotes
          ? interpolateEmailVariables(template.footerNotes, vars).replace(/\n/g, '<br/>')
          : 'ทั้งนี้ บัตรคอนเสิร์ตในคำสั่งซื้อของท่านยังคงมีผลสมบูรณ์และสามารถนำไปใช้เข้าชมการแสดงได้ตามปกติ';

        const origin = new URL(request.url).origin;
        const buttonUrl = template.primaryButtonUrl
          ? interpolateEmailVariables(template.primaryButtonUrl, vars)
          : `/orders/${row.orderId}/success?tab=tickets`;
        const safeButtonUrl = buttonUrl.startsWith('http') ? buttonUrl : `${origin}${buttonUrl}`;

        const html = `
          <div style="font-family: sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
            <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; padding: 24px;">
              <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #0f172a;">${template.headerTitle || 'TICKET - ผลการพิจารณาคำขอคืนเงิน'}</h2>
              <p style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">${greeting}</p>
              <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
                ${bodyText}
              </div>
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <div style="font-size: 13px; font-weight: 600; color: #991b1b; margin-bottom: 6px;">สถานะ: ไม่สามารถอนุมัติการคืนเงินได้</div>
                <div style="font-size: 13px; color: #7f1d1d; line-height: 1.5;">${vars.reject_reason}</div>
              </div>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${safeButtonUrl}" style="background-color: ${template.primaryButtonColor || '#0f172a'}; color: ${template.primaryButtonTextColor || '#ffffff'}; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
                  ${template.primaryButtonText || 'เปิดดูบัตรคอนเสิร์ตของฉัน'}
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
          text: `ผลการพิจารณาคำขอคืนเงินสำหรับคำสั่งซื้อ ${row.orderId}: ไม่สามารถอนุมัติได้เนื่องจาก ${vars.reject_reason}`,
          html,
        });
      }
    } catch (emailErr) {
      console.warn('Failed to send refund rejected email:', emailErr);
    }

    return Response.json(
      { message: 'ปฏิเสธคำขอคืนเงินเรียบร้อยแล้ว' },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการปฏิเสธการคืนเงิน', { defaultStatus: 500 });
  }
}
