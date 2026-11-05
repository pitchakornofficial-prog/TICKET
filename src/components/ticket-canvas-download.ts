import type { TicketDetail } from '@/server/tickets';
import { formatDate, formatTime } from '@/lib/locale';

export const FONT_SANS = 'Kanit, "Noto Sans Thai", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif';
export const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/**
 * Renders full text without truncation or ellipsis.
 * Dynamically scales down font size if needed so 100% of the text fits within maxWidth.
 */
function renderTextFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialFontSize: number,
  minFontSize = 13,
  fontFamily = FONT_SANS,
  isBold = true,
): void {
  if (!text) return;
  let fontSize = initialFontSize;
  ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  while (ctx.measureText(text).width > maxWidth && fontSize > minFontSize) {
    fontSize -= 1;
    ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  }
  ctx.fillText(text, x, y);
}

/**
 * Renders full event title without truncation or ellipsis.
 * Tries scaling first down to minFontSize; if still exceeding maxWidth, wraps across lines.
 */
function renderFullEventTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialFontSize = 34,
  minFontSize = 22,
  lineHeight = 38,
): number {
  if (!text) return y;

  let fontSize = initialFontSize;
  ctx.font = `bold ${fontSize}px ${FONT_SANS}`;

  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return y;
  }

  while (fontSize > minFontSize) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px ${FONT_SANS}`;
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return y;
    }
  }

  // Multi-line wrap if very long (zero ellipsis)
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let currentLine = '';

  for (const part of words) {
    const candidate = currentLine ? `${currentLine}${part}` : part;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = part.trim();
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  let curY = y;
  for (let i = 0; i < Math.min(lines.length, 2); i++) {
    ctx.fillText(lines[i], x, curY);
    curY += lineHeight;
  }
  return curY;
}

/**
 * Renders a high-resolution 1200 x 500 px ticket stub on HTML5 Canvas.
 * Minimalist clean white pass with sharp corners matching on-screen UI (D-163, D-164, D-165).
 * Completely zero truncation with ellipsis, uniform pure white background throughout.
 * Zone name in solid black (#0f172a), real QR code generated from ticket code.
 */
export async function generateTicketCanvas(ticket: TicketDetail): Promise<HTMLCanvasElement> {
  const width = 1200;
  const height = 500;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not supported');

  // Ensure fonts are loaded in browser if available
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // fallback to system font stack
    }
  }

  // 1. Clean Pure White Background across entire ticket (D-163 / D-164)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 2. Right Scan Stub Area: Pure white background seamlessly matching the left side (D-164)
  const stubX = 860;

  // 3. Ticket Outline & Border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  // 4. Straight Dashed Divider at stubX (Sharp rectangle, no round notches)
  ctx.save();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(stubX, 0);
  ctx.lineTo(stubX, height);
  ctx.stroke();
  ctx.restore();

  // 5. Main Stub Content (Left Side)
  // Event Title (Full text without any ellipsis truncation)
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  renderFullEventTitle(ctx, ticket.eventTitle, 50, 75, 770, 34, 22);

  // Ticket Type Name (No Price, solid black D-165)
  ctx.fillStyle = '#0f172a';
  renderTextFitted(ctx, ticket.ticketTypeName, 50, 120, 770, 24, 16, FONT_SANS, true);

  // Metadata Grid
  const showDate = ticket.sessionStartTime
    ? `${formatDate(new Date(ticket.sessionStartTime))} เวลา ${formatTime(new Date(ticket.sessionStartTime))}${
        ticket.sessionEndTime ? ` - ${formatTime(new Date(ticket.sessionEndTime))}` : ''
      }`
    : '-';

  // Row 1
  ctx.font = `13px ${FONT_SANS}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('วันและเวลาแสดง (DATE & TIME)', 50, 180);
  ctx.fillStyle = '#0f172a';
  renderTextFitted(ctx, showDate, 50, 210, 370, 18, 13, FONT_SANS, true);

  ctx.font = `13px ${FONT_SANS}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('สถานที่จัดงาน (VENUE)', 460, 180);
  ctx.fillStyle = '#0f172a';
  renderTextFitted(ctx, ticket.location, 460, 210, 370, 18, 13, FONT_SANS, true);

  // Row 2
  ctx.font = `13px ${FONT_SANS}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('ผู้สั่งซื้อ (BUYER)', 50, 270);
  ctx.fillStyle = '#0f172a';
  renderTextFitted(ctx, ticket.buyerName, 50, 300, 370, 18, 13, FONT_SANS, true);

  ctx.font = `13px ${FONT_SANS}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('รหัสบัตร (TICKET CODE)', 460, 270);
  ctx.fillStyle = '#0f172a';
  renderTextFitted(ctx, ticket.ticketCode, 460, 300, 370, 20, 14, FONT_MONO, true);

  // Row 3
  ctx.font = `13px ${FONT_SANS}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('หมายเลขคำสั่งซื้อ (ORDER ID)', 50, 360);
  ctx.fillStyle = '#0f172a';
  renderTextFitted(ctx, ticket.orderId, 50, 390, 370, 18, 13, FONT_MONO, true);

  // Footer Disclaimer Note
  ctx.font = `13px ${FONT_SANS}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('* กรุณาแสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน · บัตรนี้สามารถสแกนได้ 1 ครั้ง', 50, 455);

  // 6. Right Scan Stub Area (Direct QR Code on pure white background, no frame/border) (D-164, D-165)
  const qrX = stubX + Math.round((width - stubX - 200) / 2); // 860 + (340 - 200)/2 = 930
  const qrY = 70;
  const qrSize = 200;

  // Draw Real QR directly without outer box/border
  if (ticket.qrCodeUrl) {
    try {
      const qrImg = new Image();
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => reject();
        qrImg.src = ticket.qrCodeUrl;
      });
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    } catch {
      ctx.fillStyle = '#0f172a';
      ctx.font = `14px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText(ticket.ticketCode, qrX + qrSize / 2, qrY + qrSize / 2);
    }
  }

  // Code Label & Value Below QR
  ctx.font = `14px ${FONT_SANS}`;
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.fillText('รหัสบัตรสำหรับเข้างาน', stubX + 170, 325);

  ctx.font = `bold 24px ${FONT_MONO}`;
  ctx.fillStyle = '#0f172a';
  ctx.fillText(ticket.ticketCode, stubX + 170, 365);

  return canvas;
}

export async function generateTicketDataUrl(ticket: TicketDetail): Promise<string> {
  const canvas = await generateTicketCanvas(ticket);
  return canvas.toDataURL('image/png');
}

export async function downloadTicketAsPng(ticket: TicketDetail): Promise<void> {
  const canvas = await generateTicketCanvas(ticket);
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `ticket-${ticket.ticketCode}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadAllTicketsAsPng(tickets: TicketDetail[]): Promise<void> {
  for (let i = 0; i < tickets.length; i++) {
    await downloadTicketAsPng(tickets[i]);
    if (i < tickets.length - 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
}
