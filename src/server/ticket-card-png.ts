import sharp from 'sharp';
import type { Pool } from 'pg';
import type { TicketDetail } from './tickets.ts';
import { generateCustomQrSvg } from '../lib/ticket-qr.ts';
import { formatDate, formatTime } from '../lib/locale.ts';
import { readTicketMasterTemplate } from './ticket-master-template.ts';
import type { TicketDesignerState } from '../lib/ticket-master-template-sync.ts';
import { storage } from './storage.ts';

function escapeXml(value: string): string {
  return (value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function resolveImageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex !== -1) {
      try {
        return Buffer.from(trimmed.slice(commaIndex + 1), 'base64');
      } catch {
        return null;
      }
    }
  }

  if (trimmed.startsWith('/api/media/')) {
    const rawKey = trimmed.slice('/api/media/'.length).split('?')[0];
    try {
      const key = decodeURIComponent(rawKey);
      const item = await storage.get(key);
      if (item?.data) return item.data;
    } catch {
      // Ignore key decode failure
    }

    // Fallback: try loopback fetch if running server
    try {
      const res = await fetch(`http://127.0.0.1:3000${trimmed}`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const arr = await res.arrayBuffer();
        return Buffer.from(arr);
      }
    } catch {
      // Loopback fetch failed
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const res = await fetch(trimmed, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const arr = await res.arrayBuffer();
        return Buffer.from(arr);
      }
    } catch {
      // Remote fetch failed
    }
  }

  return null;
}

/**
 * Generates a clean, server-side SVG/Sharp representation of a ticket pass card
 * and renders it to a PNG buffer.
 * Synchronizes 100% with owner_ticket_master_template and Ticket Designer.
 */
