import { getAuth } from '@/server/auth';
import { assertSameOrigin } from '@/server/origin';
import { emailTransport } from '@/server/email';
import {
  DEFAULT_EMAIL_MASTER_TEMPLATE,
  EMAIL_SCENARIOS,
  type EmailScenarioKey,
  interpolateEmailVariables,
  parseEmailMasterTemplate,
} from '@/server/email-master-template';
import { buildTicketEmailContent, escapeHtml, sanitizeEmailUrl } from '@/server/ticket-delivery';
import { readBoundedJson } from '@/server/upload-quota';
import type { TicketDetail } from '@/server/tickets';

export const runtime = 'nodejs';

function buildGenericScenarioEmailContent(
  scenarioKey: EmailScenarioKey,
  templateState: typeof DEFAULT_EMAIL_MASTER_TEMPLATE,
  origin: string,
): { subject: string; html: string; text: string } {
  const scenarioDef = EMAIL_SCENARIOS[scenarioKey] || EMAIL_SCENARIOS.ticket_delivery;
  const sampleData = { ...scenarioDef.sampleData };

  const rawSubject = templateState.subject
    ? interpolateEmailVariables(templateState.subject, sampleData)
    : `[TICKET] ${scenarioDef.name}`;
  const subject = rawSubject.startsWith('[TICKET]') ? rawSubject : `[TICKET] ${rawSubject}`;

  const greeting = templateState.greetingText
    ? interpolateEmailVariables(templateState.greetingText, sampleData)
    : `เรียนคุณ ${sampleData.buyer_name || sampleData.user_name || 'ลูกค้า'},`;

  const body = templateState.bodyText
    ? interpolateEmailVariables(templateState.bodyText, sampleData)
    : scenarioDef.description;

  const footer = templateState.footerNotes
    ? interpolateEmailVariables(templateState.footerNotes, sampleData)
    : 'อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ';

  const rawBtnUrl = templateState.primaryButtonUrl
    ? interpolateEmailVariables(templateState.primaryButtonUrl, sampleData)
    : '/';
  const fullBtnUrl = rawBtnUrl.startsWith('http') ? rawBtnUrl : `${origin}${rawBtnUrl}`;
  const safeBtnUrl = escapeHtml(sanitizeEmailUrl(fullBtnUrl) || '#');

  const btnBg = templateState.primaryButtonColor || '#0f172a';
  const btnColor = templateState.primaryButtonTextColor || '#ffffff';
  const btnText = escapeHtml(templateState.primaryButtonText || 'ดำเนินการ');

  // Scenario-specific body blocks
  let extraHtml = '';
  if (scenarioKey === 'checkout_otp' || scenarioKey === 'lookup_otp') {
    const otpCode = String(sampleData.otp_code || '159019');
    extraHtml = `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
        <div style="font-size:12px;color:#64748b;margin-bottom:8px;font-weight:500;">รหัสยืนยัน OTP (ใช้งานได้ 1 ครั้ง)</div>
        <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0f172a;font-family:monospace;">${escapeHtml(otpCode)}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:8px;">รหัสจะหมดอายุภายใน ${escapeHtml(String(sampleData.expire_minutes || 5))} นาที</div>
      </div>
    `;
  } else if (scenarioKey === 'refund_approved') {
    extraHtml = `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:13px;font-weight:600;color:#166534;margin-bottom:10px;">สถานะ: โอนเงินคืนสำเร็จเรียบร้อยแล้ว</div>
        <table style="width:100%;font-size:12px;color:#334155;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#64748b;">รหัสคำสั่งซื้อ:</td><td style="font-weight:600;text-align:right;">${escapeHtml(String(sampleData.order_id))}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">ยอดเงินคืน:</td><td style="font-weight:600;color:#166534;text-align:right;">${escapeHtml(String(sampleData.refund_amount))} บาท</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">ธนาคารปลายทาง:</td><td style="text-align:right;">${escapeHtml(String(sampleData.bank_name))}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">เลขบัญชี:</td><td style="text-align:right;">${escapeHtml(String(sampleData.account_suffix))}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">วันเวลาที่โอน:</td><td style="text-align:right;">${escapeHtml(String(sampleData.transferred_at))}</td></tr>
        </table>
      </div>
    `;
  } else if (scenarioKey === 'refund_rejected') {
    extraHtml = `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:13px;font-weight:600;color:#991b1b;margin-bottom:6px;">สถานะ: ไม่สามารถอนุมัติการคืนเงินได้</div>
        <div style="font-size:12px;color:#7f1d1d;line-height:1.5;">${escapeHtml(String(sampleData.reject_reason))}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:12px 0;font-size:12px;color:#334155;">
        <strong>หมายเหตุสิทธิ์บัตร:</strong> บัตรคอนเสิร์ตของท่านยังคงมีผลสมบูรณ์และสามารถเข้าชมการแสดงได้ตามปกติ
      </div>
    `;
  } else if (scenarioKey === 'ticket_revoked') {
    extraHtml = `
      <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:13px;font-weight:600;color:#9f1239;margin-bottom:6px;">แจ้งเตือน: บัตรคอนเสิร์ตถูกเพิกถอนสิทธิ์</div>
        <div style="font-size:12px;color:#881337;line-height:1.5;">รหัสบัตรที่ถูกยกเลิก: <strong>${escapeHtml(String(sampleData.ticket_codes))}</strong></div>
        <div style="font-size:11px;color:#9f1239;margin-top:6px;">เหตุผล: ${escapeHtml(String(sampleData.revoke_reason))}</div>
      </div>
    `;
  } else if (scenarioKey === 'event_rescheduled') {
    extraHtml = `
      <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:13px;font-weight:600;color:#92400e;margin-bottom:8px;">ประกาศกำหนดการจัดแสดงใหม่</div>
        <table style="width:100%;font-size:12px;color:#451a03;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#78350f;">กำหนดการเดิม:</td><td style="text-decoration:line-through;text-align:right;">${escapeHtml(String(sampleData.old_date))}</td></tr>
          <tr><td style="padding:4px 0;color:#78350f;font-weight:600;">กำหนดการใหม่:</td><td style="font-weight:700;color:#92400e;text-align:right;">${escapeHtml(String(sampleData.new_date))}</td></tr>
          <tr><td style="padding:4px 0;color:#78350f;">ยื่นขอคืนเงินภายใน:</td><td style="text-align:right;">${escapeHtml(String(sampleData.refund_deadline))}</td></tr>
        </table>
      </div>
    `;
  } else if (scenarioKey === 'organizer_payout') {
    extraHtml = `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:10px;">สรุปยอดการโอนเงินส่วนแบ่งรายได้ (${escapeHtml(String(sampleData.period))})</div>
        <table style="width:100%;font-size:12px;color:#334155;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#64748b;">ยอดขายบัตรรวม:</td><td style="font-weight:600;text-align:right;">${escapeHtml(String(sampleData.gross_sales))} บาท</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">ค่าธรรมเนียมระบบ (5%):</td><td style="color:#b91c1c;text-align:right;">-${escapeHtml(String(sampleData.platform_fee))} บาท</td></tr>
          <tr style="border-top:1px solid #e2e8f0;"><td style="padding:6px 0;font-weight:600;color:#0f172a;">ยอดโอนสุทธิ:</td><td style="padding:6px 0;font-weight:700;color:#166534;font-size:14px;text-align:right;">${escapeHtml(String(sampleData.net_payout))} บาท</td></tr>
        </table>
      </div>
    `;
  } else if (scenarioKey === 'staff_invitation') {
    extraHtml = `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">บทบาทที่ได้รับมอบหมาย</div>
        <div style="font-size:15px;font-weight:600;color:#0f172a;margin-top:4px;">${escapeHtml(String(sampleData.role_thai))}</div>
        <div style="font-size:12px;color:#475569;margin-top:4px;">คอนเสิร์ต: ${escapeHtml(String(sampleData.concert_name))}</div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
    <div style="background:#ffffff;color:#0f172a;padding:16px 20px;border-bottom:1px solid #e2e8f0;font-size:15px;font-weight:600;">
      ${escapeHtml(templateState.headerTitle || 'TICKET')}
    </div>
    <div style="padding:24px 20px;">
      <p style="font-size:15px;font-weight:600;color:#0f172a;margin:0 0 12px 0;">
        ${escapeHtml(greeting)}
      </p>
      <p style="font-size:14px;color:#334155;line-height:1.65;margin:0 0 16px 0;white-space:pre-wrap;">
        ${escapeHtml(body)}
      </p>
      ${extraHtml}
      <div style="text-align:center;margin:24px 0 16px;">
        <a href="${safeBtnUrl}" style="display:inline-block;background:${btnBg};color:${btnColor};padding:11px 22px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none;">
          ${btnText}
        </a>
      </div>
      <div style="font-size:11px;color:#64748b;line-height:1.6;border-top:1px solid #f1f5f9;padding-top:14px;margin-top:20px;white-space:pre-wrap;">
        ${escapeHtml(footer)}
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `${templateState.headerTitle || 'TICKET'}
--------------------------------------------------
${greeting}

${body}

${btnText}: ${fullBtnUrl}

--------------------------------------------------
${footer}`;

  return { subject, html, text };
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'เฉพาะเจ้าของระบบ' }, { status: 403 });
  }

  let input: { toEmail?: string; template?: unknown; scenario?: unknown } = {};
  try {
    input = (await readBoundedJson(request, 1024 * 1024)) as typeof input;
  } catch {
    return Response.json({ message: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const recipient = (typeof input?.toEmail === 'string' && input.toEmail.trim()) || session.user.email;
  const scenarioKey: EmailScenarioKey =
    typeof input?.scenario === 'string' && input.scenario in EMAIL_SCENARIOS
      ? (input.scenario as EmailScenarioKey)
      : 'ticket_delivery';

  const scenarioDef = EMAIL_SCENARIOS[scenarioKey];
  const template =
    parseEmailMasterTemplate(input?.template) || scenarioDef?.defaultTemplate || DEFAULT_EMAIL_MASTER_TEMPLATE;

  const origin = new URL(request.url).origin;

  let subject: string;
  let html: string;
  let text: string;

  if (scenarioKey === 'ticket_delivery') {
    const mockTickets: TicketDetail[] = [
      {
        id: 'TKT-SAMPLE-001',
        orderId: 'ORD-SAMPLE-9999',
        orderItemId: 'OI-SAMPLE-1',
        eventId: 'EVT-SAMPLE',
        sessionId: 'SES-SAMPLE',
        ticketTypeId: 'TT-SAMPLE',
        ticketTypeName: 'VIP Zone A (Seat A-12)',
        ticketPrice: 3500,
        ticketCode: 'TK-SAMPLE-8888-01',
        qrPayload: 'SAMPLE-QR-PAYLOAD-PREVIEW-01',
        qrCodeUrl: 'data:image/svg+xml;utf8,<svg></svg>',
        status: 'valid',
        admissionStatus: 'outside',
        buyerName: session.user.name || 'ผู้ทดสอบระบบ',
        buyerEmail: recipient,
        buyerPhone: '0812345678',
        sessionStartTime: new Date(Date.now() + 86400000 * 14).toISOString(),
        sessionEndTime: new Date(Date.now() + 86400000 * 14 + 10800000).toISOString(),
        location: 'อิมแพ็ค อารีน่า เมืองทองธานี',
        eventTitle: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
        eventPosterUrl: template.posterUrl || 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=80',
        createdAt: new Date().toISOString(),
      },
    ];

    const orderUrl = `${origin}/orders/ORD-SAMPLE-9999/success?tab=tickets`;

    const ticketDeliveryContent = buildTicketEmailContent(
      'ORD-SAMPLE-9999',
      session.user.name || 'ผู้ทดสอบระบบ',
      'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      'อิมแพ็ค อารีน่า เมืองทองธานี',
      mockTickets[0].sessionStartTime,
      mockTickets,
      orderUrl,
      template,
    );
    subject = ticketDeliveryContent.subject;
    html = ticketDeliveryContent.html;
    text = ticketDeliveryContent.text;
  } else {
    const genericContent = buildGenericScenarioEmailContent(scenarioKey, template, origin);
    subject = genericContent.subject;
    html = genericContent.html;
    text = genericContent.text;
  }

  try {
    const res = await emailTransport.send({
      from: 'TICKET <tickets@ticket.invalid>',
      to: recipient,
      subject: `[TEST] ${subject}`,
      html,
      text,
    });

    return Response.json({
      success: true,
      messageId: res.id,
      recipient,
      subject: `[TEST] ${subject}`,
      scenario: scenarioKey,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'ส่งอีเมลทดสอบไม่สำเร็จ';
    return Response.json({ message: errorMsg }, { status: 500 });
  }
}
