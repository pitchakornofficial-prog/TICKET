import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer Workspace Overview View (D-114)', () => {
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

  it('defines OrganizerOverviewView with header, create concert CTA, refresh CTA, and zero emojis', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-workspace-container');
    expect(overviewContent).toContain('overview-header-toolbar');
    expect(overviewContent).toContain('ภาพรวมระบบผู้จัดงาน');
    expect(overviewContent).toContain('overview-create-event-btn');
    expect(overviewContent).toContain('สร้างคอนเสิร์ตใหม่');
    expect(overviewContent).toContain('overview-refresh-btn');
    expect(overviewContent).toContain('รีเฟรชข้อมูล');
    expect(overviewContent).toContain('RefreshIcon');
    expect(overviewContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('provides top 4 summary KPI strip for concerts, tickets sold, gross revenue, and active scanners', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-kpi-grid');
    expect(overviewContent).toContain('overview-kpi-events');
    expect(overviewContent).toContain('overview-kpi-tickets');
    expect(overviewContent).toContain('overview-kpi-revenue');
    expect(overviewContent).toContain('overview-kpi-scanners');
    expect(overviewContent).toContain('คอนเสิร์ตที่กำลังเปิดขาย');
    expect(overviewContent).toContain('บัตรที่จำหน่ายแล้วทั้งหมด');
    expect(overviewContent).toContain('ยอดจำหน่ายบัตรรวม');
    expect(overviewContent).toContain('ทีมงานสแกนเนอร์');
  });

  it('provides attention and system status banners for pending approvals or normal operation', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-attention-warning');
    expect(overviewContent).toContain('overview-attention-success');
    expect(overviewContent).toContain('มี');
    expect(overviewContent).toContain('คอนเสิร์ตที่อยู่ระหว่างรอการอนุมัติจากเจ้าของระบบ (Pending Approval)');
    expect(overviewContent).toContain('ระบบทำงานปกติ ไม่มีรายการค้างที่ต้องดำเนินการ');
  });

  it('provides active concerts progress snapshot with sales progress bar and no-thumbnail layout', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-active-events-section');
    expect(overviewContent).toContain('คอนเสิร์ตปัจจุบันและความคืบหน้าการขาย');
    expect(overviewContent).toContain('overview-events-list');
    expect(overviewContent).toContain('progress-bar-track');
    expect(overviewContent).toContain('progress-bar-fill');
    expect(overviewContent).toContain('หน้าร้านลูกค้า');
    expect(overviewContent).toContain('รายงานการเงิน');
    expect(overviewContent).toContain('จัดการงาน');
  });

  it('provides quick launchpad grid with 4 shortcut navigation cards', () => {
    const overviewContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewContent).toContain('overview-launchpad-grid');
    expect(overviewContent).toContain('launchpad-finance');
    expect(overviewContent).toContain('launchpad-scanners');
    expect(overviewContent).toContain('launchpad-policies');
    expect(overviewContent).toContain('launchpad-contact');
    expect(overviewContent).toContain('รายงานการเงินและรอบโอนเงิน');
    expect(overviewContent).toContain('จัดการทีมงานสแกนบัตร');
    expect(overviewContent).toContain('ข้อตกลงและเงื่อนไขการบริการ');
    expect(overviewContent).toContain('ติดต่อเจ้าของระบบ');
  });

  it('defines comprehensive responsive styles in globals.css without !important', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(cssContent).toContain('D-114: Organizer Workspace Overview View');
    expect(cssContent).toContain('.overview-workspace-container');
    expect(cssContent).toContain('.overview-kpi-grid');
    expect(cssContent).toContain('.overview-attention-banner');
    expect(cssContent).toContain('.overview-launchpad-grid');
    expect(cssContent).toContain('.progress-bar-fill');
  });
});
