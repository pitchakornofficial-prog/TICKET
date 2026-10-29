import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Owner Editorial Headers Clean-Up & Platform Governance Policies View (D-116)', () => {
  const rootDir = process.cwd();

  it('defines OwnerPoliciesView with 5 governance categories, search, print CTA, and zero emojis', () => {
    const policiesContent = readFileSync(
      join(rootDir, 'src/components/owner-policies-view.tsx'),
      'utf8',
    );

    // Testids and structure
    expect(policiesContent).toContain('owner-policies-view');
    expect(policiesContent).toContain('owner-policies-print-btn');
    expect(policiesContent).toContain('owner-policies-search-input');
    expect(policiesContent).toContain('owner-policies-collapse-all-btn');
    expect(policiesContent).toContain('owner-policies-expand-all-btn');
    expect(policiesContent).toContain('owner-policy-tab-all');
    expect(policiesContent).toContain('owner-policy-tab-governance');
    expect(policiesContent).toContain('owner-policy-tab-reserve');
    expect(policiesContent).toContain('owner-policy-tab-approval');
    expect(policiesContent).toContain('owner-policy-tab-security');
    expect(policiesContent).toContain('owner-policy-tab-legal');

    // 5 Categories content
    expect(policiesContent).toContain('การกำกับดูแลแพลตฟอร์มและโครงสร้างค่าบริการ');
    expect(policiesContent).toContain('กองทุนสำรองประกันความเสี่ยงและการจ่ายเงินสุทธิ');
    expect(policiesContent).toContain('เกณฑ์การพิจารณาอนุมัติและการคืนเงิน');
    expect(policiesContent).toContain('การกำกับดูแลระบบสแกนเนอร์และความปลอดภัยหน้างาน');
    expect(policiesContent).toContain('ความรับผิดชอบทางกฎหมาย การคุ้มครองข้อมูล และการระงับสิทธิ์');

    // Core platform rules (5% fee, 10% reserve 30 days, single device binding, 100% refund)
    expect(policiesContent).toContain('5% สำหรับราคาบัตรทั่วไป');
    expect(policiesContent).toContain('10%');
    expect(policiesContent).toContain('30 วัน');
    expect(policiesContent).toContain('ผูกใช้งานได้เพียง 1 อุปกรณ์เท่านั้น');
    expect(policiesContent).toContain('คืนเงินให้แก่ผู้ซื้อ 100%');

    // Zero Emojis (D-14)
    expect(policiesContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('integrates policies into OwnerWorkspaceView with owner-nav-policies tab and stage view', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );

    expect(workspaceContent).toContain("'policies'");
    expect(workspaceContent).toContain('OwnerPoliciesView');
    expect(workspaceContent).toContain('owner-section-content-policies');
    expect(workspaceContent).toMatch(/owner-nav-\$\{section\.id\}/);
    expect(workspaceContent).toContain('ข้อตกลง');
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('cleans up technical AC codes from Owner Refund and Session Approval manager headings', () => {
    const refundContent = readFileSync(
      join(rootDir, 'src/components/owner-refund-approval-manager.tsx'),
      'utf8',
    );
    expect(refundContent).toContain('จัดการคำขอคืนเงินและการโอนคืน (Owner Refunds & Payouts)');
    expect(refundContent).not.toContain('Owner Refunds — AC-36, AC-37, AC-92, AC-93');

    const sessionContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    expect(sessionContent).toContain('คำขอยกเลิกรอบการแสดงที่รอการอนุมัติ (Session Cancellations)');
    expect(sessionContent).not.toContain('Session Cancellations — AC-35, AC-108');
  });

  it('cleans up technical AC codes from Owner Fee Settings manager headings', () => {
    const feeContent = readFileSync(
      join(rootDir, 'src/components/owner-fee-settings-manager.tsx'),
      'utf8',
    );
    expect(feeContent).toContain('1. ค่าบริการฝั่งผู้จัดงาน (Organizer Platform Fee)');
    expect(feeContent).toContain('2. ค่าบริการฝั่งลูกค้า (Customer Service Fee)');
    expect(feeContent).toContain('3. เปอร์เซ็นต์เงินสำรองรายงาน (Reserve Fund Rate)');
    expect(feeContent).toContain('สรุปค่าตั้งที่มีผลสำหรับงานนี้');
    expect(feeContent).not.toContain('1. ค่าบริการฝั่งผู้จัดงาน (AC-23)');
    expect(feeContent).not.toContain('2. ค่าบริการฝั่งลูกค้า (AC-24)');
    expect(feeContent).not.toContain('3. เปอร์เซ็นต์เงินสำรองรายงาน (AC-29)');
    expect(feeContent).not.toContain('สรุปค่าตั้งที่มีผลสำหรับงานนี้ (AC-25)');
  });

  it('adds launchpad card for policies in OwnerOverviewDashboard', () => {
    const dashboardContent = readFileSync(
      join(rootDir, 'src/components/owner-overview-dashboard.tsx'),
      'utf8',
    );
    expect(dashboardContent).toContain('launchpad-owner-policies');
    expect(dashboardContent).toContain('กฎบัตรและนโยบายกำกับดูแล');
  });
});
