import type { TicketDetail } from '@/server/tickets';
import { formatDate, formatTime } from '@/lib/locale';
import { generateCustomQrSvg } from '@/lib/ticket-qr';
import {
  type TicketDesignerState,
  loadLocalMasterTemplate,
} from '@/lib/ticket-master-template-sync';

export const FONT_SANS = 'Kanit, "Noto Sans Thai", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif';
export const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/**
 * Renders full text without truncation or ellipsis.
 * Dynamically scales down font size if needed so 100% of the text fits within maxWidth.
 */
export function renderTextFitted(
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
export function renderFullEventTitle(
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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (r <= 0) {
    if (typeof ctx.rect === 'function') ctx.rect(x, y, w, h);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else if (typeof ctx.arcTo === 'function') {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  } else if (typeof ctx.rect === 'function') {
    ctx.rect(x, y, w, h);
  }
}

/**
 * Renders a high-resolution 1200 x 500 px ticket pass on HTML5 Canvas.
 * Dynamically applies the master ticket template (D-275) with real concert data for all concerts.
 * Completely zero truncation with ellipsis, real QR code derived from ticket code.
 */
export async function generateTicketCanvas(
  ticket: TicketDetail,
  overrideTemplate?: TicketDesignerState,
): Promise<HTMLCanvasElement> {
  const width = 1200;
  const height = 500;
  const scaleFactor = 1200 / 1000; // ratio from designer preview 1000 to canvas 1200

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

  const template = overrideTemplate || loadLocalMasterTemplate();
  const fontFam = template.fontFamily ? `${template.fontFamily}, ${FONT_SANS}` : FONT_SANS;
  const cardRadius = Math.max((typeof template.borderRadius === 'number' ? template.borderRadius : 4) * scaleFactor, 0);

  // Clip canvas if rounded card corners are configured
  if (cardRadius > 0 && typeof ctx.clip === 'function') {
    ctx.save();
    ctx.beginPath();
    drawRoundedRect(ctx, 0, 0, width, height, cardRadius);
    ctx.clip();
  }

  const tryDrawBackgroundImage = async (url: string): Promise<boolean> => {
    if (!url || typeof Image === 'undefined') return false;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = url;
      });
      ctx.drawImage(img, 0, 0, width, height);
      return true;
    } catch {
      return false;
    }
  };

  const fallbackEventImage = ticket.ticketTemplateUrl || ticket.eventPosterUrl || '';

  // 1. Background rendering
  if (template.bgType === 'solid') {
    const isDefaultBlankWhite =
      template.presetId === 'classic-white' &&
      !template.bgImageUrl &&
      (template.bgColor || '#ffffff').toLowerCase() === '#ffffff';
    const drewFallback = isDefaultBlankWhite && fallbackEventImage
      ? await tryDrawBackgroundImage(fallbackEventImage)
      : false;
    if (!drewFallback) {
      ctx.fillStyle = template.bgColor || '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
  } else if (template.bgType === 'gradient') {
    const rad = ((template.gradientAngle ?? 135) * Math.PI) / 180;
    const x2 = width * Math.abs(Math.cos(rad));
    const y2 = height * Math.abs(Math.sin(rad));
    const grad = ctx.createLinearGradient(0, 0, x2, y2);
    grad.addColorStop(0, template.gradientStart || '#ffffff');
    grad.addColorStop(1, template.gradientEnd || '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (template.bgType === 'image') {
    const drewPrimary = template.bgImageUrl
      ? await tryDrawBackgroundImage(template.bgImageUrl)
      : false;
    const drewFallback = !drewPrimary && fallbackEventImage
      ? await tryDrawBackgroundImage(fallbackEventImage)
      : false;
    if (!drewPrimary && !drewFallback) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    const drewFallback = fallbackEventImage
      ? await tryDrawBackgroundImage(fallbackEventImage)
      : false;
    if (!drewFallback) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
  }

  // 2. Darkness Overlay
  if (template.bgOverlayDarkness > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${template.bgOverlayDarkness / 100})`;
    ctx.fillRect(0, 0, width, height);
  }

  // 3. Ticket Outline & Border
  const borderWidth = template.borderWidth > 0 ? template.borderWidth * scaleFactor : 2;
  const borderColor = (template.borderWidth > 0 && template.borderColor && template.borderColor !== 'transparent')
    ? template.borderColor
    : '#e2e8f0';

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  if (cardRadius > 0 && typeof ctx.beginPath === 'function') {
    ctx.beginPath();
    drawRoundedRect(ctx, borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth, cardRadius);
    ctx.stroke();
  } else {
    ctx.strokeRect(1, 1, width - 2, height - 2);
  }

  // 4. Straight Divider (Tear Line) at stubX
  const tearLineX = typeof template.tearLineX === 'number' ? template.tearLineX : 720;
  const stubX = Math.round(tearLineX * scaleFactor);

  if (template.tearLineStyle !== 'none') {
    ctx.save();
    ctx.strokeStyle = template.tearLineColor || '#cbd5e1';
    ctx.lineWidth = 2;
    if (template.tearLineStyle === 'dashed') ctx.setLineDash([8, 8]);
    else if (template.tearLineStyle === 'dotted') ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(stubX, 0);
    ctx.lineTo(stubX, height);
    ctx.stroke();
    ctx.restore();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // 5. Elements rendering with live concert ticket data
  const elements = template.elements || {};

  // Brand Logo
  const logo = elements.brandLogo;
  if (logo?.visible) {
    const logoX = logo.x * scaleFactor;
    const logoY = logo.y * scaleFactor;
    ctx.fillStyle = logo.color || '#0f172a';
    ctx.font = `bold 16px ${fontFam}`;
    ctx.fillText(logo.text || 'TICKET', logoX + 24, logoY);
    if (logo.secondaryText) {
      ctx.fillStyle = logo.secondaryColor || '#64748b';
      ctx.font = `10px ${fontFam}`;
      ctx.fillText(logo.secondaryText, logoX + 92, logoY + 4);
    }
  }

  // Event Title (Full text without any ellipsis truncation)
  const title = elements.eventTitle;
  if (title?.visible) {
    const titleX = title.x * scaleFactor;
    const titleY = title.y * scaleFactor;
    const titleWidth = Math.max(stubX - titleX - 40, 400);
    const initialFs = Math.round((title.fontSize || 26) * scaleFactor);
    ctx.fillStyle = title.color || '#0f172a';
    renderFullEventTitle(ctx, ticket.eventTitle, titleX, titleY, titleWidth, initialFs, 20);
  }

  // Ticket Type / Zone (Matching other meta items, no frame)
  const badge = elements.zoneBadge;
  if (badge?.visible) {
    const badgeX = badge.x * scaleFactor;
    const badgeY = badge.y * scaleFactor;
    const fs = Math.round((badge.fontSize || 16) * scaleFactor);
    ctx.font = `13px ${fontFam}`;
    ctx.fillStyle = badge.secondaryColor || '#64748b';
    ctx.fillText(badge.secondaryText || 'โซน / ประเภทบัตร (ZONE & CATEGORY)', badgeX, badgeY);
    ctx.fillStyle = badge.color || '#0f172a';
    renderTextFitted(ctx, ticket.ticketTypeName, badgeX, badgeY + 22, Math.max(stubX - badgeX - 40, 300), fs, 12, fontFam, true);
  }

  // Gate Info
  const gate = elements.gateInfo;
  if (gate?.visible) {
    const gX = gate.x * scaleFactor;
    const gY = gate.y * scaleFactor;
    const val = (ticket as unknown as { gate?: string }).gate || gate.text || 'GATE 2';
    ctx.font = `13px ${fontFam}`;
    ctx.fillStyle = gate.secondaryColor || '#64748b';
    ctx.fillText(gate.secondaryText || 'ประตูทางเข้า (GATE)', gX, gY);
    ctx.fillStyle = gate.color || '#0f172a';
    renderTextFitted(ctx, val, gX, gY + 22, 130 * scaleFactor, Math.round((gate.fontSize || 16) * scaleFactor), 12, fontFam, true);
  }

  // Seat Info
  const seat = elements.seatInfo;
  if (seat?.visible) {
    const sX = seat.x * scaleFactor;
    const sY = seat.y * scaleFactor;
    const val =
      (ticket as unknown as { seatNumber?: string; seat?: string }).seatNumber ||
      (ticket as unknown as { seatNumber?: string; seat?: string }).seat ||
      seat.text ||
      'แถว A / ที่นั่ง 14';
    ctx.font = `13px ${fontFam}`;
    ctx.fillStyle = seat.secondaryColor || '#64748b';
    ctx.fillText(seat.secondaryText || 'แถว/ที่นั่ง (ROW / SEAT)', sX, sY);
    ctx.fillStyle = seat.color || '#0f172a';
    renderTextFitted(ctx, val, sX, sY + 22, 160 * scaleFactor, Math.round((seat.fontSize || 16) * scaleFactor), 12, fontFam, true);
  }

  // Price Info
  const price = elements.priceInfo;
  if (price?.visible) {
    const pX = price.x * scaleFactor;
    const pY = price.y * scaleFactor;
    const priceNum = (ticket as unknown as { price?: number }).price;
    const val = typeof priceNum === 'number' ? `THB ${priceNum.toLocaleString('th-TH')}` : price.text || '';
    if (val) {
      ctx.font = `13px ${fontFam}`;
      ctx.fillStyle = price.secondaryColor || '#64748b';
      ctx.fillText(price.secondaryText || 'ราคาบัตร (PRICE)', pX, pY);
      ctx.fillStyle = price.color || '#0f172a';
      renderTextFitted(ctx, val, pX, pY + 22, 140 * scaleFactor, Math.round((price.fontSize || 16) * scaleFactor), 12, fontFam, true);
    }
  }

  // Date & Time
  const dt = elements.dateTime;
  if (dt?.visible) {
    const dtX = dt.x * scaleFactor;
    const dtY = dt.y * scaleFactor;
    const showDate = ticket.sessionStartTime
      ? `${formatDate(new Date(ticket.sessionStartTime))} เวลา ${formatTime(new Date(ticket.sessionStartTime))}${
          ticket.sessionEndTime ? ` - ${formatTime(new Date(ticket.sessionEndTime))}` : ''
        }`
      : dt.text || '-';
    ctx.font = `13px ${fontFam}`;
    ctx.fillStyle = dt.secondaryColor || '#64748b';
    ctx.fillText('วันและเวลาแสดง (DATE & TIME)', dtX, dtY);
    ctx.fillStyle = dt.color || '#0f172a';
    renderTextFitted(ctx, showDate, dtX, dtY + 22, 380 * scaleFactor, Math.round((dt.fontSize || 14) * scaleFactor), 12, fontFam, true);
  }

  // Venue
  const ven = elements.venue;
  if (ven?.visible) {
    const venX = ven.x * scaleFactor;
    const venY = ven.y * scaleFactor;
    ctx.font = `13px ${fontFam}`;
    ctx.fillStyle = ven.secondaryColor || '#64748b';
    ctx.fillText('สถานที่จัดงาน (VENUE)', venX, venY);
    ctx.fillStyle = ven.color || '#0f172a';
    renderTextFitted(ctx, ticket.location, venX, venY + 22, 380 * scaleFactor, Math.round((ven.fontSize || 14) * scaleFactor), 12, fontFam, true);
  }

  // Buyer Name
  const buyer = elements.buyerName;
  if (buyer?.visible) {
    const bX = buyer.x * scaleFactor;
    const bY = buyer.y * scaleFactor;
    ctx.font = `13px ${fontFam}`;
    ctx.fillStyle = buyer.secondaryColor || '#64748b';
    ctx.fillText('ผู้สั่งซื้อ (BUYER)', bX, bY);
    ctx.fillStyle = buyer.color || '#0f172a';
    renderTextFitted(ctx, ticket.buyerName, bX, bY + 22, 380 * scaleFactor, Math.round((buyer.fontSize || 13) * scaleFactor), 12, fontFam, true);
  }

  // Ticket Code
  const tCode = elements.ticketCode;
  if (tCode?.visible) {
    const tcX = tCode.x * scaleFactor;
    const tcY = tCode.y * scaleFactor;
    ctx.font = `13px ${fontFam}`;
    ctx.fillStyle = tCode.secondaryColor || '#64748b';
    ctx.fillText('รหัสบัตร (TICKET CODE)', tcX, tcY);
    ctx.fillStyle = tCode.color || '#0f172a';
    renderTextFitted(ctx, ticket.ticketCode, tcX, tcY + 22, 380 * scaleFactor, Math.round((tCode.fontSize || 14) * scaleFactor), 12, FONT_MONO, true);
  }

  // Security Barcode
  const bcode = elements.barcode;
  if (bcode?.visible) {
    const bcX = bcode.x * scaleFactor;
    const bcY = bcode.y * scaleFactor;
    ctx.fillStyle = bcode.secondaryColor || '#64748b';
    ctx.font = `11px ${fontFam}`;
    ctx.fillText(bcode.secondaryText || 'SECURITY VERIFICATION', bcX, bcY);
    ctx.fillStyle = bcode.color || '#0f172a';
    let barOffset = 0;
    for (let i = 0; i < 35; i++) {
      const w = (i % 3 === 0 ? 3 : 1.5) * scaleFactor;
      ctx.fillRect(bcX + barOffset, bcY + 16, w, 20 * scaleFactor);
      barOffset += w + 2 * scaleFactor;
    }
    ctx.font = `11px ${FONT_MONO}`;
    ctx.fillText(`*${ticket.ticketCode}*`, bcX, bcY + 16 + 24 * scaleFactor);
  }

  // Footer Disclaimer Note
  const fn = elements.footerNote;
  if (fn?.visible) {
    const fnX = fn.x * scaleFactor;
    const fnY = fn.y * scaleFactor;
    ctx.font = `13px ${fontFam}`;
    ctx.fillStyle = fn.color || '#64748b';
    ctx.fillText(fn.text || '* กรุณาแสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน · บัตรนี้สามารถสแกนได้ 1 ครั้ง', fnX, fnY);
  }

  // Stub Event Summary
  const ses = elements.stubEventSummary;
  if (ses?.visible) {
    const sesX = ses.x * scaleFactor;
    const sesY = ses.y * scaleFactor;
    ctx.fillStyle = ses.secondaryColor || '#64748b';
    ctx.font = `11px ${fontFam}`;
    ctx.fillText(ses.secondaryText || 'ADMISSION STUB', sesX, sesY);
    ctx.fillStyle = ses.color || '#0f172a';
    const sumText = `${ticket.eventTitle} · ${ticket.ticketTypeName}`;
    renderTextFitted(ctx, sumText, sesX, sesY + 16, width - sesX - 20, Math.round((ses.fontSize || 12) * scaleFactor), 10, fontFam, true);
  }

  // 6. Right Scan Stub Area: QR Code
  const qr = elements.qrCode;
  if (qr?.visible) {
    const qrSize = Math.round((qr.size || template.qrSize || 155) * scaleFactor);
    const qrX = qr.x * scaleFactor;
    const qrY = qr.y * scaleFactor;
    const qrPad = 8 * scaleFactor;
    const qrRadius = 12 * scaleFactor;
    const innerQrRadius = 8 * scaleFactor;
    const boxX = qrX - qrPad;
    const boxY = qrY - qrPad;
    const boxW = qrSize + qrPad * 2;
    const boxH = qrSize + qrPad * 2;

    // Draw rounded QR container card (matches .surface-qr-btn in studio)
    ctx.save();
    ctx.fillStyle = template.qrBgColor && template.qrBgColor !== 'transparent' ? template.qrBgColor : '#ffffff';
    if (typeof ctx.beginPath === 'function') {
      ctx.beginPath();
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, qrRadius);
      if (typeof ctx.fill === 'function') {
        ctx.fill();
      } else {
        ctx.fillRect(boxX, boxY, boxW, boxH);
      }
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1 * scaleFactor;
      if (typeof ctx.stroke === 'function') ctx.stroke();
    } else {
      ctx.fillRect(boxX, boxY, boxW, boxH);
    }
    ctx.restore();

    if (ticket.qrCodeUrl) {
      try {
        const qrImg = new Image();
        await new Promise<void>((resolve, reject) => {
          qrImg.onload = () => resolve();
          qrImg.onerror = () => reject();
          qrImg.src = ticket.qrCodeUrl;
        });
        ctx.save();
        if (typeof ctx.beginPath === 'function' && typeof ctx.clip === 'function') {
          ctx.beginPath();
          drawRoundedRect(ctx, qrX, qrY, qrSize, qrSize, innerQrRadius);
          ctx.clip();
        }
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        ctx.restore();
      } catch {
        try {
          const svgUrl = generateCustomQrSvg(ticket.ticketCode, {
            fgColor: template.qrFgColor || '#000000',
            bgColor: template.qrBgColor || '#ffffff',
          });
          const qrSvgImg = new Image();
          await new Promise<void>((resolve, reject) => {
            qrSvgImg.onload = () => resolve();
            qrSvgImg.onerror = () => reject();
            qrSvgImg.src = svgUrl;
          });
          ctx.save();
          if (typeof ctx.beginPath === 'function' && typeof ctx.clip === 'function') {
            ctx.beginPath();
            drawRoundedRect(ctx, qrX, qrY, qrSize, qrSize, innerQrRadius);
            ctx.clip();
          }
          ctx.drawImage(qrSvgImg, qrX, qrY, qrSize, qrSize);
          ctx.restore();
        } catch {
          ctx.fillStyle = '#0f172a';
          ctx.font = `14px ${fontFam}`;
          ctx.textAlign = 'center';
          ctx.fillText(ticket.ticketCode, qrX + qrSize / 2, qrY + qrSize / 2);
          ctx.textAlign = 'left';
        }
      }
    }
  }

  // QR Code Label
  const qrl = elements.qrCodeLabel;
  if (qrl?.visible) {
    const qrlX = qrl.x * scaleFactor;
    const qrlY = qrl.y * scaleFactor;
    ctx.font = `13px ${fontFam}`;
    ctx.fillStyle = qrl.secondaryColor || '#64748b';
    ctx.fillText(qrl.secondaryText || 'รหัสบัตรสำหรับเข้างาน', qrlX, qrlY);
    ctx.font = `bold 18px ${FONT_MONO}`;
    ctx.fillStyle = qrl.color || '#0f172a';
    ctx.fillText(ticket.ticketCode, qrlX, qrlY + 20);
  }

  // Scan Instruction Hint
  const sh = elements.scanHint;
  if (sh?.visible) {
    const shX = sh.x * scaleFactor;
    const shY = sh.y * scaleFactor;
    ctx.font = `11px ${fontFam}`;
    ctx.fillStyle = sh.color || '#64748b';
    ctx.fillText(sh.text || 'แสดง QR เพื่อสแกนเข้างาน', shX, shY);
  }

  // Order ID
  const oid = elements.orderId;
  if (oid?.visible) {
    const oX = oid.x * scaleFactor;
    const oY = oid.y * scaleFactor;
    ctx.font = `11px ${fontFam}`;
    ctx.fillStyle = oid.secondaryColor || '#64748b';
    ctx.fillText('หมายเลขคำสั่งซื้อ (ORDER ID)', oX, oY);
    ctx.font = `bold 13px ${FONT_MONO}`;
    ctx.fillStyle = oid.color || '#0f172a';
    ctx.fillText(ticket.orderId, oX, oY + 16);
  }

  return canvas;
}

export async function generateTicketDataUrl(
  ticket: TicketDetail,
  overrideTemplate?: TicketDesignerState,
): Promise<string> {
  const canvas = await generateTicketCanvas(ticket, overrideTemplate);
  return canvas.toDataURL('image/png');
}

export async function downloadTicketAsPng(
  ticket: TicketDetail,
  overrideTemplate?: TicketDesignerState,
): Promise<void> {
  const canvas = await generateTicketCanvas(ticket, overrideTemplate);
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `ticket-${ticket.ticketCode}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadAllTicketsAsPng(
  tickets: TicketDetail[],
  overrideTemplate?: TicketDesignerState,
): Promise<void> {
  for (let i = 0; i < tickets.length; i++) {
    await downloadTicketAsPng(tickets[i], overrideTemplate);
    if (i < tickets.length - 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
}
