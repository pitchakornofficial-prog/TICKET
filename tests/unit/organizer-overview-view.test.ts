import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer Workspace Overview View Redesign (D-114, D-210 to D-216)', () => {
  const rootDir = process.cwd();

  it('wires OrganizerOverviewView into OrganizerWorkspaceView for overview section', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('OrganizerOverviewView');
    expect(workspaceContent).toContain("activeSection === 'overview'");
    expect(workspaceContent).toContain('organizer-nav-overview');
    expect(workspaceContent).toContain('ภาพรวม');
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('defines OrganizerOverviewView with header, pure refresh CTA, and zero emojis (D-210)', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-workspace-container');
    expect(overviewContent).toContain('overview-header-toolbar');
    expect(overviewContent).toContain('ภาพรวมระบบผู้จัดงาน');
    expect(overviewContent).toContain('overview-refresh-btn');
    expect(overviewContent).toContain('รีเฟรชข้อมูล');
    expect(overviewContent).toContain('RefreshIcon');
    expect(overviewContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('provides top executive 5-KPI strip for multi-period sales and trend indicators (D-212)', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-5kpi-grid');
    expect(overviewContent).toContain('overview-kpi-events');
    expect(overviewContent).toContain('overview-kpi-revenue');
    expect(overviewContent).toContain('overview-kpi-today');
    expect(overviewContent).toContain('overview-kpi-week');
    expect(overviewContent).toContain('overview-kpi-month');
    expect(overviewContent).toContain('คอนเสิร์ตที่เปิดขาย');
    expect(overviewContent).toContain('รายได้บัตรรวมทั้งหมด');
    expect(overviewContent).toContain('ยอดขายวันนี้ (Today)');
    expect(overviewContent).toContain('ยอดขายสัปดาห์นี้');
    expect(overviewContent).toContain('ยอดขายเดือนนี้');
    expect(overviewContent).toContain('overview-trend-badge');
  });

  it('removes old sales progress section (D-211) and launchpad grid (D-210)', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    // Old section removed
    expect(overviewContent).not.toContain('คอนเสิร์ตปัจจุบันและความคืบหน้าการขาย');
    // Launchpad shortcuts removed
    expect(overviewContent).not.toContain('overview-launchpad-section');
    expect(overviewContent).not.toContain('launchpad-finance');
    expect(overviewContent).not.toContain('launchpad-scanners');
    expect(overviewContent).not.toContain('launchpad-contact');
  });

  it('provides horizontal 3-zone concert performance cards (D-213) with direct actions (D-214)', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-performance-section');
    expect(overviewContent).toContain('overview-performance-list');
    expect(overviewContent).toContain('overview-concert-card');
    expect(overviewContent).toContain('concert-card-zone-info');
    expect(overviewContent).toContain('concert-card-zone-finance');
    expect(overviewContent).toContain('concert-card-zone-actions');
    expect(overviewContent).toContain('btn-store');
    expect(overviewContent).toContain('ดูหน้าร้านลูกค้า');
    expect(overviewContent).toContain('btn-finance');
    expect(overviewContent).toContain('รายงานการเงิน');
    expect(overviewContent).toContain('btn-manage');
    expect(overviewContent).toContain('จัดการงาน');
    expect(overviewContent).toContain('progress-bar-track');
    expect(overviewContent).toContain('progress-bar-fill');
  });

  it('provides dual-mode visual analytics charts with bar chart and line chart (D-215)', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-charts-panel');
    expect(overviewContent).toContain('overview-barchart');
    expect(overviewContent).toContain('overview-linechart');
    expect(overviewContent).toContain('chart-tab-btn');
    expect(overviewContent).toContain('กราฟแท่งเปรียบเทียบรายคอนเสิร์ต');
    expect(overviewContent).toContain('กราฟเส้นแนวโน้มยอดขาย');
    expect(overviewContent).toContain('linechart-svg');
  });

  it('defines borderless icons, universal "i" tooltips, and responsive styles in globals.css (D-216)', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-borderless-icon');
    expect(overviewContent).toContain('HeaderInfoTooltip');

    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(cssContent).toContain('D-210 to D-216: Organizer Overview Executive Redesign');
    expect(cssContent).toContain('.overview-workspace-container');
    expect(cssContent).toContain('.overview-5kpi-grid');
    expect(cssContent).toContain('.overview-borderless-icon');
    expect(cssContent).toContain('.overview-charts-card');
    expect(cssContent).toContain('.overview-concert-card');
    expect(cssContent).toContain('.soft-pulse-highlight');
  });
});
