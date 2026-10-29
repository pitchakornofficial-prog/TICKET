import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Owner Back-Office Modernization & Unified Workspace Layout (D-115)', () => {
  const rootDir = process.cwd();

  it('defines Horizontal Sub-Nav Bar in OwnerWorkspaceView with 5 sections and invite button', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('owner-subnav-bar');
    expect(workspaceContent).toContain('owner-subnav-tabs');
    expect(workspaceContent).toMatch(/owner-nav-\$\{section\.id\}/);
    expect(workspaceContent).toContain("'overview'");
    expect(workspaceContent).toContain("'approval'");
    expect(workspaceContent).toContain("'finance'");
    expect(workspaceContent).toContain("'customer'");
    expect(workspaceContent).toContain("'system'");
    expect(workspaceContent).toContain('owner-nav-invite');
    expect(workspaceContent).toContain('เชิญผู้จัดงาน');
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('provides in-page sub-tabs within approval, finance, customer, and system sections', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('owner-section-subtabs');
    expect(workspaceContent).toContain('owner-section-subtab');
    expect(workspaceContent).toContain('#owner-session-approval-manager');
    expect(workspaceContent).toContain('#owner-refund-approval-manager');
    expect(workspaceContent).toContain('#owner-weekly-payout-manager');
    expect(workspaceContent).toContain('#owner-fee-settings-manager');
    expect(workspaceContent).toContain('#owner-debt-repayment-manager');
    expect(workspaceContent).toContain('#owner-contact-correction-manager');
    expect(workspaceContent).toContain('#owner-email-deliveries-manager');
    expect(workspaceContent).toContain('#invite-organizer-form');
    expect(workspaceContent).toContain('#owner-news-manager');
    expect(workspaceContent).toContain('#owner-sync-conflicts-manager');
  });

  it('defines full OwnerOverviewDashboard with header toolbar, 4 platform KPIs, action banner, and launchpad', () => {
    const dashboardContent = readFileSync(
      join(rootDir, 'src/components/owner-overview-dashboard.tsx'),
      'utf8',
    );
    expect(dashboardContent).toContain('owner-overview-header-toolbar');
    expect(dashboardContent).toContain('ภาพรวมระบบจัดการ (Owner Overview)');
    expect(dashboardContent).toContain('owner-overview-invite-btn');
    expect(dashboardContent).toContain('owner-overview-refresh-btn');
    expect(dashboardContent).toContain('owner-kpi-grid');
    expect(dashboardContent).toContain('owner-kpi-concerts');
    expect(dashboardContent).toContain('owner-kpi-pending');
    expect(dashboardContent).toContain('owner-kpi-revenue');
    expect(dashboardContent).toContain('owner-kpi-system');
    expect(dashboardContent).toContain('owner-attention-warning');
    expect(dashboardContent).toContain('owner-attention-success');
    expect(dashboardContent).toContain('launchpad-owner-approval');
    expect(dashboardContent).toContain('launchpad-owner-finance');
    expect(dashboardContent).toContain('launchpad-owner-customer');
    expect(dashboardContent).toContain('launchpad-owner-system');
    expect(dashboardContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('preserves all 5 existing pending action cards for TASK-039 backward compatibility', () => {
    const dashboardContent = readFileSync(
      join(rootDir, 'src/components/owner-overview-dashboard.tsx'),
      'utf8',
    );
    expect(dashboardContent).toContain('owner-overview-dashboard');
    expect(dashboardContent).toContain('owner-overview-title');
    expect(dashboardContent).toContain('overview-total-badge');
    expect(dashboardContent).toContain("'pending-sessions'");
    expect(dashboardContent).toContain("'pending-refunds'");
    expect(dashboardContent).toContain("'payment-exceptions'");
    expect(dashboardContent).toContain("'failed-emails'");
    expect(dashboardContent).toContain("'sync-conflicts'");
    expect(dashboardContent).toMatch(/overview-card-\$\{card\.id\}/);
  });

  it('defines responsive styles in globals.css without !important', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(cssContent).toContain('D-115: Owner Back-Office Modernization');
    expect(cssContent).toContain('.owner-subnav-bar');
    expect(cssContent).toContain('.owner-section-subtabs');
    expect(cssContent).toContain('.owner-kpi-grid');
  });
});
