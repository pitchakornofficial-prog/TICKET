import { isPayloadTooLargeError, payloadTooLargeResponse, readOptionalBoundedJson } from '@/server/http-body';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { recordManualRefundTransfer } from '@/server/refunds';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  try {
    const { id } = await params;
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'owner') {
      return Response.json(
        { message: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์บันทึกการโอนเงินคืน' },
        { status: 403 },
      );
    }

    const body = await readOptionalBoundedJson<{ transferredAmount: number | string; transferProofKey: string; transferProofUrl: string; transferNote: string; transferredAt: string }>(request, 32 * 1024);
    const transferredAmount = body.transferredAmount !== undefined
      ? Number(body.transferredAmount)
      : undefined;
    const transferProofKey = typeof body.transferProofKey === 'string' ? body.transferProofKey : undefined;
    const transferProofUrl = typeof body.transferProofUrl === 'string' ? body.transferProofUrl : undefined;
    const transferNote = typeof body.transferNote === 'string' ? body.transferNote : undefined;
    const transferredAt = body.transferredAt ? new Date(body.transferredAt) : undefined;

    const result = await recordManualRefundTransfer(getDatabasePool(), {
      refundRequestId: id,
      transferredAmount,
      transferProofKey,
      transferProofUrl,
      transferNote,
      reviewerUserId: actor.id,
      reviewerName: actor.name,
      reviewerRole: actor.role,
      transferredAt,
    });

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404
        : result.code === 'FORBIDDEN' ? 403
        : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    // Trigger refund approved email notification asynchronously
    try {
      const pool = getDatabasePool();
      const reqInfo = await pool.query<{
        orderId: string;
        buyerName: string;
        buyerEmail: string;
        amount: number;
        bankName: string | null;
        bankAccountNumber: string | null;
      }>(
        `SELECT rr."orderId", o."buyerName", o."buyerEmail", rr.amount,
                rr."bankName", rr."bankAccountNumber"
         FROM refund_requests rr
         JOIN orders o ON rr."orderId" = o.id
         WHERE rr.id = $1`,
        [id],
      );
      if (reqInfo.rows[0]) {
        const row = reqInfo.rows[0];
        const { readScenarioEmailTemplate, interpolateEmailVariables } = await import('@/server/email-master-template');
        const { emailTransport } = await import('@/server/email');

        const template = await readScenarioEmailTemplate(pool, 'refund_approved');
        const vars = {
          order_id: row.orderId,
          buyer_name: row.buyerName,
          refund_amount: Number(row.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }),
          bank_name: row.bankName || 'บัญชีธนาคารของผู้ซื้อ',
          account_suffix: row.bankAccountNumber ? `xxx-${row.bankAccountNumber.slice(-4)}` : 'xxx',
          transferred_at: new Date().toLocaleDateString('th-TH'),
        };

        const subject = template.subject
          ? interpolateEmailVariables(template.subject, vars)
          : `[TICKET] แจ้งผลการโอนเงินคืนสำเร็จ - คำสั่งซื้อ ${row.orderId}`;
        const greeting = template.greetingText
          ? interpolateEmailVariables(template.greetingText, vars)
          : `เรียนคุณ ${row.buyerName},`;
        const bodyText = template.bodyText
          ? interpolateEmailVariables(template.bodyText, vars).replace(/\n/g, '<br/>')
          : `ระบบได้ดำเนินการโอนเงินคืนสำหรับคำสั่งซื้อ ${row.orderId} จำนวน ${vars.refund_amount} บาท เข้าบัญชีของท่านเรียบร้อยแล้ว`;
        const footerNotes = template.footerNotes
          ? interpolateEmailVariables(template.footerNotes, vars).replace(/\n/g, '<br/>')
          : 'ยอดเงินจะเข้าบัญชีตามรอบทำการของธนาคาร หากมีข้อสงสัยโปรดติดต่อฝ่ายบริการลูกค้า';

        const origin = new URL(request.url).origin;
        const buttonUrl = template.primaryButtonUrl
          ? interpolateEmailVariables(template.primaryButtonUrl, vars)
          : `/orders/${row.orderId}/refund`;
        const safeButtonUrl = buttonUrl.startsWith('http') ? buttonUrl : `${origin}${buttonUrl}`;

        const html = `
          <div style="font-family: sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
            <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; padding: 24px;">
              <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #0f172a;">${template.headerTitle || 'TICKET - แจ้งผลการคืนเงิน'}</h2>
              <p style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">${greeting}</p>
              <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
                ${bodyText}
              </div>
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <div style="font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 8px;">สถานะ: โอนเงินคืนสำเร็จเรียบร้อยแล้ว</div>
                <div style="font-size: 13px; color: #334155; line-height: 1.6;">
                  <div>ยอดเงินคืน: <strong style="color: #166534;">${vars.refund_amount} บาท</strong></div>
                  <div>ธนาคาร: <strong>${vars.bank_name}</strong> (${vars.account_suffix})</div>
                </div>
              </div>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${safeButtonUrl}" style="background-color: ${template.primaryButtonColor || '#0f172a'}; color: ${template.primaryButtonTextColor || '#ffffff'}; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
                  ${template.primaryButtonText || 'ตรวจสอบประวัติคำสั่งซื้อ'}
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
          text: `แจ้งผลการคืนเงินสำหรับคำสั่งซื้อ ${row.orderId} จำนวน ${vars.refund_amount} บาท โอนสำเร็จแล้ว`,
          html,
        });
      }
    } catch (emailErr) {
      console.warn('Failed to send refund approved email:', emailErr);
    }

    return Response.json(
      {
        message: result.alreadyCompleted
          ? 'คำขอคืนเงินนี้ได้รับการบันทึกการโอนเรียบร้อยแล้ว'
          : 'บันทึกการโอนเงินคืนสำเร็จ ปรับสถานะเป็นโอนสำเร็จ (Completed) เรียบร้อยแล้ว',
        result,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการบันทึกการโอนเงินคืน', { defaultStatus: 500 });
  }
}
