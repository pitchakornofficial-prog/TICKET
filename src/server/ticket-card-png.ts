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
 */
export async function generateTicketCardPngBuffer(
  ticket: TicketDetail,
  options?: { width?: number; height?: number },
): Promise<Buffer> {
  const width = options?.width || 1000;
  const height = options?.height || 420;

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

  // Generate QR SVG
  const qrSvgUrl = generateCustomQrSvg(ticket.qrPayload || ticket.ticketCode, {
    fgColor: '#000000',
    bgColor: '#ffffff',
    moduleSize: 6,
    quietZone: 2,
  });
  const qrSvgXml = decodeURIComponent(
    qrSvgUrl.replace(/^data:image\/svg\+xml;?(utf8|charset=utf-8)?,/i, ''),
  );

  // SVG Ticket Pass Markup (Clean modern dark/blue gradient card with tear-off notch)
  const svgMarkup = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="60%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#091124" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>
  </defs>

  <style>
    .title { font-family: sans-serif; font-size: 32px; font-weight: bold; fill: #ffffff; }
    .label { font-family: sans-serif; font-size: 13px; font-weight: normal; fill: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
    .val { font-family: sans-serif; font-size: 18px; font-weight: 600; fill: #f8fafc; }
    .accent-val { font-family: sans-serif; font-size: 22px; font-weight: bold; fill: #60a5fa; }
    .mono { font-family: monospace; font-size: 16px; font-weight: bold; fill: #e2e8f0; letter-spacing: 2px; }
    .badge { font-family: sans-serif; font-size: 14px; font-weight: bold; fill: #ffffff; }
  </style>

  <!-- Background Card -->
  <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="url(#cardBg)" />
  <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="none" stroke="#334155" stroke-width="2" />

  <!-- Top Decorative Header Strip -->
  <rect x="0" y="0" width="${width}" height="8" rx="4" fill="url(#accentGrad)" />

  <!-- Event Title -->
  <text x="48" y="64" class="title">${eventTitle}</text>
  <rect x="48" y="82" width="120" height="26" rx="13" fill="#2563eb" />
  <text x="108" y="99" text-anchor="middle" class="badge">OFFICIAL PASS</text>

  <!-- Info Grid Left -->
  <!-- Row 1: Date & Time -->
  <text x="48" y="150" class="label">DATE &amp; TIME / วันที่และเวลา</text>
  <text x="48" y="178" class="val">${sessionDate} | ${sessionTime} น.</text>

  <!-- Row 2: Location -->
  <text x="48" y="224" class="label">VENUE / สถานที่จัดงาน</text>
  <text x="48" y="252" class="val">${location}</text>

  <!-- Row 3: Ticket Type & Price -->
  <text x="48" y="300" class="label">TIER / ประเภทบัตร</text>
  <text x="48" y="328" class="accent-val">${ticketType}</text>

  <text x="320" y="300" class="label">PRICE / ราคา</text>
  <text x="320" y="328" class="val">${price}</text>

  <!-- Row 4: Buyer Name -->
  <text x="48" y="374" class="label">ATTENDEE / ผู้ถือบัตร</text>
  <text x="48" y="396" class="val" style="font-size: 15px;">${buyerName}</text>

  <!-- Perforated Divider Line -->
  <line x1="680" y1="20" x2="680" y2="400" stroke="#475569" stroke-width="2" stroke-dasharray="6,6" />
  
  <!-- Semi-circle notches at divider top and bottom -->
  <circle cx="680" cy="0" r="16" fill="#f8fafc" />
  <circle cx="680" cy="${height}" r="16" fill="#f8fafc" />

  <!-- Stub Section (Right) -->
  <text x="840" y="55" text-anchor="middle" class="label">ADMISSION PASS</text>

  <!-- QR Code Container -->
  <g transform="translate(715, 75)">
    <rect width="250" height="250" rx="8" fill="#ffffff" />
    <g transform="translate(15, 15) scale(0.88)">
      ${qrSvgXml}
    </g>
  </g>

  <!-- Ticket Code -->
  <text x="840" y="360" text-anchor="middle" class="label">TICKET CODE</text>
  <text x="840" y="388" text-anchor="middle" class="mono">${ticketCode}</text>
</svg>
  `.trim();

  return sharp(Buffer.from(svgMarkup))
    .resize(width, height)
    .png()
    .toBuffer();
}
