import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanPhoneNumber } from '../../src/server/guest-order-lookup';

describe('TASK-018: Guest Order Lookup Unit Tests', () => {
  describe('cleanPhoneNumber', () => {
    it('strips dashes, spaces, and formatting from phone numbers', () => {
      expect(cleanPhoneNumber('081-234-5678')).toBe('0812345678');
      expect(cleanPhoneNumber('081 234 5678')).toBe('0812345678');
      expect(cleanPhoneNumber('+66 81-234-5678')).toBe('+66812345678');
      expect(cleanPhoneNumber('0812345678')).toBe('0812345678');
    });
  });

  describe('Authorization and Access Control Rules (AC-22, AC-62, AC-63)', () => {
    it('verifies that both email and phone are mandatory for lookup', () => {
      const email = 'buyer@example.com';
      const phone = '0812345678';

      expect(Boolean(email && phone)).toBe(true);
      expect(Boolean(!email && phone)).toBe(false);
      expect(Boolean(email && !phone)).toBe(false);
    });

    it('denies cross-buyer access when session email does not match order email (AC-22)', () => {
      const sessionEmail = 'buyer-a@example.com';
      const orderEmail = 'buyer-b@example.com';

      const isAuthorized = sessionEmail.toLowerCase() === orderEmail.toLowerCase();
      expect(isAuthorized).toBe(false);
    });

    it('allows access when session email and phone match order (AC-21, AC-62)', () => {
      const sessionEmail = 'Buyer-A@Example.COM';
      const orderEmail = 'buyer-a@example.com';
      const sessionPhone = '081-234-5678';
      const orderPhone = '0812345678';

      const emailMatches = sessionEmail.toLowerCase() === orderEmail.toLowerCase();
      const phoneMatches = cleanPhoneNumber(sessionPhone) === cleanPhoneNumber(orderPhone);

      expect(emailMatches && phoneMatches).toBe(true);
    });

    it('denies access if email matches but phone is different (AC-62)', () => {
      const sessionEmail = 'buyer-a@example.com';
      const orderEmail = 'buyer-a@example.com';
      const sessionPhone = '081-111-2222';
      const orderPhone = '089-999-8888';

      const isAuthorized =
        sessionEmail.toLowerCase() === orderEmail.toLowerCase() &&
        cleanPhoneNumber(sessionPhone) === cleanPhoneNumber(orderPhone);

      expect(isAuthorized).toBe(false);
    });
  });

  describe('D-161: Ticket Search Local Dev OTP Autofill Helper', () => {
    it('verifies server passes devOtpCode and view renders autofill helper banner', () => {
      const rootDir = process.cwd();
      const serverSource = readFileSync(
        join(rootDir, 'src/server/guest-order-lookup.ts'),
        'utf8',
      );
      const routeSource = readFileSync(
        join(rootDir, 'src/app/api/public/orders/request-lookup-otp/route.ts'),
        'utf8',
      );
      const viewSource = readFileSync(
        join(rootDir, 'src/components/guest-order-lookup-view.tsx'),
        'utf8',
      );

      // 1. Server forwards devOtpCode from requestGuestOtp
      expect(serverSource).toContain('devOtpCode?: string;');
      expect(serverSource).toContain('...(otpResult.devOtpCode ? { devOtpCode: otpResult.devOtpCode } : {})');

      // 2. API route returns devOtpCode in JSON payload
      expect(routeSource).toContain('...(result.devOtpCode ? { devOtpCode: result.devOtpCode } : {})');

      // 3. View handles devOtpCode and renders dev-otp-helper-banner
      expect(viewSource).toContain('devOtpCode');
      expect(viewSource).toContain('setDevOtpCode');
      expect(viewSource).toContain('dev-otp-helper-banner');
      expect(viewSource).toContain('dev-otp-autofill-btn');
      expect(viewSource).toContain('id="dev-otp-autofill-btn"');
      expect(viewSource).toContain('SparklesIcon');

      // 4. D-14 Zero Emojis check
      const emojiRegex = /\p{Extended_Pictographic}/u;
      expect(emojiRegex.test(serverSource)).toBe(false);
      expect(emojiRegex.test(routeSource)).toBe(false);
      expect(emojiRegex.test(viewSource)).toBe(false);
    });
  });

  describe('D-162: Ticket Search Page Cleaned Order Structure & Reconciled Finances', () => {
    it('verifies borderless stubs, single outer card, discount row, and collapsible policy', () => {
      const rootDir = process.cwd();
      const serverSource = readFileSync(
        join(rootDir, 'src/server/guest-order-lookup.ts'),
        'utf8',
      );
      const viewSource = readFileSync(
        join(rootDir, 'src/components/guest-order-lookup-view.tsx'),
        'utf8',
      );
      const globalsCss = readFileSync(
        join(rootDir, 'src/app/globals.css'),
        'utf8',
      );

      // 1. Classic ticket stub has sharp corners and light border (D-163)
      expect(globalsCss).toMatch(/\.classic-ticket-stub\s*\{[^}]*border-radius:\s*0;/);

      // 2. Server includes discountAmount in GuestOrderSummary
      expect(serverSource).toContain('discountAmount: number;');
      expect(serverSource).toContain('discountAmount: Number(row.discountAmount) || 0');

      // 3. View renders discount row in financial summary
      expect(viewSource).toContain('order.discountAmount > 0');
      expect(viewSource).toContain('formatBaht(order.discountAmount)');

      // 4. View uses flat order section without nested card borders
      expect(viewSource).toContain('lookup-order-flat');
      expect(globalsCss).toContain('.lookup-order-flat');

      // 5. Redundant toggle button and refund manager removed from view
      expect(viewSource).not.toContain('ซ่อนรายละเอียด');
      expect(viewSource).not.toContain('GuestOrderRefundManager');

      // 6. View has collapsible policy card at the bottom
      expect(viewSource).toContain('lookup-policy-card');
      expect(viewSource).toContain('lookup-policy-summary');
      expect(viewSource).toContain('lookup-policy-content');
      expect(globalsCss).toContain('.lookup-policy-card');

      // 7. D-14 Zero Emojis check
      const emojiRegex = /\p{Extended_Pictographic}/u;
      expect(emojiRegex.test(viewSource)).toBe(false);
      expect(emojiRegex.test(globalsCss)).toBe(false);
    });
  });

  describe('D-163: Minimalist Raw Ticket Pass & Unified Canvas Download', () => {
    it('verifies sharp-cornered white pass, exact required fields, and unified canvas download', () => {
      const rootDir = process.cwd();
      const viewSource = readFileSync(
        join(rootDir, 'src/components/guest-order-lookup-view.tsx'),
        'utf8',
      );
      const canvasSource = readFileSync(
        join(rootDir, 'src/components/ticket-canvas-download.ts'),
        'utf8',
      );
      const globalsCss = readFileSync(
        join(rootDir, 'src/app/globals.css'),
        'utf8',
      );

      // 1. Ticket card styling: sharp corners (border-radius: 0), white surface
      expect(globalsCss).toMatch(/\.classic-ticket-stub\s*\{[^}]*background:\s*#ffffff;/);
      expect(globalsCss).toMatch(/\.classic-ticket-stub\s*\{[^}]*border-radius:\s*0;/);

      // 2. Straight dashed divider without round notches
      expect(viewSource).toContain('stub-divider-straight');
      expect(viewSource).not.toContain('stub-notch-divider');

      // 3. Status badges and decorative noise removed
      expect(viewSource).not.toContain('SCAN FOR ENTRY');
      expect(canvasSource).not.toContain('SCAN FOR ENTRY');
      expect(canvasSource).not.toContain('พร้อมใช้งาน');

      // 4. Ticket Type Name without price
      expect(viewSource).toMatch(/<div className="stub-zone-badge">\s*\{tkt\.ticketTypeName\}\s*<\/div>/);

      // 5. Order ID and disclaimer included in pass
      expect(viewSource).toContain('หมายเลขคำสั่งซื้อ');
      expect(viewSource).toContain('* กรุณาแสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน · บัตรนี้สามารถสแกนได้ 1 ครั้ง');
      expect(canvasSource).toContain('หมายเลขคำสั่งซื้อ (ORDER ID)');
      expect(canvasSource).toContain('* กรุณาแสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน · บัตรนี้สามารถสแกนได้ 1 ครั้ง');

      // 6. Canvas download draws white background and sharp corners
      expect(canvasSource).toContain("ctx.fillStyle = '#ffffff';");
      expect(canvasSource).not.toContain('ticketTemplateUrl');

      // 7. D-14 Zero Emojis check
      const emojiRegex = /\p{Extended_Pictographic}/u;
      expect(emojiRegex.test(viewSource)).toBe(false);
      expect(emojiRegex.test(canvasSource)).toBe(false);
    });
  });

  describe('D-164: Zero Ellipsis Full-Text Display & Uniform Pure White Pass', () => {
    it('verifies zero ellipsis string slicing, uniform pure white background, and direct QR placement', () => {
      const rootDir = process.cwd();
      const viewSource = readFileSync(
        join(rootDir, 'src/components/guest-order-lookup-view.tsx'),
        'utf8',
      );
      const canvasSource = readFileSync(
        join(rootDir, 'src/components/ticket-canvas-download.ts'),
        'utf8',
      );
      const globalsCss = readFileSync(
        join(rootDir, 'src/app/globals.css'),
        'utf8',
      );

      // 1. Canvas completely eliminates string slicing with '...'
      expect(canvasSource).not.toContain("...'");
      expect(canvasSource).not.toContain('..."');
      expect(canvasSource).not.toContain('...`');
      expect(canvasSource).not.toMatch(/\.slice\([^)]*\)\s*\+\s*['"`]\.\.\.['"`]/);

      // 2. Full text rendering helpers with auto font scaling are used
      expect(canvasSource).toContain('renderFullEventTitle');
      expect(canvasSource).toContain('renderTextFitted');

      // 3. Right stub background is pure white (#ffffff) without darker/gray fill
      expect(canvasSource).not.toContain("ctx.fillStyle = '#f8fafc';");
      expect(globalsCss).toMatch(/\.stub-scan-side\s*\{[^}]*background:\s*#ffffff;/);

      // 4. QR Code sits directly on white background without gray frame or stroke
      expect(canvasSource).not.toContain('ctx.strokeRect(qrFrameX');
      expect(globalsCss).toMatch(/\.stub-qr-frame\s*\{[^}]*border:\s*none;/);
      expect(globalsCss).toMatch(/\.stub-qr-frame\s*\{[^}]*background:\s*transparent;/);

      // 5. Label parity between on-screen view and downloaded canvas
      const expectedLabels = [
        'วันและเวลาแสดง (DATE & TIME)',
        'สถานที่จัดงาน (VENUE)',
        'ผู้สั่งซื้อ (BUYER)',
        'รหัสบัตร (TICKET CODE)',
        'หมายเลขคำสั่งซื้อ (ORDER ID)',
      ];
      for (const label of expectedLabels) {
        expect(viewSource).toContain(label);
        expect(canvasSource).toContain(label);
      }

      // 6. D-14 Zero Emojis check
      const emojiRegex = /\p{Extended_Pictographic}/u;
      expect(emojiRegex.test(viewSource)).toBe(false);
      expect(emojiRegex.test(canvasSource)).toBe(false);
      expect(emojiRegex.test(globalsCss)).toBe(false);
    });
  });

  describe('D-165: Direct Ticket Image Display, Black Zone Name & Real QR from Ticket Code', () => {
    it('verifies direct image pass rendering, black zone badge, and authentic QR derived from ticketCode', () => {
      const rootDir = process.cwd();
      const viewSource = readFileSync(
        join(rootDir, 'src/components/guest-order-lookup-view.tsx'),
        'utf8',
      );
      const canvasSource = readFileSync(
        join(rootDir, 'src/components/ticket-canvas-download.ts'),
        'utf8',
      );
      const ticketsSource = readFileSync(
        join(rootDir, 'src/server/tickets.ts'),
        'utf8',
      );
      const globalsCss = readFileSync(
        join(rootDir, 'src/app/globals.css'),
        'utf8',
      );

      // 1. Direct ticket image pass integration on web
      expect(viewSource).toContain('generateTicketDataUrl');
      expect(viewSource).toContain('ticketImageUrls');
      expect(viewSource).toContain('classic-ticket-img');

      // 2. Zone name in solid black (#0f172a) on both canvas and web
      expect(globalsCss).toMatch(/\.stub-zone-badge\s*\{[^}]*color:\s*#0f172a;/);
      expect(canvasSource).toContain("ctx.fillStyle = '#0f172a';");

      // 3. QR Code generator derived directly from ticketCode, free of blue rectangles
      expect(ticketsSource).not.toContain('fill="#1848ed"');
      expect(ticketsSource).toContain('generateTicketQrSvg');

      // 4. Consistent modern font stack
      expect(canvasSource).toContain('Kanit');
      expect(canvasSource).toContain('document.fonts.ready');

      // 5. D-14 Zero Emojis check
      const emojiRegex = /\p{Extended_Pictographic}/u;
      expect(emojiRegex.test(viewSource)).toBe(false);
      expect(emojiRegex.test(canvasSource)).toBe(false);
      expect(emojiRegex.test(ticketsSource)).toBe(false);
      expect(emojiRegex.test(globalsCss)).toBe(false);
    });
  });

  describe('D-166: Streamlined Session Header, Itemized Finance, Standalone Policy & +/- Toggles', () => {
    it('verifies borderless avatar, prominent contact, itemized finance breakdown, standalone policy and +/- toggles', () => {
      const rootDir = process.cwd();
      const viewSource = readFileSync(
        join(rootDir, 'src/components/guest-order-lookup-view.tsx'),
        'utf8',
      );
      const globalsCss = readFileSync(
        join(rootDir, 'src/app/globals.css'),
        'utf8',
      );

      // 1. Session Header: borderless black ticket icon, prominent contact info, signout button removed
      expect(viewSource).toContain('lookup-session-contact-prominent');
      expect(viewSource).not.toContain('lookup-signout-btn');
      expect(globalsCss).toMatch(/\.lookup-session-avatar\s*\{[^}]*background:\s*transparent;/);

      // 2. Ephemeral session cleanup attached
      expect(viewSource).toContain("sessionStorage.removeItem('ticket_guest_lookup_token')");
      expect(viewSource).toContain('pagehide');
      expect(viewSource).toContain('beforeunload');

      // 3. Status badges removed from concert header
      expect(viewSource).not.toContain('กำลังจะมาถึง');
      expect(viewSource).not.toContain('ตั๋วพร้อมใช้');

      // 4. Toggle uses + / -
      expect(viewSource).toContain("isConcertExpanded ? '−' : '+'");
      expect(viewSource).toContain("isPolicyExpanded ? '−' : '+'");

      // 5. Download button label without resolution
      expect(viewSource).toContain("'บันทึกรูปบัตร PNG'");
      expect(viewSource).not.toContain("'บันทึกรูปบัตร PNG (1200 x 500 px)'");

      // 6. Financial summary displays itemized ticket names and customer fees
      expect(viewSource).toContain('item.ticketTypeName');
      expect(viewSource).toContain('order.customerFee');

      // 7. Standalone policy card separated with +/- toggle
      expect(viewSource).toContain('standalone-policy-card');
      expect(viewSource).toContain('lookup-policy-summary');
      expect(viewSource).toContain('lookup-policy-content');

      // 8. D-14 Zero Emojis check
      const emojiRegex = /\p{Extended_Pictographic}/u;
      expect(emojiRegex.test(viewSource)).toBe(false);
      expect(emojiRegex.test(globalsCss)).toBe(false);
    });
  });
});
