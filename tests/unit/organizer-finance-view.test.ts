import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer Financial Reports & Payouts Workspace (D-113)', () => {
  const rootDir = process.cwd();

  it('wires OrganizerFinanceView into OrganizerWorkspaceView for finance section', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('OrganizerFinanceView');
    expect(workspaceContent).toContain("activeSection === 'finance'");
    expect(workspaceContent).toContain('organizer-nav-finance');
    expect(workspaceContent).toContain('การเงิน');
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('defines OrganizerFinanceView with header, window.print, refresh CTA, and zero emojis', () => {
    const financeContent = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    expect(financeContent).toContain('finance-management-container');
    expect(financeContent).toContain('finance-management-header');
    expect(financeContent).toContain('รายงานการเงินและยอดรับเงิน');
    expect(financeContent).toContain('finance-print-btn');
    expect(financeContent).toContain('window.print()');
    expect(financeContent).toContain('PrinterIcon');
    expect(financeContent).toContain('finance-refresh-btn');
    expect(financeContent).toContain('RefreshIcon');
    expect(financeContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('provides top 4 summary KPI strip across all concerts', () => {
    const financeContent = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    expect(financeContent).toContain('finance-summary-strip');
    expect(financeContent).toContain('finance-kpi-gross');
    expect(financeContent).toContain('finance-kpi-fees');
    expect(financeContent).toContain('finance-kpi-payable');
    expect(financeContent).toContain('finance-kpi-paidout');
    expect(financeContent).toContain('ยอดขายบัตรทั้งหมด');
    expect(financeContent).toContain('ค่าบริการและคืนเงิน');
    expect(financeContent).toContain('ยอดเงินสุทธิพร้อมรับ / รอบถัดไป');
    expect(financeContent).toContain('ยอดเงินโอนแล้วทั้งหมด');
  });

  it('provides two core tabs: Concert Breakdown and Payout History', () => {
    const financeContent = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    expect(financeContent).toContain('finance-tabs-nav');
    expect(financeContent).toContain('finance-tab-breakdown');
    expect(financeContent).toContain('finance-tab-payouts');
    expect(financeContent).toContain('รายงานแยกรายคอนเสิร์ต');
    expect(financeContent).toContain('ประวัติรอบโอนเงิน');
  });

  it('supports concert selector dropdown, debt isolation alert (AC-85), and sessions breakdown', () => {
    const financeContent = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    expect(financeContent).toContain('finance-selector-button');
    expect(financeContent).toContain('finance-selector-menu');
    expect(financeContent).toContain('debt-isolation-alert');
    expect(financeContent).toContain('AC-85');
    expect(financeContent).toContain('gross-sales-amount');
    expect(financeContent).toContain('net-sales-amount');
    expect(financeContent).toContain('organizer-fee-amount');
    expect(financeContent).toContain('payable-amount');
    expect(financeContent).toContain('finance-sessions-breakdown-card');
  });

  it('supports payout history table and transfer proof modal in Payouts tab', () => {
    const financeContent = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    expect(financeContent).toContain('payouts-table');
    expect(financeContent).toContain('finance-proof-btn');
    expect(financeContent).toContain('finance-modal-backdrop');
    expect(financeContent).toContain('finance-modal-card');
    expect(financeContent).toContain('หลักฐานการโอนเงิน');
    expect(financeContent).toContain('ยอดเงินที่โอนสำเร็จ');
  });

  it('includes proper CSS styling and @media print rules in globals.css', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(cssContent).toContain('.finance-management-container');
    expect(cssContent).toContain('.finance-summary-strip');
    expect(cssContent).toContain('.finance-kpi-card');
    expect(cssContent).toContain('.finance-tabs-nav');
    expect(cssContent).toContain('.finance-breakdown-view');
    expect(cssContent).toContain('.finance-payouts-card');
    expect(cssContent).toContain('@media print');
    expect(cssContent).toContain('.finance-header-actions');
  });  it('implements D-180 and D-182: Financial Metric Tooltips ("i"), CSV Export, Payout Bank Account Card Removal & Payout History Filtering', () => {
    const financeContent = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );

    // 1. Tooltips ("i") (D-180)
    expect(financeContent).toContain('FinanceTooltip');
    expect(financeContent).toContain('finance-tooltip-wrap');
    expect(financeContent).toContain('finance-tooltip-btn');
    expect(financeContent).toContain('finance-tooltip-popover');
    expect(financeContent).toContain('InfoIcon');

    // 2. Export CSV (D-180)
    expect(financeContent).toContain('finance-export-csv-btn');
    expect(financeContent).toContain('handleExportCsv');
    expect(financeContent).toContain('DownloadIcon');
    expect(financeContent).toContain('text/csv;charset=utf-8');

    // 3. D-182: Payout Bank Account Card Removal (to avoid duplication with Settings)
    expect(financeContent).not.toContain('finance-bank-account-card');
    expect(financeContent).not.toContain('บัญชีธนาคารสำหรับรับเงินโอน');
    expect(financeContent).not.toContain('finance-bank-contact-btn');

    // Verify Organizer Settings provides mature bank accounts management instead (D-78/D-79)
    const settingsContent = readFileSync(
      join(rootDir, 'src/components/organizer-settings-view.tsx'),
      'utf8',
    );
    expect(settingsContent).toContain('บัญชีธนาคารสำหรับรับเงิน');
    expect(settingsContent).toContain('payout-bank-name');

    // 4. Payout Search & Filter (D-180)
    expect(financeContent).toContain('payout-filter-toolbar');
    expect(financeContent).toContain('payout-search-input');
    expect(financeContent).toContain('payout-status-select');
    expect(financeContent).toContain('filteredPayouts');

    // Zero Emojis
    expect(financeContent).not.toMatch(/\p{Extended_Pictographic}/u);

    // CSS rules
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(cssContent).toContain('.finance-tooltip-wrap');
    expect(cssContent).toContain('.finance-tooltip-popover');
    expect(cssContent).toContain('.btn-export-csv');
    expect(cssContent).not.toContain('.finance-bank-account-card');
    expect(cssContent).toContain('.finance-payout-filter-toolbar');
    expect(cssContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements D-183, D-184, and D-185: Latest Payout Card Removal, Sample Payouts Purge, Concert Filter & 2-Tab Proof Modal', () => {
    const financeContent = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    // D-183: Fee banner removal
    expect(financeContent).not.toContain('finance-fee-info-banner');

    // D-184: Latest payout card removed from Tab 1 to avoid duplication with Tab 2
    expect(financeContent).not.toContain('finance-latest-payout-card');

    // D-185: Tab 2 purges hardcoded fake payouts (DEFAULT_SAMPLE_PAYOUTS) for data integrity
    expect(financeContent).not.toContain('DEFAULT_SAMPLE_PAYOUTS');

    // D-184: Concert filter dropdown in Tab 2 toolbar
    expect(financeContent).toContain('payout-concert-select');
    expect(financeContent).toContain('payoutEventFilter');

    // D-185: 2-Tab Segmented Control in Payout Modal (Slip vs Details)
    expect(financeContent).toContain('finance-modal-tabs');
    expect(financeContent).toContain('tab-payout-slip');
    expect(financeContent).toContain('tab-payout-details');
    expect(financeContent).toContain('ภาพสลิปจากแอดมิน');
    expect(financeContent).toContain('รายละเอียด');

    // Slip in Modal
    expect(financeContent).toContain('finance-official-slip-card');
    expect(financeContent).toContain('finance-pure-slip-card');
    expect(financeContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements D-201 and D-202: Admin Bank Transfer Slip Upload, Realistic e-Slip & Pure Image with Square Corners & Download Button', () => {
    const financeContent = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    expect(financeContent).toContain('getSlipImageSrc');
    expect(financeContent).toContain('handleDownloadSlip');
    expect(financeContent).toContain('payout-slip-img');
    expect(financeContent).toContain('download-payout-slip-btn');
    expect(financeContent).toContain('finance-slip-download-btn');
    expect(financeContent).toContain('ดาวน์โหลดภาพสลิป (PNG)');
    expect(financeContent).toContain('generateBankSlipSvgDataUrl');
    expect(financeContent).not.toMatch(/\p{Extended_Pictographic}/u);

    // Verify slip API route
    const slipRouteContent = readFileSync(
      join(rootDir, 'src/app/api/organizer/payouts/[id]/slip/route.ts'),
      'utf8',
    );
    expect(slipRouteContent).toContain('generateBankSlipSvg');
    expect(slipRouteContent).toContain('payout.organizerId !== session.user.id');
    expect(slipRouteContent).not.toMatch(/\p{Extended_Pictographic}/u);

    // Verify bank slip generator has square corners
    const bankSlipContent = readFileSync(
      join(rootDir, 'src/lib/bank-slip.ts'),
      'utf8',
    );
    expect(bankSlipContent).toContain('โอนเงินสำเร็จ');
    expect(bankSlipContent).toContain('generateBankSlipSvg');
    expect(bankSlipContent).toContain('generateBankSlipSvgDataUrl');
    expect(bankSlipContent).toContain('rx="0"');
    expect(bankSlipContent).not.toMatch(/\p{Extended_Pictographic}/u);

    // CSS rules for sharp corners (border-radius: 0) and shadow
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(cssContent).toContain('.finance-slip-pure-img');
    expect(cssContent).toContain('border-radius: 0');
    expect(cssContent).toContain('box-shadow');
    expect(cssContent).toContain('.finance-slip-download-btn');
  });
});
