import type { TicketDetail } from '@/server/tickets';
import { formatDate, formatTime } from '@/lib/locale';
import { generateCustomQrSvg } from '@/lib/ticket-qr';
import {
  type TicketDesignerState,
  loadLocalMasterTemplate,
  loadPublicMasterTemplate,
} from '@/lib/ticket-master-template-sync';

export const FONT_SANS = 'Kanit, "Noto Sans Thai", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif';
export const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const loadedFontCache = new Set<string>();
let cachedServerMasterTemplate: TicketDesignerState | null = null;
let inFlightMasterTemplateFetch: Promise<TicketDesignerState | null> | null = null;
let templateInvalidationListenerBound = false;

async function resolveFreshMasterTemplate(): Promise<TicketDesignerState> {
  if (typeof window === 'undefined') {
    return loadLocalMasterTemplate();
  }
  if (!templateInvalidationListenerBound) {
    templateInvalidationListenerBound = true;
    const invalidate = () => {
      cachedServerMasterTemplate = null;
      inFlightMasterTemplateFetch = null;
    };
    window.addEventListener('ticket_master_template_updated', invalidate);
    window.addEventListener('ticket:master-template-changed', invalidate);
  }
  if (cachedServerMasterTemplate) {
    return cachedServerMasterTemplate;
  }
  if (!inFlightMasterTemplateFetch) {
    inFlightMasterTemplateFetch = loadPublicMasterTemplate()
      .then((tpl) => {
        if (tpl) {
          cachedServerMasterTemplate = tpl;
        }
        return tpl;
      })
      .catch(() => null)
      .finally(() => {
        inFlightMasterTemplateFetch = null;
      });
  }
  const serverTemplate = await inFlightMasterTemplateFetch;
  return serverTemplate || loadLocalMasterTemplate();
}

/**
 * Ensures custom uploaded fonts and selected Google Fonts (Sarabun, Prompt, Chakra Petch)
 * are loaded into document.fonts before rendering onto HTML5 Canvas.
 */
