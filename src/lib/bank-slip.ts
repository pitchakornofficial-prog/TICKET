/**
 * Utility for generating high-fidelity Thai Mobile Banking Transfer e-Slip SVGs.
 * Adheres to Zero Emojis (D-14) and local-first rendering.
 */

export interface BankSlipData {
  amount: number;
  paidAt?: string | Date | null;
  transferRef?: string | null;
  eventTitle?: string | null;
  senderName?: string | null;
  senderAccount?: string | null;
  receiverName?: string | null;
  receiverAccount?: string | null;
  note?: string | null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateBankSlipSvg(data: BankSlipData): string {
  const amountStr = escapeXml(
    Number(data.amount || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );

  let dateStr = '03 พ.ย. 2569, 14:35 น.';
  if (data.paidAt) {
    try {
      const d = new Date(data.paidAt);
      if (!Number.isNaN(d.getTime())) {
        dateStr = `${d.toLocaleDateString('th-TH', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}, ${d.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
        })} น.`;
      }
    } catch {
      // Keep default
    }
  }
  const safeDateStr = escapeXml(dateStr);

  const sender = escapeXml(data.senderName || 'บจก. ทิกเก็ต เทคโนโลยี (TICKET Platform)');
  const senderAcc = escapeXml(data.senderAccount || 'ธ.กสิกรไทย • xxx-x-xx892-1');
  const receiver = escapeXml(data.receiverName || 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี');
  const receiverAcc = escapeXml(data.receiverAccount || 'ธ.กรุงไทย • xxx-x-xx456-7');
  const refCode = escapeXml(data.transferRef || 'TXN-UBU2026-PAYOUT01');
  const concert = escapeXml(data.eventTitle || 'UBU Freshy Music Fest 2026');
  const note = escapeXml(data.note || 'รอบโอนเงินค่าบัตรจำหน่ายล่วงหน้าสัปดาห์ที่ 1');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 720" width="480" height="720" style="background:#ffffff;border-radius:0;box-shadow:0 8px 24px rgba(0,0,0,0.12);font-family:sans-serif;">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#065f46"/>
    </linearGradient>
    <filter id="cardShadow" x="-10%" y="-5%" width="120%" height="115%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.06"/>
    </filter>
  </defs>

  <!-- Background Base (Square Corners D-202) -->
  <rect width="480" height="720" fill="#ffffff" rx="0"/>

  <!-- Top Decorative Header Strip -->
  <rect x="0" y="0" width="480" height="76" fill="url(#headerGrad)" rx="0"/>

  <!-- Header Brand & Title -->
  <text x="24" y="44" fill="#ffffff" font-size="16" font-weight="700" letter-spacing="1">TICKET BANKING</text>
  <text x="456" y="44" text-anchor="end" fill="#d1fae5" font-size="13" font-weight="600">PromptPay / Transfer</text>

  <!-- Success Status Icon & Title -->
  <circle cx="240" cy="116" r="28" fill="#10b981"/>
  <path d="M228 116l8 8 16-16" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  
  <text x="240" y="170" text-anchor="middle" fill="#0f172a" font-size="22" font-weight="800">โอนเงินสำเร็จ</text>
  <text x="240" y="192" text-anchor="middle" fill="#64748b" font-size="13">${safeDateStr}</text>

  <!-- From / To Route Box -->
  <rect x="28" y="210" width="424" height="136" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>
  
  <!-- From row -->
  <circle cx="50" cy="242" r="7" fill="#2563eb"/>
  <text x="68" y="236" fill="#64748b" font-size="11" font-weight="600">จาก (ผู้โอนเงิน)</text>
  <text x="68" y="253" fill="#0f172a" font-size="12.5" font-weight="700">${sender}</text>
  <text x="68" y="269" fill="#64748b" font-size="11.5">${senderAcc}</text>

  <!-- Route Line connecting dots -->
  <line x1="50" y1="251" x2="50" y2="293" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="2,2"/>
  
  <!-- To row -->
  <circle cx="50" cy="302" r="7" fill="#10b981"/>
  <text x="68" y="296" fill="#64748b" font-size="11" font-weight="600">ไปยัง (ผู้รับเงิน)</text>
  <text x="68" y="313" fill="#0f172a" font-size="12.5" font-weight="700">${receiver}</text>
  <text x="68" y="329" fill="#047857" font-size="11.5" font-weight="600">${receiverAcc}</text>

  <!-- Perforated Divider Line with Cutout Notches -->
  <path d="M0 360 Q14 360 14 370 Q14 380 0 380 Z" fill="#f1f5f9"/>
  <line x1="24" y1="370" x2="456" y2="370" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="5,4"/>
  <path d="M480 360 Q466 360 466 370 Q466 380 480 380 Z" fill="#f1f5f9"/>

  <!-- Net Amount Highlight Section -->
  <text x="240" y="402" text-anchor="middle" fill="#64748b" font-size="13" font-weight="600">จำนวนเงินที่โอน</text>
  <text x="240" y="444" text-anchor="middle" fill="#0f172a" font-size="36" font-weight="800">฿${amountStr}</text>
  
  <rect x="180" y="458" width="120" height="24" rx="12" fill="#ecfdf5"/>
  <text x="240" y="474" text-anchor="middle" fill="#059669" font-size="12" font-weight="600">ค่าธรรมเนียม 0.00 บาท</text>

  <!-- Transaction Details Meta Table -->
  <rect x="28" y="496" width="424" height="126" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>

  <text x="46" y="524" fill="#64748b" font-size="12">คอนเสิร์ต</text>
  <text x="434" y="524" text-anchor="end" fill="#0f172a" font-size="12" font-weight="600">${concert}</text>
  <line x1="46" y1="536" x2="434" y2="536" stroke="#f1f5f9" stroke-width="1"/>

  <text x="46" y="558" fill="#64748b" font-size="12">เลขอ้างอิงสลิปธนาคาร</text>
  <text x="434" y="558" text-anchor="end" fill="#0f172a" font-size="12" font-weight="700" font-family="monospace">${refCode}</text>
  <line x1="46" y1="570" x2="434" y2="570" stroke="#f1f5f9" stroke-width="1"/>

  <text x="46" y="592" fill="#64748b" font-size="12">บันทึกช่วยจำ</text>
  <text x="434" y="592" text-anchor="end" fill="#334155" font-size="12">${note}</text>

  <!-- Bottom Verification Footer & Mini QR Indicator -->
  <rect x="28" y="634" width="424" height="66" rx="8" fill="#ffffff" stroke="#e2e8f0"/>
  
  <!-- Mini Stylized QR Code -->
  <rect x="42" y="643" width="48" height="48" fill="#0f172a" rx="4"/>
  <rect x="46" y="647" width="40" height="40" fill="#ffffff" rx="2"/>
  <rect x="50" y="651" width="14" height="14" fill="#0f172a"/>
  <rect x="68" y="651" width="14" height="14" fill="#0f172a"/>
  <rect x="50" y="669" width="14" height="14" fill="#0f172a"/>
  <rect x="68" y="669" width="14" height="14" fill="#047857"/>

  <text x="104" y="660" fill="#0f172a" font-size="12" font-weight="700">สแกนตรวจสอบสลิป</text>
  <text x="104" y="678" fill="#64748b" font-size="11">หลักฐานการโอนเงินโดยเจ้าของระบบ TICKET ผ่านระบบธนาคาร</text>
</svg>`;
}

export function generateBankSlipSvgDataUrl(data: BankSlipData): string {
  const svg = generateBankSlipSvg(data);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
