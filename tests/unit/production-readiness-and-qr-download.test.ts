import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  SAMPLE_MOCK_PAID_ORDERS,
  SAMPLE_MOCK_AUDIT_LOGS,
  SAMPLE_MOCK_DELIVERIES,
} from '../../src/components/owner-customer-hub';
import {
  SAMPLE_MOCK_PAYABLE_CONCERTS,
  SAMPLE_MOCK_PAYOUT_HISTORY,
} from '../../src/components/owner-finance-hub';
import {
  SAMPLE_MOCK_INVITATIONS,
  SAMPLE_MOCK_ORGANIZERS,
  SAMPLE_MOCK_ADMINS,
} from '../../src/components/owner-invitations-view';
import { SAMPLE_MOCK_REFUNDS } from '../../src/components/owner-refund-approval-manager';

describe('Production Readiness & Live Payment QR Download Suite', () => {
  describe('Issue 1: Payment QR Code Download Endpoint & Client Integration', () => {
    it('verifies payment-qr download endpoint exists and contains security & format handling', () => {
      const content = readFileSync(
        'src/app/api/public/checkout/orders/[id]/payment-qr/download/route.ts',
        'utf-8',
      );
      expect(content).toContain('getVerifiedGuestSession');
      expect(content).toContain('sharp');
      expect(content).toContain('Content-Disposition');
      expect(content).toContain('image/png');
      expect(content).toContain('promptpay-qr-');
      expect(content).toContain('data:image/svg+xml');
      expect(content).toContain('http://');
      expect(content).toContain('https://');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('verifies sharp converts SVG data URI into valid 600x600 PNG buffer', async () => {
      const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#ffffff"/>
        <rect x="25" y="25" width="50" height="50" fill="#000000"/>
      </svg>`;
      const pngBuffer = await sharp(Buffer.from(sampleSvg))
        .resize(600, 600, { fit: 'contain', background: '#ffffff' })
        .png()
        .toBuffer();

      expect(pngBuffer).toBeInstanceOf(Buffer);
      expect(pngBuffer.length).toBeGreaterThan(0);

      const metadata = await sharp(pngBuffer).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(600);
      expect(metadata.height).toBe(600);
    });

    it('verifies order-payment-view wires to the same-origin download route', () => {
      const content = readFileSync('src/components/order-payment-view.tsx', 'utf-8');
      expect(content).toContain('/payment-qr/download?token=');
      expect(content).toContain('handleDownloadQrCode');
      expect(content).toContain('id="download-qr-code-btn"');
      expect(content).not.toContain('const canvas = document.createElement(\'canvas\');');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  describe('Issue 2: Zero Mock Data & 100% Real Database Data Verification', () => {
    it('ensures owner-customer-hub has zero mock items in legacy constants and zero fallback injections', () => {
      expect(SAMPLE_MOCK_PAID_ORDERS).toEqual([]);
      expect(SAMPLE_MOCK_AUDIT_LOGS).toEqual([]);
      expect(SAMPLE_MOCK_DELIVERIES).toEqual([]);

      const content = readFileSync('src/components/owner-customer-hub.tsx', 'utf-8');
      expect(content).not.toContain('orders.length > 0 ? orders : SAMPLE_MOCK_PAID_ORDERS');
      expect(content).not.toContain('audits.length > 0 ? audits : SAMPLE_MOCK_AUDIT_LOGS');
      expect(content).not.toContain('deliveries.length > 0 ? deliveries : SAMPLE_MOCK_DELIVERIES');
      expect(content).not.toContain("id: 'mock-item-1'");
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('ensures owner-finance-hub has zero mock items in constants and state', () => {
      expect(SAMPLE_MOCK_PAYABLE_CONCERTS).toEqual([]);
      expect(SAMPLE_MOCK_PAYOUT_HISTORY).toEqual([]);

      const content = readFileSync('src/components/owner-finance-hub.tsx', 'utf-8');
      expect(content).not.toContain('payableConcerts.length > 0 ? payableConcerts : SAMPLE_MOCK_PAYABLE_CONCERTS');
      expect(content).not.toContain('payoutHistory.length > 0 ? payoutHistory : SAMPLE_MOCK_PAYOUT_HISTORY');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('ensures owner-invitations-view has zero mock items and dynamically fetches user accounts', () => {
      expect(SAMPLE_MOCK_INVITATIONS).toEqual([]);
      expect(SAMPLE_MOCK_ORGANIZERS).toEqual([]);
      expect(SAMPLE_MOCK_ADMINS).toEqual([]);

      const content = readFileSync('src/components/owner-invitations-view.tsx', 'utf-8');
      expect(content).not.toContain('invitations.length > 0 ? invitations : SAMPLE_MOCK_INVITATIONS');
      expect(content).not.toContain('organizers.length > 0 ? organizers : SAMPLE_MOCK_ORGANIZERS');
      expect(content).not.toContain('admins.length > 0 ? admins : SAMPLE_MOCK_ADMINS');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);

      const routeContent = readFileSync('src/app/api/owner/invitations/route.ts', 'utf-8');
      expect(routeContent).toContain("role IN ('organizer', 'owner')");
      expect(routeContent).toContain('organizers,');
      expect(routeContent).toContain('admins');
    });

    it('ensures owner-refund-approval-manager has zero mock requests and zero simulation branches', () => {
      expect(SAMPLE_MOCK_REFUNDS).toEqual([]);

      const content = readFileSync(
        'src/components/owner-refund-approval-manager.tsx',
        'utf-8',
      );
      expect(content).not.toContain('requests.length > 0 ? requests : SAMPLE_MOCK_REFUNDS');
      expect(content).not.toContain('REF-20261106-');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('ensures organizer-overview-view contains zero hardcoded sales estimates or quota placeholders', () => {
      const content = readFileSync('src/components/organizer-overview-view.tsx', 'utf-8');
      expect(content).not.toContain('45000');
      expect(content).not.toContain('320000');
      expect(content).not.toContain('1150000');
      expect(content).not.toContain('1500');
      expect(content).toContain('totalQuota += ev.totalQuota || 0;');
      expect(content).toContain('const quota = ev.totalQuota || 0;');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('ensures owner-overview-dashboard calculates revenue and quota strictly from real database summaries', () => {
      const content = readFileSync('src/components/owner-overview-dashboard.tsx', 'utf-8');
      expect(content).not.toContain('0.35 + (index % 5) * 0.12');
      expect(content).not.toContain('estimatedSales');
      expect(content).toContain('stats?.validTicketsCount ?? 0');
      expect(content).toContain('stats?.grossSales ?? 0');
      expect(content).toContain('/api/owner/finance/summaries');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('ensures owner-session-approval-manager uses real financial reports and zero mock branches', () => {
      const content = readFileSync(
        'src/components/owner-session-approval-manager.tsx',
        'utf-8',
      );
      expect(content).not.toContain("sessionId.startsWith('mock-')");
      expect(content).not.toContain("cancellationId.startsWith('mock-')");
      expect(content).not.toContain('tt-mock-1');
      expect(content).not.toContain('* 0.72');
      expect(content).not.toContain('* 0.58');
      expect(content).not.toContain('* 0.8');
      expect(content).toContain('/api/owner/events/');
      expect(content).toContain('/money-report');
      expect(content).toContain('analyticsTiers.map');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });
});
