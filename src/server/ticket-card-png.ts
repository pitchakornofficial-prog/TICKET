import sharp from 'sharp';
import type { TicketDetail } from './tickets.ts';
import { generateCustomQrSvg } from '../lib/ticket-qr.ts';
import { formatBaht, formatDate, formatTime } from '../lib/locale.ts';

function escapeXml(value: string): string {
  return (value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Generates a clean, server-side SVG representation of a ticket pass card
 * and renders it to a PNG buffer via sharp.
 * If the ticket has a template or poster image URL (or data URI), it embeds it as the background.
 */
export async function generateTicketCardPngBuffer(
  ticket: TicketDetail,
  options?: { width?: number; height?: number },
): Promise<Buffer> {
  const width = options?.width || 1200;
  const height = options?.height || 500;

  const eventTitle = escapeXml(ticket.eventTitle || 'CONCERT TICKET');
  const ticketType = escapeXml(ticket.ticketTypeName || 'GENERAL');
  const price = escapeXml(formatBaht(ticket.ticketPrice || 0));
  const buyerName = escapeXml(ticket.buyerName || '-');
  const ticketCode = escapeXml(ticket.ticketCode || '-');
  const location = escapeXml(ticket.location || '-');

  const sessionDate = ticket.sessionStartTime
    ? escapeXml(formatDate(new Date(ticket.sessionStartTime)))
    : '-';
  const sessionTime = ticket.sessionStartTime
    ? escapeXml(formatTime(new Date(ticket.sessionStartTime)))
    : '-';

  // Generate QR SVG with white background
  const qrSvgUrl = generateCustomQrSvg(ticket.qrPayload || ticket.ticketCode, {
    fgColor: '#000000',
    bgColor: '#ffffff',
    moduleSize: 6,
    quietZone: 2,
  });
  const qrSvgXml = decodeURIComponent(
    qrSvgUrl.replace(/^data:image\/svg\+xml;?(utf8|charset=utf-8)?,/i, ''),
  );

  const bgImageUrl = (ticket.ticketTemplateUrl || ticket.eventPosterUrl || '').trim();
  const hasBgImage = Boolean(bgImageUrl && (bgImageUrl.startsWith('http') || bgImageUrl.startsWith('data:')));

  const bgImageElement = hasBgImage
    ? `<image href="${escapeXml(bgImageUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
       <rect x="0" y="0" width="${width}" height="${height}" fill="#000000" opacity="0.45" />`
    : `<!-- Gradient Fallback -->
       <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="url(#cardBg)" />
       <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="none" stroke="#334155" stroke-width="2" />
       <rect x="0" y="0" width="${width}" height="8" rx="4" fill="url(#accentGrad)" />`;

  // Scale positions according to 1200x500 baseline
  const scale = width / 1000;
  const stubX = Math.round(700 * scale);
  const stubCenterX = Math.round(850 * scale);
  const qrBoxX = Math.round(725 * scale);
  const qrBoxY = Math.round(85 * scale);
  const qrBoxSize = Math.round(250 * scale);

  const svgMarkup = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#090d16" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <clipPath id="cardClip">
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" ry="16" />
    </clipPath>
  </defs>

  <style>
    .title { font-family: 'Kanit', sans-serif; font-size: ${Math.round(34 * scale)}px; font-weight: 700; fill: #ffffff; }
    .label { font-family: 'Kanit', sans-serif; font-size: ${Math.round(13 * scale)}px; font-weight: 500; fill: #cbd5e1; text-transform: uppercase; letter-spacing: 1px; }
    .val { font-family: 'Kanit', sans-serif; font-size: ${Math.round(18 * scale)}px; font-weight: 600; fill: #ffffff; }
    .accent-val { font-family: 'Kanit', sans-serif; font-size: ${Math.round(22 * scale)}px; font-weight: 700; fill: #38bdf8; }
    .mono { font-family: monospace; font-size: ${Math.round(16 * scale)}px; font-weight: 700; fill: #ffffff; letter-spacing: 2px; }
    .badge { font-family: 'Kanit', sans-serif; font-size: ${Math.round(13 * scale)}px; font-weight: 600; fill: #ffffff; letter-spacing: 0.5px; }
    .subtext { font-family: 'Kanit', sans-serif; font-size: ${Math.round(11 * scale)}px; fill: #94a3b8; }
  </style>

  <g clip-path="url(#cardClip)">
    ${bgImageElement}

    <!-- Content Left Section -->
    <g transform="translate(${Math.round(48 * scale)}, 0)">
      <!-- Event Title -->
      <text x="0" y="${Math.round(68 * scale)}" class="title">${eventTitle}</text>
      
      <!-- Tier Badge -->
      <rect x="0" y="${Math.round(86 * scale)}" width="${Math.round(124 * scale)}" height="${Math.round(26 * scale)}" rx="${Math.round(13 * scale)}" fill="#2563eb" />
      <text x="${Math.round(62 * scale)}" y="${Math.round(103 * scale)}" text-anchor="middle" class="badge">OFFICIAL PASS</text>

      <!-- Row 1: Date & Time -->
      <text x="0" y="${Math.round(156 * scale)}" class="label">DATE &amp; TIME / วันที่และเวลาแสดง</text>
      <text x="0" y="${Math.round(184 * scale)}" class="val">${sessionDate} | ${sessionTime} น.</text>

      <!-- Row 2: Location -->
      <text x="0" y="${Math.round(232 * scale)}" class="label">VENUE / สถานที่จัดงาน</text>
      <text x="0" y="${Math.round(260 * scale)}" class="val">${location}</text>

      <!-- Row 3: Ticket Type & Price -->
      <text x="0" y="${Math.round(310 * scale)}" class="label">TIER / ประเภทบัตร</text>
      <text x="0" y="${Math.round(338 * scale)}" class="accent-val">${ticketType}</text>

      <text x="${Math.round(300 * scale)}" y="${Math.round(310 * scale)}" class="label">PRICE / ราคา</text>
      <text x="${Math.round(300 * scale)}" y="${Math.round(338 * scale)}" class="val">${price}</text>

      <!-- Row 4: Attendee & Order -->
      <text x="0" y="${Math.round(386 * scale)}" class="label">ATTENDEE / ผู้ถือบัตร</text>
      <text x="0" y="${Math.round(408 * scale)}" class="val" style="font-size: ${Math.round(16 * scale)}px;">${buyerName}</text>

      <!-- Footer Disclaimer -->
      <text x="0" y="${Math.round(442 * scale)}" class="subtext">* บัตรนี้สามารถสแกนเข้างานได้ 1 ครั้งต่อท่าน - ห้ามทำซ้ำหรือดัดแปลง</text>
    </g>

    <!-- Perforated Divider Line -->
    <line x1="${stubX}" y1="20" x2="${stubX}" y2="${height - 20}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6,6" opacity="0.8" />
    
    <!-- Semi-circle notches at divider top and bottom -->
    <circle cx="${stubX}" cy="0" r="${Math.round(16 * scale)}" fill="#f8fafc" />
    <circle cx="${stubX}" cy="${height}" r="${Math.round(16 * scale)}" fill="#f8fafc" />

    <!-- Stub Section (Right) -->
    <g>
      <rect x="${qrBoxX}" y="${qrBoxY}" width="${qrBoxSize}" height="${qrBoxSize}" rx="${Math.round(12 * scale)}" fill="#ffffff" />
      <g transform="translate(${qrBoxX + Math.round(12 * scale)}, ${qrBoxY + Math.round(12 * scale)}) scale(${(qrBoxSize - 24 * scale) / 250})">
        ${qrSvgXml}
      </g>

      <text x="${stubCenterX}" y="${Math.round(375 * scale)}" text-anchor="middle" class="label">TICKET CODE / รหัสอ้างอิงบัตร</text>
      <text x="${stubCenterX}" y="${Math.round(405 * scale)}" text-anchor="middle" class="mono">${ticketCode}</text>
    </g>
  </g>
</svg>
  `.trim();

  return sharp(Buffer.from(svgMarkup))
    .resize(width, height)
    .flatten({ background: { r: 15, g: 23, b: 42 } })
    .png()
    .toBuffer();
}
