import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-252: Finance & Weekly Payout Hub Modernization, Pre-Transfer Verification Checklist & All-in-One Proof Slip Modal', () => {
  const rootDir = process.cwd();

  it('verifies D-252: Containerless flat canvas for Finance & Weekly Payout Hub', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    const hubContent = readFileSync(
      join(rootDir, 'src/components/owner-finance-hub.tsx'),
      'utf8',
    );

    // CSS excludes .owner-finance-management-hub from outer card box
    expect(cssContent).toContain('.owner-finance-management-hub');
    expect(cssContent).toContain('background: transparent;');
    expect(cssContent).toContain('box-shadow: none;');

    // Component has main class
    expect(hubContent).toContain('owner-finance-management-hub');
  });

  it('verifies D-252: Balanced Toolbar pairing 3 Underline Tabs with Search, Dual Filters & Refresh Button', () => {
    const hubContent = readFileSync(
      join(rootDir, 'src/components/owner-finance-hub.tsx'),
      'utf8',
    );

    // 3 Underline Tabs (Q1 -> A1)
    expect(hubContent).toContain('รอบโอนที่พร้อมจ่าย');
    expect(hubContent).toContain('ประวัติการโอนเงินสำเร็จ');
    expect(hubContent).toContain('เงินสำรองและหนี้ค้างชำระ');

    // Balanced Toolbar Layout
    expect(hubContent).toContain('hub-toolbar-row');
    expect(hubContent).toContain('hub-filter-tabs-bar');
    expect(hubContent).toContain('hub-toolbar-tools-right');

    // Tools: Search, Dual Filters, Refresh
    expect(hubContent).toContain('hub-search-box');
    expect(hubContent).toContain('hub-search-input');
    expect(hubContent).toContain('hub-filter-select');
    expect(hubContent).toContain('hub-refresh-btn');
  });

  it('verifies D-252: Pre-Transfer Verification Horizontal Cards with Verified Bank Details & 38px Standard Buttons', () => {
    const hubContent = readFileSync(
      join(rootDir, 'src/components/owner-finance-hub.tsx'),
      'utf8',
    );

    // Horizontal Row Card
    expect(hubContent).toContain('concert-horizontal-row-card');
    expect(hubContent).toContain('row-card-center');
    expect(hubContent).toContain('row-card-right');

    // Verified Recipient Bank Details (Q2 -> B1)
    expect(hubContent).toContain('payout-verified-bank-strip');
    expect(hubContent).toContain('บัญชีรับเงินปลายทาง:');
    expect(hubContent).toContain('ผ่านการยืนยันบัญชีแล้ว');

    // Formula Breakdown: E, H, P, A_pay
    expect(hubContent).toContain('ยอดขายสุทธิ (E):');
    expect(hubContent).toContain('เงินสำรอง');
    expect(hubContent).toContain('โอนแล้วสะสม (P):');
    expect(hubContent).toContain('ยอดพร้อมโอนสุทธิ (A_pay):');
    expect(hubContent).toContain('owner-payable-amount');
    expect(hubContent).toContain('owner-total-paid-out');

    // Actions in 240px column
    expect(hubContent).toContain('ตรวจสอบและบันทึกการโอน');
    expect(hubContent).toContain('ดูรายงานเงินละเอียด');
  });

  it('verifies D-252: All-in-One Transfer & Proof Slip Attachment Modal (Q3 -> C1)', () => {
    const hubContent = readFileSync(
      join(rootDir, 'src/components/owner-finance-hub.tsx'),
      'utf8',
    );

    // Modal dialog
    expect(hubContent).toContain('review-modal-backdrop');
    expect(hubContent).toContain('admin-full-dialog-modal payout-transfer-dialog');
    expect(hubContent).toContain('payout-transfer-modal-title');
    expect(hubContent).toContain('ตรวจสอบและบันทึกการโอนเงิน (Pre-Transfer Verification)');

    // Summary checklist
    expect(hubContent).toContain('modal-summary-card');
    expect(hubContent).toContain('ผู้รับเงิน (ผู้จัดงาน):');
    expect(hubContent).toContain('บัญชีธนาคารปลายทาง:');
    expect(hubContent).toContain('ยอดพร้อมโอนตามรอบสัปดาห์ (A_pay):');

    // Form inputs with test IDs
    expect(hubContent).toContain('payout-amount-input');
    expect(hubContent).toContain('payout-date-input');
    expect(hubContent).toContain('payout-time-input');
    expect(hubContent).toContain('payout-ref-input');
    expect(hubContent).toContain('payout-proof-file');
    expect(hubContent).toContain('payout-note-input');
    expect(hubContent).toContain('submit-payout-btn');
  });

  it('verifies D-252: Payout History with Proof Slip Viewer (Q4 -> D1)', () => {
    const hubContent = readFileSync(
      join(rootDir, 'src/components/owner-finance-hub.tsx'),
      'utf8',
    );

    // History elements
    expect(hubContent).toContain('โอนเงินสำเร็จ');
    expect(hubContent).toContain('ดูสลิปหลักฐาน');
    expect(hubContent).toContain('payout-proof-dialog');
    expect(hubContent).toContain('สลิปหลักฐานการโอน (Bank Slip)');
    expect(hubContent).toContain('ข้อมูลธุรกรรมละเอียด');
    expect(hubContent).toContain('generateBankSlipSvgDataUrl');
  });

  it('verifies D-252: Backward compatibility with OwnerWeeklyPayoutManager & workspace navigation', () => {
    const weeklyPayoutContent = readFileSync(
      join(rootDir, 'src/components/owner-weekly-payout-manager.tsx'),
      'utf8',
    );
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );

    expect(weeklyPayoutContent).toContain('OwnerFinanceHub');
    expect(weeklyPayoutContent).toContain('export function OwnerWeeklyPayoutManager');

    // Anchor hash preserved
    expect(workspaceContent).toContain('#owner-weekly-payout-manager');
    expect(workspaceContent).toContain('#owner-fee-settings-manager');
    expect(workspaceContent).toContain('#owner-debt-repayment-manager');
    expect(workspaceContent).toContain('<OwnerFinanceHub />');
  });

  it('verifies D-14: Zero Emojis compliance across all D-252 touched files', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const files = [
      'src/components/owner-finance-hub.tsx',
      'src/components/owner-weekly-payout-manager.tsx',
      'src/components/owner-workspace-view.tsx',
      'src/app/globals.css',
      'docs/requirement.md',
    ];

    for (const filePath of files) {
      const content = readFileSync(join(rootDir, filePath), 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = emojiRegex.exec(line);
        if (match) {
          throw new Error(
            `Found emoji "${match[0]}" at ${filePath}:${i + 1}: ${line}`,
          );
        }
      }
    }
  });
});
