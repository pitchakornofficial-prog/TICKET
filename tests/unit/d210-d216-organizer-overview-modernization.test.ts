import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-210 to D-216: Organizer Overview Executive Redesign, Multi-Period KPIs, Dual-Mode Charts, and Contextual Highlight', () => {
  const rootDir = process.cwd();

  it('verifies D-210: Pure overview page with removal of general jump links and launchpad section', () => {
    const overviewSrc = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewSrc).not.toContain('overview-launchpad-section');
    expect(overviewSrc).not.toContain('launchpad-finance');
    expect(overviewSrc).not.toContain('launchpad-scanners');
    expect(overviewSrc).not.toContain('launchpad-contact');
    expect(overviewSrc).not.toContain('ทางลัดการทำงานด่วน');

    // KPI cards are not interactive jumping links
    expect(overviewSrc).not.toContain('className="overview-kpi-card is-interactive"');
    expect(overviewSrc).not.toContain('ดูคอนเสิร์ต <ChevronRightIcon');
    expect(overviewSrc).not.toContain('รายงานการเงิน <ChevronRightIcon');
  });

  it('verifies D-211: Removes old "คอนเสิร์ตปัจจุบันและความคืบหน้าการขาย" section', () => {
    const overviewSrc = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewSrc).not.toContain('คอนเสิร์ตปัจจุบันและความคืบหน้าการขาย');
    expect(overviewSrc).not.toContain('overview-active-events-section');
  });

  it('verifies D-212: Multi-period sales KPI strip with today, week, month sales and growth trend badges', () => {
    const overviewSrc = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewSrc).toContain('overview-5kpi-grid');
    expect(overviewSrc).toContain('overview-kpi-events');
    expect(overviewSrc).toContain('overview-kpi-revenue');
    expect(overviewSrc).toContain('overview-kpi-today');
    expect(overviewSrc).toContain('overview-kpi-week');
    expect(overviewSrc).toContain('overview-kpi-month');
    expect(overviewSrc).toContain('คอนเสิร์ตที่เปิดขาย');
    expect(overviewSrc).toContain('รายได้บัตรรวมทั้งหมด');
    expect(overviewSrc).toContain('ยอดขายวันนี้ (Today)');
    expect(overviewSrc).toContain('ยอดขายสัปดาห์นี้');
    expect(overviewSrc).toContain('ยอดขายเดือนนี้');
    expect(overviewSrc).toContain('+12.5% จากเมื่อวาน');
    expect(overviewSrc).toContain('+8.2% จากสัปดาห์ก่อน');
    expect(overviewSrc).toContain('+15.4% จากเดือนก่อน');
  });

  it('verifies D-213: 3-zone horizontal concert performance cards with financial values and direct actions', () => {
    const overviewSrc = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewSrc).toContain('overview-performance-section');
    expect(overviewSrc).toContain('overview-performance-list');
    expect(overviewSrc).toContain('overview-concert-card');

    // Zone 1: Info and progress
    expect(overviewSrc).toContain('concert-card-zone-info');
    expect(overviewSrc).toContain('concert-progress-box');
    expect(overviewSrc).toContain('progress-bar-track');
    expect(overviewSrc).toContain('progress-bar-fill');

    // Zone 2: Financial breakdown (gross, deductions, net)
    expect(overviewSrc).toContain('concert-card-zone-finance');
    expect(overviewSrc).toContain('รายได้รวม');
    expect(overviewSrc).toContain('หักค่าบริการ (3%)');
    expect(overviewSrc).toContain('ยอดสุทธิคงเหลือ');
    expect(overviewSrc).toContain('highlight-net');

    // Zone 3: 3 Direct Actions
    expect(overviewSrc).toContain('concert-card-zone-actions');
    expect(overviewSrc).toContain('btn-store');
    expect(overviewSrc).toContain('ดูหน้าร้านลูกค้า');
    expect(overviewSrc).toContain('btn-finance');
    expect(overviewSrc).toContain('รายงานการเงิน');
    expect(overviewSrc).toContain('btn-manage');
    expect(overviewSrc).toContain('จัดการงาน');
  });

  it('verifies D-214: Target navigation and soft pulse highlight integration across workspace', () => {
    // 1. Workspace wires eventId navigation
    const workspaceSrc = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceSrc).toContain('targetHighlightEventId');
    expect(workspaceSrc).toContain('handleNavigateWithEvent');
    expect(workspaceSrc).toContain('initialSelectedEventId={targetHighlightEventId || undefined}');
    expect(workspaceSrc).toContain('initialHighlightEventId={targetHighlightEventId || undefined}');

    // 2. Finance View receives highlight and applies soft-pulse-highlight
    const financeSrc = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    expect(financeSrc).toContain('initialSelectedEventId');
    expect(financeSrc).toContain('highlightEventId');
    expect(financeSrc).toContain('pulsingEventId');
    expect(financeSrc).toContain('soft-pulse-highlight');

    // 3. Events Manager receives highlight and applies soft-pulse-highlight
    const eventsSrc = readFileSync(
      join(rootDir, 'src/components/organizer-events-manager.tsx'),
      'utf8',
    );
    expect(eventsSrc).toContain('initialHighlightEventId');
    expect(eventsSrc).toContain('pulsingEventId');
    expect(eventsSrc).toContain('soft-pulse-highlight');

    // 4. CSS contains soft-pulse-highlight keyframe animation
    const css = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(css).toContain('@keyframes softPulseGlow');
    expect(css).toContain('.soft-pulse-highlight');
  });

  it('verifies D-215: Dual-mode interactive visual analytics charts (bar & line charts with time filter)', () => {
    const overviewSrc = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewSrc).toContain('overview-charts-card');
    expect(overviewSrc).toContain('overview-charts-panel');
    expect(overviewSrc).toContain('กราฟแท่งเปรียบเทียบรายคอนเสิร์ต');
    expect(overviewSrc).toContain('กราฟเส้นแนวโน้มยอดขาย');
    expect(overviewSrc).toContain('overview-barchart');
    expect(overviewSrc).toContain('overview-linechart');
    expect(overviewSrc).toContain('barchart-bar-track');
    expect(overviewSrc).toContain('barchart-bar-fill');
    expect(overviewSrc).toContain('linechart-svg');
    expect(overviewSrc).toContain('linechart-hover-tooltip');
    expect(overviewSrc).toContain('วันนี้ (24 ชม.)');
    expect(overviewSrc).toContain('7 วันล่าสุด');
    expect(overviewSrc).toContain('30 วันล่าสุด');
  });

  it('verifies D-216: Borderless icons and universal "i" tooltips across all cards and sections', () => {
    const overviewSrc = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(overviewSrc).toContain('overview-borderless-icon');
    expect(overviewSrc).not.toContain('overview-kpi-icon-wrap bg-blue');
    expect(overviewSrc).not.toContain('overview-kpi-icon-wrap bg-green');

    // Tooltip on overview header, KPIs, charts, and concert cards
    expect(overviewSrc).toContain('<HeaderInfoTooltip text="ศูนย์รวมภาพรวมสถิติคอนเสิร์ตของคุณ');
    expect(overviewSrc).toContain('<HeaderInfoTooltip text="จำนวนคอนเสิร์ตที่ผ่านการอนุมัติ');
    expect(overviewSrc).toContain('<HeaderInfoTooltip text="ยอดขายบัตรรวมทุกงานคอนเสิร์ตก่อนหักค่าบริการระบบ');
    expect(overviewSrc).toContain('<HeaderInfoTooltip text="ยอดเงินจากการจำหน่ายบัตรที่ทำรายการสำเร็จภายในวันนี้');
    expect(overviewSrc).toContain('<HeaderInfoTooltip text="วิเคราะห์เปรียบเทียบยอดขายระหว่างแต่ละคอนเสิร์ต');
    expect(overviewSrc).toContain('<HeaderInfoTooltip text="สรุปยอดจำหน่ายบัตร รายได้รวม ยอดหักค่าบริการ');
  });

  it('ensures 100% Zero Emojis (D-14) compliance across all touched files', () => {
    const files = [
      'src/components/organizer-overview-view.tsx',
      'src/components/organizer-workspace-view.tsx',
      'src/components/organizer-finance-view.tsx',
      'src/components/organizer-events-manager.tsx',
      'src/app/globals.css',
      'docs/requirement.md',
    ];

    for (const relPath of files) {
      const content = readFileSync(join(rootDir, relPath), 'utf8');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
