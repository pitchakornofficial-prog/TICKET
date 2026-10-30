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
  });
});
