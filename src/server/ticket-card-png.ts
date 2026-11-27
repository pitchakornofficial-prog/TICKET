import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
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

let cachedKanitFontFiles: string[] | null = null;

function getEmbeddedKanitFontFiles(): string[] {
  if (cachedKanitFontFiles !== null) return cachedKanitFontFiles;
  const files = ['Kanit-Regular.ttf', 'Kanit-SemiBold.ttf'];
  const paths: string[] = [];
  for (const file of files) {
    const fullPath = join(process.cwd(), 'src', 'server', 'fonts', file);
    if (existsSync(fullPath)) {
      paths.push(fullPath);
    }
  }
  cachedKanitFontFiles = paths;
  return cachedKanitFontFiles;
}

function guessFontMimeAndFormat(url: string): { mime: string; format: string } {
  const lower = url.toLowerCase();
  if (lower.endsWith('.woff2')) return { mime: 'font/woff2', format: 'woff2' };
  if (lower.endsWith('.woff')) return { mime: 'font/woff', format: 'woff' };
  if (lower.endsWith('.otf')) return { mime: 'font/otf', format: 'opentype' };
  return { mime: 'font/ttf', format: 'truetype' };
}

async function resolveImageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:font/') || trimmed.startsWith('data:application/')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex !== -1) {
      try {
        const meta = trimmed.slice(0, commaIndex).toLowerCase();
        const payload = trimmed.slice(commaIndex + 1);
        if (meta.includes(';base64')) {
          return Buffer.from(payload, 'base64');
        }
        return Buffer.from(decodeURIComponent(payload), 'utf8');
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

    // Fallback: try loopback / configured origin fetch if running server
    const candidateOrigins = Array.from(
      new Set([
        process.env.BETTER_AUTH_URL?.replace(/\/$/, ''),
        `http://127.0.0.1:${process.env.PORT || 3000}`,
        'http://127.0.0.1:3000',
      ].filter((v): v is string => Boolean(v))),
    );
    for (const origin of candidateOrigins) {
      try {
        const res = await fetch(`${origin}${trimmed}`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const arr = await res.arrayBuffer();
          return Buffer.from(arr);
        }
      } catch {
        // Loopback fetch failed
      }
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

  const els = template?.elements || {};
  const defaultTitleWeight = String(template?.titleFontWeight ?? 400);
  const defaultBodyWeight = String(template?.bodyFontWeight ?? 400);

  // Collect TTF/OTF font files for Resvg (works identically on Windows/Linux/Docker without OS fonts)
  const fontFiles: string[] = [...getEmbeddedKanitFontFiles()];
  if (template?.customFontUrl && template?.customFontName) {
    const customFontBuf = await resolveImageBuffer(template.customFontUrl);
    if (customFontBuf) {
      const { format } = guessFontMimeAndFormat(template.customFontUrl);
      if (format === 'truetype' || format === 'opentype') {
        const ext = format === 'opentype' ? 'otf' : 'ttf';
        const hash = createHash('sha256').update(customFontBuf).digest('hex').slice(0, 16);
        const fontCacheDir = join(tmpdir(), 'ticket-resvg-fonts');
        mkdirSync(fontCacheDir, { recursive: true });
        const tempFontPath = join(fontCacheDir, `${hash}.${ext}`);
        if (!existsSync(tempFontPath)) {
          writeFileSync(tempFontPath, customFontBuf);
        }
        fontFiles.push(tempFontPath);
      }
    }
  }

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
    ? `${sessionDate} เวลา ${sessionTime}${sessionEndTime ? ` - ${sessionEndTime}` : ''}`
    : '-';

  // Generate QR SVG
  const qrPayload = ticket.qrPayload || ticket.ticketCode || 'TICKET';
  const qrSvgUrl = generateCustomQrSvg(qrPayload, {
    fgColor: '#000000',
    bgColor: '#ffffff',
    moduleSize: 6,
    quietZone: 2,
  });
  const qrSvgXml = decodeURIComponent(
    qrSvgUrl.replace(/^data:image\/svg\+xml;?(utf8|charset=utf-8)?,/i, ''),
  );

  // 2. Resolve background image if configured
  const bgType = template?.bgType || (ticket.ticketTemplateUrl || ticket.eventPosterUrl ? 'image' : 'gradient');
  const fallbackEventImg = ticket.ticketTemplateUrl || ticket.eventPosterUrl || '';
  const isDefaultBlankWhite =
    bgType === 'solid' &&
    template?.presetId === 'classic-white' &&
    !template?.bgImageUrl &&
    (template?.bgColor || '#ffffff').toLowerCase() === '#ffffff';
  const targetBgUrl =
    (bgType === 'image' && template?.bgImageUrl ? template.bgImageUrl : null) ||
    (bgType === 'image' || isDefaultBlankWhite ? fallbackEventImg : '');

  let bgBuffer: Buffer | null = null;
  if (targetBgUrl) {
    bgBuffer = await resolveImageBuffer(targetBgUrl);
  }

  // 3. Build elements SVG (using dominant-baseline="hanging" to match top-left CSS/Canvas coordinates)
  const elementsSvg: string[] = [];
  const baseFont = template?.fontFamily || 'Kanit';
  const fontFamily = baseFont !== 'Kanit'
    ? `'${baseFont}', 'Kanit', 'Noto Sans Thai', 'Segoe UI', Tahoma, sans-serif`
    : `'Kanit', 'Noto Sans Thai', 'Segoe UI', Tahoma, sans-serif`;
  const monoFont = `'ui-monospace', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace`;

  const renderLabeledSvgField = (
    el: NonNullable<TicketDesignerState['elements'][string]> | undefined,
    defaults: {
      x: number;
      y: number;
      bodySize: number;
      secSize: number;
      secText: string;
      bodyText: string;
      color: string;
      secColor: string;
      useMono?: boolean;
      defaultShowSec?: boolean;
      defaultAlign?: 'left' | 'center' | 'right';
    },
  ) => {
    if (el?.visible === false) return;
    const x = Math.round((el?.x ?? defaults.x) * scale);
    const y = Math.round((el?.y ?? defaults.y) * scale);
    const bodyPx = el?.fontSize || defaults.bodySize;
    const secPx = el?.secondaryFontSize || defaults.secSize;
    const bodySize = Math.round(bodyPx * scale);
    const secSize = Math.round(secPx * scale);
    const bodyWeight = el?.fontWeight || defaultBodyWeight;
    const titleWeight = el?.secondaryFontWeight || defaultTitleWeight;
    const color = el?.color || defaults.color;
    const secColor = el?.secondaryColor || defaults.secColor;
    const align = el?.align || defaults.defaultAlign || 'left';
    const textAnchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const showSec = el?.showSecondaryText !== undefined ? el.showSecondaryText : (defaults.defaultShowSec !== false);
    const targetFont = defaults.useMono ? monoFont : fontFamily;
    const bodyText = escapeXml(defaults.bodyText);

    if (showSec) {
      const secText = escapeXml(el?.secondaryText || defaults.secText);
      const offsetY = Math.round((secPx + 5) * scale);
      elementsSvg.push(
        `<text x="${x}" y="${y}" text-anchor="${textAnchor}" dominant-baseline="hanging" font-family="${fontFamily}" font-size="${secSize}px" font-weight="${titleWeight}" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${x}" y="${y + offsetY}" text-anchor="${textAnchor}" dominant-baseline="hanging" font-family="${targetFont}" font-size="${bodySize}px" font-weight="${bodyWeight}" fill="${color}">${bodyText}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${x}" y="${y}" text-anchor="${textAnchor}" dominant-baseline="hanging" font-family="${targetFont}" font-size="${bodySize}px" font-weight="${bodyWeight}" fill="${color}">${bodyText}</text>`,
      );
    }
  };

  // Brand Logo
  const elBrandLogo = els.brandLogo;
  if (elBrandLogo?.visible) {
    const x = Math.round((elBrandLogo.x ?? 30) * scale);
    const y = Math.round((elBrandLogo.y ?? 26) * scale);
    const bodySize = Math.round((elBrandLogo.fontSize || 16) * scale);
    const secSize = Math.round((elBrandLogo.secondaryFontSize || 10) * scale);
    const bodyWeight = elBrandLogo.fontWeight || defaultBodyWeight;
    const titleWeight = elBrandLogo.secondaryFontWeight || defaultTitleWeight;
    elementsSvg.push(
      `<text x="${x + Math.round(24 * scale)}" y="${y}" dominant-baseline="hanging" font-family="${fontFamily}" font-size="${bodySize}px" font-weight="${bodyWeight}" fill="${elBrandLogo.color || '#0f172a'}">${escapeXml(elBrandLogo.text || 'TICKET')}</text>`,
    );
    if (elBrandLogo.showSecondaryText !== false && elBrandLogo.secondaryText) {
      elementsSvg.push(
        `<text x="${x + Math.round(92 * scale)}" y="${y + Math.round(4 * scale)}" dominant-baseline="hanging" font-family="${fontFamily}" font-size="${secSize}px" font-weight="${titleWeight}" fill="${elBrandLogo.secondaryColor || '#64748b'}">${escapeXml(elBrandLogo.secondaryText)}</text>`,
      );
    }
  }

  // Event Title
  const elEventTitle = els.eventTitle;
  if (elEventTitle?.visible !== false) {
    const x = Math.round((elEventTitle?.x ?? 34) * scale);
    const y = Math.round((elEventTitle?.y ?? 157) * scale);
    const fontSize = Math.round((elEventTitle?.fontSize ?? 26) * scale);
    const bodyWeight = elEventTitle?.fontWeight || defaultBodyWeight;
    const color = elEventTitle?.color || '#0f172a';
    const text = escapeXml(ticket.eventTitle || elEventTitle?.text || 'CONCERT TICKET');
    elementsSvg.push(
      `<text x="${x}" y="${y}" dominant-baseline="hanging" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="${bodyWeight}" fill="${color}">${text}</text>`,
    );
  }

  // Zone / Tier Badge
  renderLabeledSvgField(els.zoneBadge, {
    x: 34,
    y: 192,
    bodySize: 16,
    secSize: 11,
    secText: 'โซน / ประเภทบัตร (ZONE & CATEGORY)',
    bodyText: ticket.ticketTypeName || els.zoneBadge?.text || 'GENERAL PASS',
    color: '#0f172a',
    secColor: '#64748b',
    defaultShowSec: false,
  });

  // Gate Info
  if (els.gateInfo?.visible) {
    const val = (ticket as unknown as { gate?: string }).gate || els.gateInfo.text || 'GATE 2';
    renderLabeledSvgField(els.gateInfo, {
      x: 34,
      y: 225,
      bodySize: 16,
      secSize: 11,
      secText: 'ประตูทางเข้า (GATE)',
      bodyText: val,
      color: '#0f172a',
      secColor: '#64748b',
    });
  }

  // Seat Info
  if (els.seatInfo?.visible) {
    const val =
      (ticket as unknown as { seatNumber?: string; seat?: string }).seatNumber ||
      (ticket as unknown as { seatNumber?: string; seat?: string }).seat ||
      els.seatInfo.text ||
      'แถว A / ที่นั่ง 14';
    renderLabeledSvgField(els.seatInfo, {
      x: 160,
      y: 225,
      bodySize: 16,
      secSize: 11,
      secText: 'แถว/ที่นั่ง (ROW / SEAT)',
      bodyText: val,
      color: '#0f172a',
      secColor: '#64748b',
    });
  }

  // Price Info
  if (els.priceInfo?.visible) {
    const priceNum = (ticket as unknown as { price?: number; ticketPrice?: number }).ticketPrice ?? (ticket as unknown as { price?: number }).price;
    const priceDisplayMode = (ticket as unknown as { priceDisplayMode?: string }).priceDisplayMode;
    const val = priceDisplayMode === 'complimentary'
      ? 'บัตรเชิญ (COMPLIMENTARY)'
      : typeof priceNum === 'number'
      ? `THB ${priceNum.toLocaleString('th-TH')}`
      : els.priceInfo.text || '';
    if (val) {
      renderLabeledSvgField(els.priceInfo, {
        x: 340,
        y: 225,
        bodySize: 16,
        secSize: 11,
        secText: 'ราคาบัตร (PRICE)',
        bodyText: val,
        color: '#0f172a',
        secColor: '#64748b',
      });
    }
  }

  // Date & Time
  renderLabeledSvgField(els.dateTime, {
    x: 30,
    y: 245,
    bodySize: 14,
    secSize: 11,
    secText: 'วันและเวลาแสดง (DATE & TIME)',
    bodyText: ticket.sessionStartTime ? fullDateTime : els.dateTime?.text || fullDateTime,
    color: '#0f172a',
    secColor: '#64748b',
  });

  // Venue
  renderLabeledSvgField(els.venue, {
    x: 30,
    y: 290,
    bodySize: 14,
    secSize: 11,
    secText: 'สถานที่จัดงาน (VENUE & HALL)',
    bodyText: ticket.location || els.venue?.text || '-',
    color: '#0f172a',
    secColor: '#64748b',
  });

  // Ticket Code and Buyer Name collision prevention
  const elTicketCode = els.ticketCode;
  const elBuyerName = els.buyerName;
  let tcX = elTicketCode?.x ?? 31;
  const tcY = elTicketCode?.y ?? 334;
  let bnX = elBuyerName?.x ?? 280;
  const bnY = elBuyerName?.y ?? 335;

  if (
    elTicketCode?.visible !== false &&
    elBuyerName?.visible !== false &&
    Math.abs(tcY - bnY) < 25
  ) {
    if (tcX <= bnX && bnX < tcX + 260) {
      bnX = tcX + 260;
    } else if (bnX < tcX && tcX < bnX + 260) {
      tcX = bnX + 260;
    }
  }

  renderLabeledSvgField(elTicketCode ? { ...elTicketCode, x: tcX } : undefined, {
    x: tcX,
    y: tcY,
    bodySize: 14,
    secSize: 11,
    secText: 'รหัสบัตร (TICKET CODE)',
    bodyText: ticket.ticketCode || elTicketCode?.text || '-',
    color: '#0f172a',
    secColor: '#64748b',
    useMono: true,
  });

  renderLabeledSvgField(elBuyerName ? { ...elBuyerName, x: bnX } : undefined, {
    x: bnX,
    y: bnY,
    bodySize: 13,
    secSize: 11,
    secText: 'ผู้ถือบัตร (ATTENDEE)',
    bodyText: ticket.buyerName || elBuyerName?.text || '-',
    color: '#0f172a',
    secColor: '#64748b',
  });

  // Security Barcode
  const elBarcode = els.barcode;
  if (elBarcode?.visible) {
    const bcX = Math.round((elBarcode.x ?? 30) * scale);
    const bcY = Math.round((elBarcode.y ?? 340) * scale);
    const secPx = elBarcode.secondaryFontSize || 10;
    const secSize = Math.round(secPx * scale);
    const bodySize = Math.round((elBarcode.fontSize || 11) * scale);
    const titleWeight = elBarcode.secondaryFontWeight || defaultTitleWeight;
    const bodyWeight = elBarcode.fontWeight || defaultBodyWeight;
    const barColor = elBarcode.color || '#0f172a';
    elementsSvg.push(
      `<text x="${bcX}" y="${bcY}" dominant-baseline="hanging" font-family="${fontFamily}" font-size="${secSize}px" font-weight="${titleWeight}" fill="${elBarcode.secondaryColor || '#64748b'}">${escapeXml(elBarcode.secondaryText || 'SECURITY VERIFICATION')}</text>`,
    );
    const barTop = bcY + Math.round((secPx + 4) * scale);
    let barOffset = 0;
    for (let i = 0; i < 35; i++) {
      const w = (i % 3 === 0 ? 3 : 1.5) * scale;
      elementsSvg.push(
        `<rect x="${bcX + barOffset}" y="${barTop}" width="${w}" height="${Math.round(20 * scale)}" fill="${barColor}" />`,
      );
      barOffset += w + 2 * scale;
    }
    const totalBarsWidth = Math.max(barOffset - 2 * scale, 100);
    elementsSvg.push(
      `<text x="${bcX + Math.round(totalBarsWidth / 2)}" y="${barTop + Math.round(24 * scale)}" text-anchor="middle" dominant-baseline="hanging" font-family="${monoFont}" font-size="${bodySize}px" font-weight="${bodyWeight}" fill="${barColor}">*${escapeXml(ticket.ticketCode)}*</text>`,
    );
  }

  // Footer Note
  const elFooterNote = els.footerNote;
  if (elFooterNote?.visible !== false) {
    const x = Math.round((elFooterNote?.x ?? 30) * scale);
    const y = Math.round((elFooterNote?.y ?? 380) * scale);
    const fontSize = Math.round((elFooterNote?.fontSize ?? 11) * scale);
    const bodyWeight = elFooterNote?.fontWeight || defaultBodyWeight;
    const color = elFooterNote?.color || '#64748b';
    const text = escapeXml(elFooterNote?.text || '* บัตรนี้สามารถสแกนเข้างานได้ 1 ครั้งต่อท่าน - ห้ามทำซ้ำหรือดัดแปลง');
    elementsSvg.push(
      `<text x="${x}" y="${y}" dominant-baseline="hanging" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="${bodyWeight}" fill="${color}">${text}</text>`,
    );
  }

  // Stub Event Summary
  if (els.stubEventSummary?.visible) {
    renderLabeledSvgField(els.stubEventSummary, {
      x: 745,
      y: 26,
      bodySize: 12,
      secSize: 10,
      secText: 'ADMISSION STUB',
      bodyText: `${ticket.eventTitle} · ${ticket.ticketTypeName}`,
      color: '#0f172a',
      secColor: '#64748b',
      defaultAlign: 'center',
    });
  }

  // QR Code Box & SVG
  const elQr = els.qrCode;
  const qrX = Math.round((elQr?.x ?? 754) * scale);
  const qrY = Math.round((elQr?.y ?? 84) * scale);
  const qrSize = Math.round((elQr?.size ?? template?.qrSize ?? 155) * scale);
  const qrInnerPad = Math.round(8 * scale);
  const qrInnerSize = qrSize - qrInnerPad * 2;

  const qrViewBoxMatch = qrSvgXml.match(/viewBox="0 0 (\d+) (\d+)"/);
  const qrNativeSize = qrViewBoxMatch ? Number(qrViewBoxMatch[1]) : 222;
  const qrInnerSvg = qrSvgXml.replace(/^<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');

  if (elQr?.visible !== false) {
    elementsSvg.push(
      `<rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" rx="${Math.round(8 * scale)}" fill="#ffffff" stroke="#e2e8f0" stroke-width="${Math.max(1, Math.round(scale))}" />`,
    );
    elementsSvg.push(
      `<svg x="${qrX + qrInnerPad}" y="${qrY + qrInnerPad}" width="${qrInnerSize}" height="${qrInnerSize}" viewBox="0 0 ${qrNativeSize} ${qrNativeSize}">${qrInnerSvg}</svg>`,
    );
  }

  // QR Code Stub Label
  const elQrLabel = els.qrCodeLabel;
  if (elQrLabel?.visible !== false) {
    const centerX = elQrLabel?.x !== undefined && elQrLabel?.align !== 'center'
      ? Math.round(elQrLabel.x * scale)
      : qrX + Math.round(qrSize / 2);
    const y = Math.round((elQrLabel?.y ?? 263) * scale);
    const fontSize = Math.round((elQrLabel?.fontSize ?? 13) * scale);
    const secPx = elQrLabel?.secondaryFontSize || 10;
    const secSize = Math.round(secPx * scale);
    const bodyWeight = elQrLabel?.fontWeight || defaultBodyWeight;
    const titleWeight = elQrLabel?.secondaryFontWeight || defaultTitleWeight;
    const color = elQrLabel?.color || '#0f172a';
    const showSec = elQrLabel?.showSecondaryText !== false;
    const text = escapeXml(ticket.ticketCode || elQrLabel?.text || '-');
    if (showSec) {
      const secText = escapeXml(elQrLabel?.secondaryText || 'รหัสอ้างอิงบัตร (TICKET CODE)');
      const secColor = elQrLabel?.secondaryColor || '#64748b';
      elementsSvg.push(
        `<text x="${centerX}" y="${y}" text-anchor="middle" dominant-baseline="hanging" font-family="${fontFamily}" font-size="${secSize}px" font-weight="${titleWeight}" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${centerX}" y="${y + Math.round((secPx + 4) * scale)}" text-anchor="middle" dominant-baseline="hanging" font-family="${monoFont}" font-size="${fontSize}px" font-weight="${bodyWeight}" fill="${color}">${text}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${centerX}" y="${y}" text-anchor="middle" dominant-baseline="hanging" font-family="${monoFont}" font-size="${fontSize}px" font-weight="${bodyWeight}" fill="${color}">${text}</text>`,
      );
    }
  }

  // Scan Hint
  if (els.scanHint?.visible) {
    const x = Math.round((els.scanHint.x ?? 760) * scale);
    const y = Math.round((els.scanHint.y ?? 335) * scale);
    const fontSize = Math.round((els.scanHint.fontSize ?? 11) * scale);
    const bodyWeight = els.scanHint.fontWeight || defaultBodyWeight;
    const align = els.scanHint.align || 'center';
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const targetX = align === 'center' ? qrX + Math.round(qrSize / 2) : x;
    elementsSvg.push(
      `<text x="${targetX}" y="${y}" text-anchor="${anchor}" dominant-baseline="hanging" font-family="${fontFamily}" font-size="${fontSize}px" font-weight="${bodyWeight}" fill="${els.scanHint.color || '#64748b'}">${escapeXml(els.scanHint.text || 'แสดง QR เพื่อสแกนเข้างาน')}</text>`,
    );
  }

  // Order ID
  const elOrderId = els.orderId;
  if (elOrderId?.visible !== false) {
    const centerX = qrX + Math.round(qrSize / 2);
    const y = Math.round((elOrderId?.y ?? 362) * scale);
    const rawFontSize = Math.round((elOrderId?.fontSize ?? 11) * scale);
    const rawOrderIdText = ticket.orderId || elOrderId?.text || '-';
    const fontSize = rawOrderIdText.length > 24 ? Math.min(rawFontSize, Math.round(9 * scale)) : rawFontSize;
    const secPx = elOrderId?.secondaryFontSize || 10;
    const secSize = Math.round(secPx * scale);
    const bodyWeight = elOrderId?.fontWeight || defaultBodyWeight;
    const titleWeight = elOrderId?.secondaryFontWeight || defaultTitleWeight;
    const color = elOrderId?.color || '#0f172a';
    const showSec = elOrderId?.showSecondaryText !== false;
    const text = escapeXml(ticket.orderId || elOrderId?.text || '-');
    if (showSec) {
      const secText = escapeXml(elOrderId?.secondaryText || 'หมายเลขคำสั่งซื้อ (ORDER ID)');
      const secColor = elOrderId?.secondaryColor || '#64748b';
      elementsSvg.push(
        `<text x="${centerX}" y="${y}" text-anchor="middle" dominant-baseline="hanging" font-family="${fontFamily}" font-size="${secSize}px" font-weight="${titleWeight}" fill="${secColor}">${secText}</text>`,
      );
      elementsSvg.push(
        `<text x="${centerX}" y="${y + Math.round((secPx + 4) * scale)}" text-anchor="middle" dominant-baseline="hanging" font-family="${monoFont}" font-size="${fontSize}px" font-weight="${bodyWeight}" fill="${color}">${text}</text>`,
      );
    } else {
      elementsSvg.push(
        `<text x="${centerX}" y="${y}" text-anchor="middle" dominant-baseline="hanging" font-family="${monoFont}" font-size="${fontSize}px" font-weight="${bodyWeight}" fill="${color}">${text}</text>`,
      );
    }
  }

  // Tear line if enabled
  if (template?.tearLineStyle !== 'none') {
    const tearX = Math.round((template?.tearLineX ?? 720) * scale);
    const tearColor = template?.tearLineColor || '#cbd5e1';
    const dash =
      template?.tearLineStyle === 'dashed' || !template?.tearLineStyle
        ? 'stroke-dasharray="8,8"'
        : template.tearLineStyle === 'dotted'
        ? 'stroke-dasharray="3,5"'
        : '';
    elementsSvg.push(
      `<line x1="${tearX}" y1="0" x2="${tearX}" y2="${height}" stroke="${tearColor}" stroke-width="2" ${dash} />`,
    );
  }

  // Border Outline
  const cardRadius = Math.max(Math.round((typeof template?.borderRadius === 'number' ? template.borderRadius : 4) * scale), 0);
  const borderWidth = template?.borderWidth && template.borderWidth > 0 ? template.borderWidth * scale : 2;
  const borderColor = (template?.borderWidth && template.borderWidth > 0 && template.borderColor && template.borderColor !== 'transparent')
    ? template.borderColor
    : '#e2e8f0';
  elementsSvg.push(
    `<rect x="${borderWidth / 2}" y="${borderWidth / 2}" width="${width - borderWidth}" height="${height - borderWidth}" rx="${cardRadius}" fill="none" stroke="${borderColor}" stroke-width="${borderWidth}" />`,
  );

  const renderSvgWithResvg = (svgMarkup: string): Buffer => {
    const resvg = new Resvg(svgMarkup, {
      fitTo: { mode: 'width', value: width },
      font: {
        fontFiles,
        defaultFontFamily: 'Kanit',
        sansSerifFamily: 'Kanit',
        monospaceFamily: 'Kanit',
        loadSystemFonts: false,
      },
    });
    return Buffer.from(resvg.render().asPng());
  };

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

    const overlayPng = renderSvgWithResvg(overlaySvg);
    return await sharp(resizedBg)
      .composite([{ input: overlayPng, top: 0, left: 0 }])
      .png()
      .toBuffer();
  }

  // Background SVG when no image buffer
  let bgElement = '';
  if (bgType === 'gradient') {
    const angle = template?.gradientAngle ?? 135;
    const startColor = template?.gradientStart || '#ffffff';
    const endColor = template?.gradientEnd || '#0f172a';
    bgElement = `
      <defs>
        <linearGradient id="ticketBgGrad" gradientTransform="rotate(${angle})">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="${cardRadius}" fill="url(#ticketBgGrad)" />`;
  } else {
    const hasLightText = ['#fff', '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0'].includes(
      (els.eventTitle?.color || '').toLowerCase(),
    );
    const bgColor = bgType === 'image' && hasLightText ? '#1e293b' : (template?.bgColor || '#ffffff');
    bgElement = `<rect x="0" y="0" width="${width}" height="${height}" rx="${cardRadius}" fill="${bgColor}" />`;
  }

  const fullSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${bgElement}
  ${elementsSvg.join('\n  ')}
</svg>`;

  return renderSvgWithResvg(fullSvg);
}