export async function ensureTemplateFontsLoaded(template: Partial<TicketDesignerState>): Promise<void> {
  if (typeof document === 'undefined') return;

  if (template.customFontUrl && template.customFontName && typeof FontFace !== 'undefined') {
    const cacheKey = `${template.customFontName}::${template.customFontUrl}`;
    if (!loadedFontCache.has(cacheKey)) {
      try {
        const face = new FontFace(template.customFontName, `url("${template.customFontUrl}")`);
        const loaded = await face.load();
        document.fonts.add(loaded);
        loadedFontCache.add(cacheKey);
      } catch {
        // Ignore font load errors and fall back cleanly
      }
    }
  }

  const family = template.fontFamily;
  const googleFonts: Record<string, string> = {
    Sarabun: 'Sarabun:wght@200;300;400;500;600;700',
    Prompt: 'Prompt:wght@200;300;400;500;600;700',
    'Chakra Petch': 'Chakra+Petch:wght@300;400;500;600;700',
  };

  if (family && googleFonts[family] && !loadedFontCache.has(`gfont::${family}`)) {
    const linkId = `ticket-gfont-${family.toLowerCase().replace(/\s+/g, '-')}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${googleFonts[family]}&display=swap`;
      document.head.appendChild(link);
    }
    loadedFontCache.add(`gfont::${family}`);
    try {
      await document.fonts.load(`400 16px "${family}"`);
    } catch {
      // Ignore if offline or blocked
    }
  }

  if (document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // fallback to system font stack
    }
  }
}

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
  align: 'left' | 'center' | 'right' = 'left',
  fontWeight?: string,
): void {
  if (!text) return;
  ctx.save();
  ctx.textAlign = align;
  let fontSize = initialFontSize;
  const weight = fontWeight ? `${fontWeight} ` : isBold ? '700 ' : '400 ';
  ctx.font = `${weight}${fontSize}px ${fontFamily}`;
  while (ctx.measureText(text).width > maxWidth && fontSize > minFontSize) {
    fontSize -= 1;
    ctx.font = `${weight}${fontSize}px ${fontFamily}`;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Draws a labeled ticket field where the header is the fixed anchor,
 * and the detail text is aligned relative to the header (left, center, or right).
 * Header position (posX, posY) never moves regardless of detail text length.
 */
function drawLabeledField(
  ctx: CanvasRenderingContext2D,
  headerText: string,
  detailText: string,
  posX: number,
  posY: number,
  maxWidth: number,
  fontSize: number,
  minFontSize: number,
  fontFamily: string,
  headerColor: string,
  detailColor: string,
  align: 'left' | 'center' | 'right' = 'left',
  isDetailBold = true,
  offsetY = 22,
  headerFont?: string,
  showHeader = true,
  detailFontWeight?: string,
): void {
  if (!showHeader || !headerText) {
    ctx.fillStyle = detailColor;
    renderTextFitted(
      ctx,
      detailText,
      posX,
      posY,
      maxWidth,
      fontSize,
      minFontSize,
      fontFamily,
      isDetailBold,
      align,
      detailFontWeight,
    );
    return;
  }

  // 1. Header is ALWAYS anchored at posX (fixed position, never shifted by detail length)
  ctx.save();
  ctx.font = headerFont || `500 11px ${fontFamily}`;
  ctx.fillStyle = headerColor;
  ctx.textAlign = 'left';
  ctx.fillText(headerText, posX, posY);
  const headerWidth = ctx.measureText(headerText).width;
  ctx.restore();

  // 2. Detail value is aligned relative to header (left, center, or right)
  const isCenter = align === 'center';
  const isRight = align === 'right';
  const anchorX = isCenter ? posX + headerWidth / 2 : isRight ? posX + headerWidth : posX;

  ctx.fillStyle = detailColor;
  renderTextFitted(
    ctx,
    detailText,
    anchorX,
    posY + offsetY,
    maxWidth,
    fontSize,
    minFontSize,
    fontFamily,
    isDetailBold,
    align,
    detailFontWeight,
  );
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
  fontFamily = FONT_SANS,
  fontWeight = '700',
): number {
  if (!text) return y;

  let fontSize = initialFontSize;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return y;
  }

  while (fontSize > minFontSize) {
    fontSize -= 1;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
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

  const template = overrideTemplate || (await resolveFreshMasterTemplate());
  await ensureTemplateFontsLoaded(template);

  const fontFam = template.fontFamily && template.fontFamily !== 'Kanit'
    ? `"${template.fontFamily}", ${FONT_SANS}`
    : FONT_SANS;
  const defaultTitleWeight = String(template.titleFontWeight ?? 400);
  const defaultBodyWeight = String(template.bodyFontWeight ?? 400);
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
  const getFieldStyles = (
    el: NonNullable<TicketDesignerState['elements'][string]>,
    defaultBodySize: number,
    defaultSecSize = 11,
  ) => {
    const titleWeight = el.secondaryFontWeight || defaultTitleWeight;
    const bodyWeight = el.fontWeight || defaultBodyWeight;
    const secPx = el.secondaryFontSize || defaultSecSize;
    const bodyPx = el.fontSize || defaultBodySize;
    const secSize = Math.round(secPx * scaleFactor);
    const bodySize = Math.round(bodyPx * scaleFactor);
    const offsetY = Math.round((secPx + 5) * scaleFactor);
    return {
      titleWeight,
      bodyWeight,
      secSize,
      bodySize,
      offsetY,
      headerFont: `${titleWeight} ${secSize}px ${fontFam}`,
    };
  };

  // Brand Logo
  const logo = elements.brandLogo;
  if (logo?.visible) {
    const logoX = logo.x * scaleFactor;
    const logoY = logo.y * scaleFactor;
    const st = getFieldStyles(logo, 16, 10);
    ctx.fillStyle = logo.color || '#0f172a';
    ctx.font = `${st.bodyWeight} ${st.bodySize}px ${fontFam}`;
    ctx.fillText(logo.text || 'TICKET', logoX + Math.round(24 * scaleFactor), logoY);
    if (logo.showSecondaryText !== false && logo.secondaryText) {
      ctx.fillStyle = logo.secondaryColor || '#64748b';
      ctx.font = `${st.titleWeight} ${st.secSize}px ${fontFam}`;
      ctx.fillText(logo.secondaryText, logoX + Math.round(92 * scaleFactor), logoY + Math.round(4 * scaleFactor));
    }
  }

  // Event Title (Full text without any ellipsis truncation)
  const title = elements.eventTitle;
  if (title?.visible) {
    const titleX = title.x * scaleFactor;
    const titleY = title.y * scaleFactor;
    const titleWidth = Math.max(stubX - titleX - 40, 400);
    const st = getFieldStyles(title, 26, 11);
    const lineHeight = Math.round((title.fontSize || 26) * 1.15 * scaleFactor);
    ctx.fillStyle = title.color || '#0f172a';
    renderFullEventTitle(ctx, ticket.eventTitle, titleX, titleY, titleWidth, st.bodySize, Math.round(18 * scaleFactor), lineHeight, fontFam, st.bodyWeight);
  }

  // Ticket Type / Zone (Matching other meta items, no frame)
  const badge = elements.zoneBadge;
  if (badge?.visible) {
    const badgeX = badge.x * scaleFactor;
    const badgeY = badge.y * scaleFactor;
    const st = getFieldStyles(badge, 16, 11);
    const align = badge.align || 'left';
    const showHeader = badge.showSecondaryText === true && Boolean(badge.secondaryText);
    drawLabeledField(
      ctx,
      badge.secondaryText || 'โซน / ประเภทบัตร (ZONE & CATEGORY)',
      ticket.ticketTypeName,
      badgeX,
      badgeY,
      Math.max(stubX - badgeX - 40, 300),
      st.bodySize,
      12,
      fontFam,
      badge.secondaryColor || '#64748b',
      badge.color || '#0f172a',
      align,
      false,
      st.offsetY,
      st.headerFont,
      showHeader,
      st.bodyWeight,
    );
  }

  // Gate Info
  const gate = elements.gateInfo;
  if (gate?.visible) {
    const gX = gate.x * scaleFactor;
    const gY = gate.y * scaleFactor;
    const val = (ticket as unknown as { gate?: string }).gate || gate.text || 'GATE 2';
    const align = gate.align || 'left';
    const showHeader = gate.showSecondaryText !== false;
    const st = getFieldStyles(gate, 16, 11);
    drawLabeledField(
      ctx,
      gate.secondaryText || 'ประตูทางเข้า (GATE)',
      val,
      gX,
      gY,
      130 * scaleFactor,
      st.bodySize,
      12,
      fontFam,
      gate.secondaryColor || '#64748b',
      gate.color || '#0f172a',
      align,
      false,
      st.offsetY,
      st.headerFont,
      showHeader,
      st.bodyWeight,
    );
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
    const align = seat.align || 'left';
    const showHeader = seat.showSecondaryText !== false;
    const st = getFieldStyles(seat, 16, 11);
    drawLabeledField(
      ctx,
      seat.secondaryText || 'แถว/ที่นั่ง (ROW / SEAT)',
      val,
      sX,
      sY,
      160 * scaleFactor,
      st.bodySize,
      12,
      fontFam,
      seat.secondaryColor || '#64748b',
      seat.color || '#0f172a',
      align,
      false,
      st.offsetY,
      st.headerFont,
      showHeader,
      st.bodyWeight,
    );
  }

  // Price Info
  const price = elements.priceInfo;
  if (price?.visible) {
    const pX = price.x * scaleFactor;
    const pY = price.y * scaleFactor;
    const priceNum = (ticket as unknown as { price?: number; ticketPrice?: number }).ticketPrice ?? (ticket as unknown as { price?: number }).price;
    const priceDisplayMode = (ticket as unknown as { priceDisplayMode?: string }).priceDisplayMode;
    let val = '';
    if (priceDisplayMode === 'complimentary') {
      val = 'บัตรเชิญ (COMPLIMENTARY)';
    } else if (typeof priceNum === 'number') {
      val = `THB ${priceNum.toLocaleString('th-TH')}`;
    } else {
      val = price.text || '';
    }
    if (val) {
      const align = price.align || 'left';
      const showHeader = price.showSecondaryText !== false;
      const st = getFieldStyles(price, 16, 11);
      drawLabeledField(
        ctx,
        price.secondaryText || 'ราคาบัตร (PRICE)',
        val,
        pX,
        pY,
        140 * scaleFactor,
        st.bodySize,
        12,
        fontFam,
        price.secondaryColor || '#64748b',
        price.color || '#0f172a',
        align,
        false,
        st.offsetY,
        st.headerFont,
        showHeader,
        st.bodyWeight,
      );
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
    const align = dt.align || 'left';
    const showHeader = dt.showSecondaryText !== false;
    const st = getFieldStyles(dt, 14, 11);
    drawLabeledField(
      ctx,
      dt.secondaryText || 'วันและเวลาแสดง (DATE & TIME)',
      showDate,
      dtX,
      dtY,
      380 * scaleFactor,
      st.bodySize,
      12,
      fontFam,
      dt.secondaryColor || '#64748b',
      dt.color || '#0f172a',
      align,
      false,
      st.offsetY,
      st.headerFont,
      showHeader,
      st.bodyWeight,
    );
  }

  // Venue
  const ven = elements.venue;
  if (ven?.visible) {
    const venX = ven.x * scaleFactor;
    const venY = ven.y * scaleFactor;
    const align = ven.align || 'left';
    const showHeader = ven.showSecondaryText !== false;
    const st = getFieldStyles(ven, 14, 11);
    drawLabeledField(
      ctx,
      ven.secondaryText || 'สถานที่จัดงาน (VENUE)',
      ticket.location,
      venX,
      venY,
      380 * scaleFactor,
      st.bodySize,
      12,
      fontFam,
      ven.secondaryColor || '#64748b',
      ven.color || '#0f172a',
      align,
      false,
      st.offsetY,
      st.headerFont,
      showHeader,
      st.bodyWeight,
    );
  }

  // Buyer Name
  const buyer = elements.buyerName;
  if (buyer?.visible) {
    const bX = buyer.x * scaleFactor;
    const bY = buyer.y * scaleFactor;
    const align = buyer.align || 'left';
    const showHeader = buyer.showSecondaryText !== false;
    const bMaxW = Math.max(stubX - bX - 20, 180 * scaleFactor);
    const st = getFieldStyles(buyer, 13, 11);
    drawLabeledField(
      ctx,
      buyer.secondaryText || 'ผู้สั่งซื้อ (BUYER)',
      ticket.buyerName,
      bX,
      bY,
      bMaxW,
      st.bodySize,
      12,
      fontFam,
      buyer.secondaryColor || '#64748b',
      buyer.color || '#0f172a',
      align,
      false,
      st.offsetY,
      st.headerFont,
      showHeader,
      st.bodyWeight,
    );
  }

  // Ticket Code
  const tCode = elements.ticketCode;
  if (tCode?.visible) {
    const tcX = tCode.x * scaleFactor;
    const tcY = tCode.y * scaleFactor;
    const align = tCode.align || 'left';
    const showHeader = tCode.showSecondaryText !== false;
    const tcMaxW = buyer?.visible && buyer.x > tCode.x && Math.abs(buyer.y - tCode.y) < 30
      ? (buyer.x - tCode.x - 12) * scaleFactor
      : 380 * scaleFactor;
    const st = getFieldStyles(tCode, 14, 11);
    drawLabeledField(
      ctx,
      tCode.secondaryText || 'รหัสบัตร (TICKET CODE)',
      ticket.ticketCode,
      tcX,
      tcY,
      tcMaxW,
      st.bodySize,
      12,
      FONT_MONO,
      tCode.secondaryColor || '#64748b',
      tCode.color || '#0f172a',
      align,
      false,
      st.offsetY,
      st.headerFont,
      showHeader,
      st.bodyWeight,
    );
  }

  // Security Barcode
  const bcode = elements.barcode;
  if (bcode?.visible) {
    const bcX = bcode.x * scaleFactor;
    const bcY = bcode.y * scaleFactor;
    const st = getFieldStyles(bcode, 11, 10);
    ctx.save();
    ctx.fillStyle = bcode.secondaryColor || '#64748b';
    ctx.font = `${st.titleWeight} ${st.secSize}px ${fontFam}`;
    ctx.fillText(bcode.secondaryText || 'SECURITY VERIFICATION', bcX, bcY);
    const barTop = bcY + Math.round(((bcode.secondaryFontSize || 10) + 4) * scaleFactor);
    ctx.fillStyle = bcode.color || '#0f172a';
    let barOffset = 0;
    for (let i = 0; i < 35; i++) {
      const w = (i % 3 === 0 ? 3 : 1.5) * scaleFactor;
      ctx.fillRect(bcX + barOffset, barTop, w, 20 * scaleFactor);
      barOffset += w + 2 * scaleFactor;
    }
    const totalBarsWidth = Math.max(barOffset - 2 * scaleFactor, 100);
    const codeString = `*${ticket.ticketCode}*`;
    ctx.font = `${st.bodyWeight} ${st.bodySize}px ${FONT_MONO}`;
    const codeW = ctx.measureText(codeString).width;
    // Align code directly under center of barcode bars matching designer
    ctx.fillText(codeString, bcX + Math.max(0, (totalBarsWidth - codeW) / 2), barTop + 24 * scaleFactor);
    ctx.restore();
  }

  // Footer Disclaimer Note
  const fn = elements.footerNote;
  if (fn?.visible) {
    const fnX = fn.x * scaleFactor;
    const fnY = fn.y * scaleFactor;
    const st = getFieldStyles(fn, 11, 10);
    ctx.font = `${st.bodyWeight} ${st.bodySize}px ${fontFam}`;
    ctx.fillStyle = fn.color || '#64748b';
    ctx.fillText(fn.text || '* กรุณาแสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน · บัตรนี้สามารถสแกนได้ 1 ครั้ง', fnX, fnY);
  }

  // Stub Event Summary
  const ses = elements.stubEventSummary;
  if (ses?.visible) {
    const sesX = ses.x * scaleFactor;
    const sesY = ses.y * scaleFactor;
    const isCenter = ses.align === 'center';
    const st = getFieldStyles(ses, 12, 10);
    ctx.save();
    ctx.fillStyle = ses.secondaryColor || '#64748b';
    ctx.font = `${st.titleWeight} ${st.secSize}px ${fontFam}`;
    const badgeText = ses.secondaryText || 'ADMISSION STUB';
    const sumText = `${ticket.eventTitle} · ${ticket.ticketTypeName}`;
    const availableWidth = width - sesX - 20;
    if (isCenter) {
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, sesX + availableWidth / 2, sesY);
      ctx.fillStyle = ses.color || '#0f172a';
      renderTextFitted(ctx, sumText, sesX + availableWidth / 2, sesY + st.offsetY, availableWidth, st.bodySize, 10, fontFam, false, 'center', st.bodyWeight);
    } else {
      ctx.fillText(badgeText, sesX, sesY);
      ctx.fillStyle = ses.color || '#0f172a';
      renderTextFitted(ctx, sumText, sesX, sesY + st.offsetY, availableWidth, st.bodySize, 10, fontFam, false, 'left', st.bodyWeight);
    }
    ctx.restore();
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

    // Always draw pure white #ffffff QR container box (never invert to dark on dark ticket themes)
    ctx.save();
    ctx.fillStyle = '#ffffff';
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

    let pureBwQrSrc = ticket.qrCodeUrl;
    try {
      const qrInput = ticket.qrPayload || ticket.ticketCode;
      if (qrInput) {
        pureBwQrSrc = generateCustomQrSvg(qrInput, {
          fgColor: '#000000',
          bgColor: '#ffffff',
        });
      }
    } catch {
      pureBwQrSrc = ticket.qrCodeUrl;
    }

    if (pureBwQrSrc) {
      try {
        const qrImg = new Image();
        await new Promise<void>((resolve, reject) => {
          qrImg.onload = () => resolve();
          qrImg.onerror = () => reject();
          qrImg.src = pureBwQrSrc;
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
          const fallbackSrc =
            ticket.qrCodeUrl && ticket.qrCodeUrl !== pureBwQrSrc
              ? ticket.qrCodeUrl
              : generateCustomQrSvg(ticket.ticketCode, {
                  fgColor: '#000000',
                  bgColor: '#ffffff',
                });
          const qrSvgImg = new Image();
          await new Promise<void>((resolve, reject) => {
            qrSvgImg.onload = () => resolve();
            qrSvgImg.onerror = () => reject();
            qrSvgImg.src = fallbackSrc;
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
          ctx.font = `200 14px ${fontFam}`;
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
    const align = qrl.align || 'center';
    const showHeader = qrl.showSecondaryText !== false;
    const tagText = qrl.secondaryText || 'รหัสบัตรสำหรับเข้างาน';
    const codeText = ticket.ticketCode;
    const st = getFieldStyles(qrl, 13, 10);
    drawLabeledField(
      ctx,
      tagText,
      codeText,
      qrlX,
      qrlY,
      220 * scaleFactor,
      st.bodySize,
      11,
      FONT_MONO,
      qrl.secondaryColor || '#64748b',
      qrl.color || '#0f172a',
      align,
      false,
      st.offsetY,
      st.headerFont,
      showHeader,
      st.bodyWeight,
    );
  }

  // Scan Instruction Hint
  const sh = elements.scanHint;
  if (sh?.visible) {
    const shX = sh.x * scaleFactor;
    const shY = sh.y * scaleFactor;
    const align = sh.align || 'center';
    const isCenter = align === 'center';
    const st = getFieldStyles(sh, 11, 10);
    ctx.save();
    ctx.font = `${st.bodyWeight} ${st.bodySize}px ${fontFam}`;
    ctx.fillStyle = sh.color || '#64748b';
    const hintText = sh.text || 'แสดง QR เพื่อสแกนเข้างาน';
    if (isCenter) {
      const hintW = ctx.measureText(hintText).width;
      ctx.textAlign = 'center';
      ctx.fillText(hintText, shX + hintW / 2, shY);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(hintText, shX, shY);
    }
    ctx.restore();
  }

  // Order ID
  const oid = elements.orderId;
  if (oid?.visible) {
    const oX = oid.x * scaleFactor;
    const oY = oid.y * scaleFactor;
    const align = oid.align || 'center';
    const showHeader = oid.showSecondaryText !== false;
    const tagText = oid.secondaryText || 'หมายเลขคำสั่งซื้อ (ORDER ID)';
    const orderText = ticket.orderId || oid.text || '-';
    const st = getFieldStyles(oid, 11, 10);
    drawLabeledField(
      ctx,
      tagText,
      orderText,
      oX,
      oY,
      220 * scaleFactor,
      st.bodySize,
      10,
      FONT_MONO,
      oid.secondaryColor || '#64748b',
      oid.color || '#0f172a',
      align,
      false,
      st.offsetY,
      st.headerFont,
      showHeader,
      st.bodyWeight,
    );
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

export async function downloadAllTicketsAsZip(
  tickets: TicketDetail[],
  zipFilename: string,
  options?: {
    priceDisplayMode?: 'face_value' | 'complimentary';
    overrideTemplate?: TicketDesignerState;
    onProgress?: (current: number, total: number) => void;
  },
): Promise<void> {
  const { buildZipBlob } = await import('@/lib/zip-builder');
  const files: { name: string; data: Uint8Array | string }[] = [];

  const csvRows: string[] = [
    '\uFEFF"ลำดับ","รหัสบัตร","ประเภทบัตร","ราคาบัตร","คอนเสิร์ต","รอบการแสดง","สถานที่","ชื่อผู้ถือบัตร","อีเมล","หมายเลขรายการ","สถานะ"',
  ];

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (options?.priceDisplayMode) {
      (t as unknown as { priceDisplayMode?: string }).priceDisplayMode = options.priceDisplayMode;
    }

    const canvas = await generateTicketCanvas(t, options?.overrideTemplate);
    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.split(',')[1];
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let j = 0; j < binaryStr.length; j++) {
      bytes[j] = binaryStr.charCodeAt(j);
    }

    const paddedIdx = String(i + 1).padStart(3, '0');
    const safeTypeName = t.ticketTypeName.replace(/[/\\?%*:|"<>]/g, '_');
    const safeCode = t.ticketCode.replace(/[/\\?%*:|"<>]/g, '_');
    const filename = `${paddedIdx}_${safeTypeName}_${safeCode}.png`;

    files.push({ name: filename, data: bytes });

    const priceText = options?.priceDisplayMode === 'complimentary' ? 'บัตรเชิญ' : `${t.ticketPrice} บาท`;
    csvRows.push(
      `"${i + 1}","${t.ticketCode}","${t.ticketTypeName.replace(/"/g, '""')}","${priceText}","${t.eventTitle.replace(/"/g, '""')}","${t.sessionStartTime}","${t.location.replace(/"/g, '""')}","${t.buyerName.replace(/"/g, '""')}","${t.buyerEmail}","${t.orderId}","${t.status}"`,
    );

    if (options?.onProgress) {
      options.onProgress(i + 1, tickets.length);
    }

    if (i % 5 === 0) {
      await new Promise(r => setTimeout(r, 20));
    }
  }

  files.push({
    name: 'tickets-summary.csv',
    data: csvRows.join('\r\n'),
  });

  const zipBlob = buildZipBlob(files);
  const downloadUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

const syncedTicketImageKeys = new Set<string>();

/**
 * Best-effort background upload of a browser-rendered ticket PNG so email links
 * and /api/public/tickets/[id]/image serve the exact web-rendered image.
 */
export async function syncBrowserRenderedTicketImage(
  ticketId: string,
  dataUrl: string,
): Promise<void> {
  if (typeof window === 'undefined' || !ticketId || !dataUrl.startsWith('data:image/png;base64,')) {
    return;
  }
  const cacheKey = `${ticketId}:${dataUrl.length}`;
  if (syncedTicketImageKeys.has(cacheKey)) return;
  syncedTicketImageKeys.add(cacheKey);

  try {
    const guestToken = sessionStorage.getItem('ticket_guest_otp_token') || '';
    const orderToken = new URLSearchParams(window.location.search).get('token') || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (guestToken) headers['x-guest-token'] = guestToken;
    if (orderToken) headers['x-order-token'] = orderToken;

    const res = await fetch(`/api/public/tickets/${encodeURIComponent(ticketId)}/image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dataUrl }),
    });
    if (!res.ok) {
      syncedTicketImageKeys.delete(cacheKey);
    }
  } catch {
    syncedTicketImageKeys.delete(cacheKey);
  }
}
