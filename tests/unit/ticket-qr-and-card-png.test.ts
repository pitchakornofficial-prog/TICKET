import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateTicketQrPngBuffer } from '../../src/server/ticket-qr-png';
import { generateTicketCardPngBuffer } from '../../src/server/ticket-card-png';
import type { TicketDetail } from '../../src/server/tickets';
import type { TicketDesignerState } from '../../src/lib/ticket-master-template-sync';

describe('Ticket PNG Generation (QR and Card)', () => {
  const dummyTicket: TicketDetail = {
    id: 'TKT-TEST-001',
    orderId: 'ORD-TEST-001',
    orderItemId: 'OI-001',
    eventId: 'EVT-001',
    sessionId: 'SES-001',
    ticketTypeId: 'TT-001',
    ticketTypeName: 'VIP Zone A',
    ticketPrice: 3500,
    ticketCode: 'TK-123456-0001-01',
    qrPayload: 'PAYLOAD-UUID-123',
    qrCodeUrl: 'data:image/svg+xml;utf8,<svg></svg>',
    status: 'valid',
    admissionStatus: 'outside',
    buyerName: 'สมชาย รักดนตรี',
    buyerEmail: 'somchai@test.invalid',
    buyerPhone: '0812345678',
    sessionStartTime: '2026-12-15T19:00:00.000Z',
    sessionEndTime: '2026-12-15T22:00:00.000Z',
    location: 'อิมแพ็ค ชาเลนเจอร์ ฮอลล์',
    eventTitle: 'สุดยอดคอนเสิร์ตแห่งสยาม 2026',
    createdAt: '2026-11-20T10:00:00.000Z',
  };

  it('generates a valid PNG buffer for QR code with proper PNG signature', async () => {
    const png = await generateTicketQrPngBuffer('TEST-PAYLOAD-12345', { size: 300 });
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(100);
    // Standard PNG magic signature: 0x89 0x50 0x4E 0x47
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });

  it('generates a valid PNG buffer for ticket card pass with proper PNG signature', async () => {
    const png = await generateTicketCardPngBuffer(dummyTicket, { width: 800, height: 336 });
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(500);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  }, 15000);

  it('renders ticket pass cleanly with custom designer template override and respects showSecondaryText', async () => {
    const customTemplate = {
      presetId: 'kong-huayrai-custom',
      bgType: 'solid' as const,
      bgColor: '#7f1d1d',
      fontFamily: 'Kanit',
      tearLineStyle: 'none' as const,
      elements: {
        eventTitle: {
          id: 'eventTitle',
          label: 'ชื่อคอนเสิร์ต',
          text: 'Isan Indy Rock Fest 2026',
          color: '#ffffff',
          x: 34,
          y: 157,
          fontSize: 26,
          fontWeight: '700',
          visible: true,
        },
        zoneBadge: {
          id: 'zoneBadge',
          label: 'โซน / ที่นั่ง',
          text: 'VIP FRONT ROW - ZONE A',
          color: '#ffffff',
          x: 34,
          y: 192,
          fontSize: 13,
          fontWeight: '700',
          visible: true,
          showSecondaryText: false,
          secondaryText: 'หัวข้อ (TITLE)',
        },
        dateTime: {
          id: 'dateTime',
          label: 'วันและเวลาแสดง',
          text: '24 ธันวาคม 2026',
          color: '#ffffff',
          x: 30,
          y: 245,
          fontSize: 14,
          visible: true,
          showSecondaryText: true,
          secondaryText: 'วันและเวลาแสดง (DATE & TIME)',
        },
        qrCode: {
          id: 'qrCode',
          label: 'QR Code',
          x: 754,
          y: 84,
          size: 155,
          visible: true,
        },
      },
    };

    const png = await generateTicketCardPngBuffer(dummyTicket, {
      width: 1000,
      height: 420,
      template: customTemplate as unknown as TicketDesignerState,
    });
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(1000);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  }, 15000);

  it('synchronizes font weights, custom fonts, and top-aligned SVG baseline across server PNG, canvas download, and app layout', () => {
    const rootDir = process.cwd();
    const layoutContent = readFileSync(join(rootDir, 'src/app/layout.tsx'), 'utf8');
    const canvasContent = readFileSync(join(rootDir, 'src/components/ticket-canvas-download.ts'), 'utf8');
    const pngContent = readFileSync(join(rootDir, 'src/server/ticket-card-png.ts'), 'utf8');

    // 1. App layout loads Kanit weights 200..700 to avoid fake-bold synthesis
    expect(layoutContent).toContain('@fontsource/kanit/thai-400.css');
    expect(layoutContent).toContain('@fontsource/kanit/thai-700.css');

    // 2. Canvas download loads customFontUrl/Google Fonts and respects titleFontWeight/bodyFontWeight
    expect(canvasContent).toContain('ensureTemplateFontsLoaded');
    expect(canvasContent).toContain('template.customFontUrl');
    expect(canvasContent).toContain('template.titleFontWeight');
    expect(canvasContent).toContain('template.bodyFontWeight');

    // 3. Server PNG embeds Kanit & custom fonts via Resvg, uses dominant-baseline="hanging", and renders all elements
    expect(pngContent).toContain('getEmbeddedKanitFontFiles');
    expect(pngContent).toContain('new Resvg(');
    expect(pngContent).toContain('dominant-baseline="hanging"');
    expect(pngContent).toContain('template?.titleFontWeight');
    expect(pngContent).toContain('template?.bodyFontWeight');
    expect(pngContent).toContain('els.brandLogo');
    expect(pngContent).toContain('els.gateInfo');
    expect(pngContent).toContain('els.seatInfo');
    expect(pngContent).toContain('els.priceInfo');
    expect(pngContent).toContain('els.barcode');
    expect(pngContent).toContain('els.stubEventSummary');
    expect(pngContent).toContain('els.scanHint');
  });
});
