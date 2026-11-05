import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-221 to D-224: Admin/Owner Workspace Modernization & Dual-Mode Analytics', () => {
  const rootDir = process.cwd();

  it('verifies D-221: Operational 6-category subnav bar matching real-world owner workflows', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('owner-subnav-bar');
    expect(workspaceContent).toContain('owner-subnav-tabs');
    expect(workspaceContent).toContain("'overview'");
    expect(workspaceContent).toContain("'approval'");
    expect(workspaceContent).toContain("'finance'");
    expect(workspaceContent).toContain("'customer'");
    expect(workspaceContent).toContain("'invitations'");
    expect(workspaceContent).toContain("'system'");
    expect(workspaceContent).toContain('ภาพรวม');
    expect(workspaceContent).toContain('อนุมัติคอนเสิร์ต');
    expect(workspaceContent).toContain('การเงินและรอบโอน');
    expect(workspaceContent).toContain('ลูกค้าและคำสั่งซื้อ');
    expect(workspaceContent).toContain('คำเชิญผู้จัดงานและทีมงาน');
    expect(workspaceContent).toContain('ระบบและข่าวสาร');
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies D-222: Removal of duplicate quick-invite button and unified invitation tab', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    // Subnav should not have the extra right group with duplicate button
    expect(workspaceContent).not.toContain('owner-subnav-right-group');
    expect(workspaceContent).not.toContain('className={`owner-subnav-tab invite-quick-btn');
    expect(workspaceContent).toMatch(/owner-nav-\$\{section\.id\}/);
    expect(workspaceContent).toContain("'invitations'");
    expect(workspaceContent).toContain('คำเชิญผู้จัดงานและทีมงาน');
  });

  it('verifies D-223: Enterprise Soft Floating Cards, Borderless Icons & Universal Tooltips', () => {
    const dashboardContent = readFileSync(
      join(rootDir, 'src/components/owner-overview-dashboard.tsx'),
      'utf8',
    );
    expect(dashboardContent).toContain('HeaderInfoTooltip');
    expect(dashboardContent).toContain('overview-borderless-icon');
    expect(dashboardContent).toContain('pure-kpi');
    expect(dashboardContent).toContain('overview-charts-card');
    expect(dashboardContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies D-224: Executive Command Hub with Top 4 KPIs & Dual-Mode Interactive Charts', () => {
    const dashboardContent = readFileSync(
      join(rootDir, 'src/components/owner-overview-dashboard.tsx'),
      'utf8',
    );
    // Top 4 Platform KPIs
    expect(dashboardContent).toContain('data-testid="owner-kpi-concerts"');
    expect(dashboardContent).toContain('data-testid="owner-kpi-pending"');
    expect(dashboardContent).toContain('data-testid="owner-kpi-revenue"');
    expect(dashboardContent).toContain('data-testid="owner-kpi-system"');
    expect(dashboardContent).toContain('ส่วนแบ่งค่าบริการแพลตฟอร์ม (3%)');

    // Dual-Mode Analytics Charts
    expect(dashboardContent).toContain('data-testid="owner-charts-panel"');
    expect(dashboardContent).toContain('กราฟแท่งเปรียบเทียบรายคอนเสิร์ต');
    expect(dashboardContent).toContain('กราฟเส้นแนวโน้มยอดขาย');
    expect(dashboardContent).toContain('data-testid="owner-barchart"');
    expect(dashboardContent).toContain('data-testid="owner-linechart"');
    expect(dashboardContent).toContain('วันนี้ (24 ชม.)');
    expect(dashboardContent).toContain('7 วันล่าสุด');
    expect(dashboardContent).toContain('30 วันล่าสุด');

    // Preserved 5 Action items
    expect(dashboardContent).toContain('data-testid="owner-overview-dashboard"');
    expect(dashboardContent).toContain('data-testid="overview-total-badge"');
    expect(dashboardContent).toMatch(/overview-card-\$\{card\.id\}/);
    expect(dashboardContent).toContain("'pending-sessions'");
    expect(dashboardContent).toContain("'pending-refunds'");
    expect(dashboardContent).toContain("'payment-exceptions'");
    expect(dashboardContent).toContain("'failed-emails'");
    expect(dashboardContent).toContain("'sync-conflicts'");

    // Launchpads backward compatibility
    expect(dashboardContent).toContain('launchpad-owner-approval');
    expect(dashboardContent).toContain('launchpad-owner-finance');
    expect(dashboardContent).toContain('launchpad-owner-customer');
    expect(dashboardContent).toContain('launchpad-owner-system');
  });
});