export async function generateTicketCardPngBuffer(
  ticket: TicketDetail,
  options?: {
    width?: number;
    height?: number;
    template?: Partial<TicketDesignerState> | null;
    pool?: Pool;
  },
): Promise<Buffer> {
  const width = options?.width || 1000;
  const height = options?.height || 420;
  const scale = width / 1000;

  // 1. Resolve master template
  let template: Partial<TicketDesignerState> | null = options?.template ?? null;
  if (!template) {
    if (options?.pool) {
      try {
        template = await readTicketMasterTemplate(options.pool);
      } catch {
        // Pool query failed
      }
    } else {
      try {
        const { getDatabasePool } = await import('./database.ts');
        const pool = getDatabasePool();
        template = await readTicketMasterTemplate(pool);
      } catch {
        // DB not available or not configured
      }
    }
  }

  // Fallback elements if template is completely absent
  const els = template?.elements || {};

  // Formatted date and time values
  const sessionDate = ticket.sessionStartTime
    ? escapeXml(formatDate(new Date(ticket.sessionStartTime)))
    : '';
  const sessionTime = ticket.sessionStartTime
    ? escapeXml(formatTime(new Date(ticket.sessionStartTime)))
    : '';
  const sessionEndTime = ticket.sessionEndTime
    ? escapeXml(formatTime(new Date(ticket.sessionEndTime)))
    : '';
  const fullDateTime = sessionDate
    ? `${sessionDate} | เวลา ${sessionTime}${sessionEndTime ? ` - ${sessionEndTime}` : ''} น.`
    : '-';

  // Generate QR SVG
  const qrPayload = ticket.qrPayload || ticket.ticketCode || 'TICKET';
  const qrSvgUrl = generateCustomQrSvg(qrPayload, {
    fgColor: template?.qrFgColor || '#000000',
    bgColor: template?.qrBgColor || '#ffffff',
    moduleSize: 6,
    quietZone: 2,
  });
  const qrSvgXml = decodeURIComponent(
    qrSvgUrl.replace(/^data:image\/svg\+xml;?(utf8|charset=utf-8)?,/i, ''),
  );

  // 2. Resolve background image if configured
  const bgType = template?.bgType || (ticket.ticketTemplateUrl || ticket.eventPosterUrl ? 'image' : 'gradient');
  const targetBgUrl =
    (bgType === 'image' && template?.bgImageUrl ? template.bgImageUrl : null) ||
    ticket.ticketTemplateUrl ||
    ticket.eventPosterUrl ||
    '';

  let bgBuffer: Buffer | null = null;
  if (bgType === 'image' && targetBgUrl) {
    bgBuffer = await resolveImageBuffer(targetBgUrl);
  }

  // 3. Build elements SVG
  const elementsSvg: string[] = [];
  const baseFont = template?.fontFamily || 'Kanit';
  const fontFamily = `'${baseFont}', 'Noto Sans Thai', 'Leelawadee UI', 'Segoe UI', Tahoma, sans-serif`;

  // Event Title
  const elEventTitle = els.eventTitle;
  if (elEventTitle?.visible !== false) {
    const x = Math.round((elEventTitle?.x ?? 34) * scale);
    const y = Math.round((elEventTitle?.y ?? 157) * scale);
    const fontSize = Math.round((elEventTitle?.fontSize ?? 26) * scale);
    const color = elEventTitle?.color || '#ffffff';
    const text = escapeXml(ticket.eventTitle || elEventTitle?.text || 'CONCERT TICKET');
    elementsSvg.push(
      `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="700" fill="${color}">${text}</text>`,
    );
  }

  // Zone / Tier Badge
  const elZoneBadge = els.zoneBadge;
  if (elZoneBadge?.visible !== false) {
    const x = Math.round((elZoneBadge?.x ?? 34) * scale);
    const y = Math.round((elZoneBadge?.y ?? 192) * scale);
    const fontSize = Math.round((elZoneBadge?.fontSize ?? 13) * scale);
    const color = elZoneBadge?.color || '#ffffff';
    const text = escapeXml(ticket.ticketTypeName || elZoneBadge?.text || 'GENERAL PASS');
    const showSec = elZoneBadge?.showSecondaryText === true && Boolean(elZoneBadge?.secondaryText);
    if (showSec && elZoneBadge?.secondaryText) {
      const secText = escapeXml(elZoneBadge.secondaryText);
      const secColor = elZoneBadge.secondaryColor || '#94a3b8';
      const secSize = Math.round(11 * scale);
      elementsSvg.push(
        `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${secSize}px" font-weight="500" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${x}" y="${y + Math.round(18 * scale)}" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="700" fill="${color}">${text}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="700" fill="${color}">${text}</text>`,
      );
    }
  }

  // Date & Time
  const elDateTime = els.dateTime;
  if (elDateTime?.visible !== false) {
    const x = Math.round((elDateTime?.x ?? 30) * scale);
    const y = Math.round((elDateTime?.y ?? 245) * scale);
    const fontSize = Math.round((elDateTime?.fontSize ?? 14) * scale);
    const color = elDateTime?.color || '#ffffff';
    const showSec = elDateTime?.showSecondaryText !== false;
    const text = escapeXml(ticket.sessionStartTime ? fullDateTime : elDateTime?.text || fullDateTime);
    if (showSec) {
      const secText = escapeXml(elDateTime?.secondaryText || 'วันและเวลาแสดง (DATE & TIME)');
      const secColor = elDateTime?.secondaryColor || '#cbd5e1';
      const secSize = Math.round(11 * scale);
      elementsSvg.push(
        `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${secSize}px" font-weight="500" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${x}" y="${y + Math.round(18 * scale)}" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="600" fill="${color}">${text}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="600" fill="${color}">${text}</text>`,
      );
    }
  }

  // Venue
  const elVenue = els.venue;
  if (elVenue?.visible !== false) {
    const x = Math.round((elVenue?.x ?? 30) * scale);
    const y = Math.round((elVenue?.y ?? 290) * scale);
    const fontSize = Math.round((elVenue?.fontSize ?? 14) * scale);
    const color = elVenue?.color || '#ffffff';
    const showSec = elVenue?.showSecondaryText !== false;
    const text = escapeXml(ticket.location || elVenue?.text || '-');
    if (showSec) {
      const secText = escapeXml(elVenue?.secondaryText || 'สถานที่จัดงาน (VENUE & HALL)');
      const secColor = elVenue?.secondaryColor || '#cbd5e1';
      const secSize = Math.round(11 * scale);
      elementsSvg.push(
        `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${secSize}px" font-weight="500" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${x}" y="${y + Math.round(18 * scale)}" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="600" fill="${color}">${text}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="600" fill="${color}">${text}</text>`,
      );
    }
  }

  // Ticket Code (Left Column) and Buyer Name (Right Column) collision prevention
  const elTicketCode = els.ticketCode;
  const elBuyerName = els.buyerName;
  let tcX = Math.round((elTicketCode?.x ?? 31) * scale);
  const tcY = Math.round((elTicketCode?.y ?? 334) * scale);
  let bnX = Math.round((elBuyerName?.x ?? 280) * scale);
  const bnY = Math.round((elBuyerName?.y ?? 335) * scale);

  // If both are visible on the same row, ensure a minimum horizontal separation of 260px
  if (
    elTicketCode?.visible !== false &&
    elBuyerName?.visible !== false &&
    Math.abs(tcY - bnY) < 25
  ) {
    if (tcX <= bnX && bnX < tcX + Math.round(260 * scale)) {
      bnX = tcX + Math.round(260 * scale);
    } else if (bnX < tcX && tcX < bnX + Math.round(260 * scale)) {
      tcX = bnX + Math.round(260 * scale);
    }
  }

  // Ticket Code
  if (elTicketCode?.visible !== false) {
    const fontSize = Math.round((elTicketCode?.fontSize ?? 14) * scale);
    const color = elTicketCode?.color || '#ffffff';
    const showSec = elTicketCode?.showSecondaryText !== false;
    const text = escapeXml(ticket.ticketCode || elTicketCode?.text || '-');
    if (showSec) {
      const secText = escapeXml(elTicketCode?.secondaryText || 'รหัสบัตร (TICKET CODE)');
      const secColor = elTicketCode?.secondaryColor || '#cbd5e1';
      const secSize = Math.round(11 * scale);
      elementsSvg.push(
        `<text x="${tcX}" y="${tcY}" font-family="${fontFamily}" font-size="${secSize}px" font-weight="500" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${tcX}" y="${tcY + Math.round(18 * scale)}" font-family="monospace" font-size="${fontSize}px" font-weight="700" fill="${color}">${text}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${tcX}" y="${tcY}" font-family="monospace" font-size="${fontSize}px" font-weight="700" fill="${color}">${text}</text>`,
      );
    }
  }

  // Buyer Name
  if (elBuyerName?.visible !== false) {
    const fontSize = Math.round((elBuyerName?.fontSize ?? 13) * scale);
    const color = elBuyerName?.color || '#ffffff';
    const showSec = elBuyerName?.showSecondaryText !== false;
    const text = escapeXml(ticket.buyerName || elBuyerName?.text || '-');
    if (showSec) {
      const secText = escapeXml(elBuyerName?.secondaryText || 'ผู้ถือบัตร (ATTENDEE)');
      const secColor = elBuyerName?.secondaryColor || '#cbd5e1';
      const secSize = Math.round(11 * scale);
      elementsSvg.push(
        `<text x="${bnX}" y="${bnY}" font-family="${fontFamily}" font-size="${secSize}px" font-weight="500" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${bnX}" y="${bnY + Math.round(18 * scale)}" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="600" fill="${color}">${text}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${bnX}" y="${bnY}" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="600" fill="${color}">${text}</text>`,
      );
    }
  }

  // Footer Note
  const elFooterNote = els.footerNote;
  if (elFooterNote?.visible !== false) {
    const x = Math.round((elFooterNote?.x ?? 30) * scale);
    const y = Math.round((elFooterNote?.y ?? 380) * scale);
    const fontSize = Math.round((elFooterNote?.fontSize ?? 11) * scale);
    const color = elFooterNote?.color || '#cbd5e1';
    const text = escapeXml(elFooterNote?.text || '* บัตรนี้สามารถสแกนเข้างานได้ 1 ครั้งต่อท่าน - ห้ามทำซ้ำหรือดัดแปลง');
    elementsSvg.push(
      `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}px" fill="${color}">${text}</text>`,
    );
  }

  // QR Code Box & SVG
  const elQr = els.qrCode;
  const qrX = Math.round((elQr?.x ?? 754) * scale);
  const qrY = Math.round((elQr?.y ?? 84) * scale);
  const qrSize = Math.round((elQr?.size ?? 155) * scale);
  const qrInnerPad = Math.round(8 * scale);
  const qrInnerSize = qrSize - qrInnerPad * 2;

  // Solid white background for QR code
  elementsSvg.push(
    `<rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" rx="${Math.round(8 * scale)}" fill="#ffffff" />`,
  );
  elementsSvg.push(
    `<g transform="translate(${qrX + qrInnerPad}, ${qrY + qrInnerPad}) scale(${qrInnerSize / 250})">${qrSvgXml}</g>`,
  );

  // QR Code Stub Label
  const elQrLabel = els.qrCodeLabel;
  if (elQrLabel?.visible !== false) {
    const centerX = qrX + Math.round(qrSize / 2);
    const y = Math.round((elQrLabel?.y ?? 263) * scale);
    const fontSize = Math.round((elQrLabel?.fontSize ?? 13) * scale);
    const color = elQrLabel?.color || '#ffffff';
    const showSec = elQrLabel?.showSecondaryText !== false;
    const text = escapeXml(ticket.ticketCode || elQrLabel?.text || '-');
    if (showSec) {
      const secText = escapeXml(elQrLabel?.secondaryText || 'รหัสอ้างอิงบัตร (TICKET CODE)');
      const secColor = elQrLabel?.secondaryColor || '#cbd5e1';
      const secSize = Math.round(10 * scale);
      elementsSvg.push(
        `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="${fontFamily}" font-size="${secSize}px" font-weight="500" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${centerX}" y="${y + Math.round(16 * scale)}" text-anchor="middle" font-family="monospace" font-size="${fontSize}px" font-weight="700" fill="${color}">${text}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="monospace" font-size="${fontSize}px" font-weight="700" fill="${color}">${text}</text>`,
      );
    }
  }

  // Order ID
  const elOrderId = els.orderId;
  if (elOrderId?.visible !== false) {
    const centerX = qrX + Math.round(qrSize / 2);
    const y = Math.round((elOrderId?.y ?? 362) * scale);
    const fontSize = Math.round((elOrderId?.fontSize ?? 11) * scale);
    const color = elOrderId?.color || '#cbd5e1';
    const showSec = elOrderId?.showSecondaryText !== false;
    const text = escapeXml(ticket.orderId || elOrderId?.text || '-');
    if (showSec) {
      const secText = escapeXml(elOrderId?.secondaryText || 'หมายเลขคำสั่งซื้อ (ORDER ID)');
      const secColor = elOrderId?.secondaryColor || '#94a3b8';
      const secSize = Math.round(9 * scale);
      elementsSvg.push(
        `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="${fontFamily}" font-size="${secSize}px" font-weight="500" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${centerX}" y="${y + Math.round(15 * scale)}" text-anchor="middle" font-family="monospace" font-size="${fontSize}px" font-weight="600" fill="${color}">${text}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="monospace" font-size="${fontSize}px" font-weight="600" fill="${color}">${text}</text>`,
      );
    }
  }

  // Tear line if enabled
  if (template?.tearLineStyle && template.tearLineStyle !== 'none') {
    const tearX = Math.round((template.tearLineX || 720) * scale);
    const tearColor = template.tearLineColor || '#94a3b8';
    const dash = template.tearLineStyle === 'dashed' ? 'stroke-dasharray="6,6"' : '';
    elementsSvg.push(
      `<line x1="${tearX}" y1="0" x2="${tearX}" y2="${height}" stroke="${tearColor}" stroke-width="2" ${dash} opacity="0.75" />`,
    );
  }

  // 4. Combine Background + SVG Overlay
  if (bgBuffer) {
    const resizedBg = await sharp(bgBuffer)
      .resize(width, height, { fit: 'cover' })
      .toBuffer();

    const overlaySvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${template?.bgOverlayDarkness ? `<rect x="0" y="0" width="${width}" height="${height}" fill="#000000" opacity="${template.bgOverlayDarkness / 100}" />` : ''}
  ${elementsSvg.join('\n  ')}
</svg>`;

    return await sharp(resizedBg)
      .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
      .png()
      .toBuffer();
  }

  // Background SVG when no image buffer
  let bgElement = '';
  if (bgType === 'gradient') {
    const angle = template?.gradientAngle ?? 135;
    const startColor = template?.gradientStart || '#1e1b4b';
    const endColor = template?.gradientEnd || '#0f172a';
    bgElement = `
      <defs>
        <linearGradient id="ticketBgGrad" gradientTransform="rotate(${angle})">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="url(#ticketBgGrad)" />`;
  } else if (bgType === 'solid') {
    const bgColor = template?.bgColor || '#0f172a';
    bgElement = `<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="${bgColor}" />`;
  } else {
    bgElement = `
      <defs>
        <linearGradient id="fallbackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e1b4b" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="url(#fallbackGrad)" />`;
  }

  const fullSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${bgElement}
  ${elementsSvg.join('\n  ')}
</svg>`;

  return await sharp(Buffer.from(fullSvg)).png().toBuffer();
}
