import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('D-256: Back-Office Owner Overview Modernization & Flat Canvas Layout', () => {
  const overviewPath = resolve(process.cwd(), 'src/components/owner-overview-dashboard.tsx');
  const cssPath = resolve(process.cwd(), 'src/app/globals.css');

  const overviewSrc = readFileSync(overviewPath, 'utf8');
  const cssSrc = readFileSync(cssPath, 'utf8');

  it('preserves top 4 KPI cards with test IDs and pure-kpi styling', () => {
    expect(overviewSrc).toContain('data-testid="owner-kpi-concerts"');
    expect(overviewSrc).toContain('data-testid="owner-kpi-pending"');
    expect(overviewSrc).toContain('data-testid="owner-kpi-revenue"');
    expect(overviewSrc).toContain('data-testid="owner-kpi-system"');
    expect(overviewSrc).toContain('pure-kpi');
    expect(overviewSrc).toContain('ส่วนแบ่งค่าบริการแพลตฟอร์ม (3%)');
  });

  it('preserves all 5 actionable work queues with required test IDs', () => {
    expect(overviewSrc).toContain('data-testid="owner-overview-dashboard"');
    expect(overviewSrc).toContain('data-testid="overview-total-badge"');
    expect(overviewSrc).toMatch(/overview-card-\$\{card\.id\}/);
    expect(overviewSrc).toContain("'pending-sessions'");
    expect(overviewSrc).toContain("'pending-refunds'");
    expect(overviewSrc).toContain("'payment-exceptions'");
    expect(overviewSrc).toContain("'failed-emails'");
    expect(overviewSrc).toContain("'sync-conflicts'");
  });

  it('implements 2-column analytics and top 5 performing concerts (Q2 -> A2)', () => {
    expect(overviewSrc).toContain('overview-analytics-grid-two-col');
    expect(overviewSrc).toContain('data-testid="owner-charts-panel"');
    expect(overviewSrc).toContain('data-testid="owner-barchart"');
    expect(overviewSrc).toContain('data-testid="owner-linechart"');
    expect(overviewSrc).toContain('overview-top-concerts-card');
    expect(overviewSrc).toContain('คอนเสิร์ตยอดขายสูงสุด');
    expect(overviewSrc).toContain('top-concert-rank-badge');
  });

  it('implements recent operational activity feed with live indicator and actions (Q3 -> A3)', () => {
    expect(overviewSrc).toContain('overview-recent-activity-section');
    expect(overviewSrc).toContain('ประวัติกิจกรรมและการดำเนินงานล่าสุด (Recent Operational Activity)');
    expect(overviewSrc).toContain('activity-live-indicator');
    expect(overviewSrc).toContain('activity-item-card');
    expect(overviewSrc).toContain('activity-jump-btn');
  });

  it('preserves launchpad shortcuts for backward compatibility and e2e journeys', () => {
    expect(overviewSrc).toContain('data-testid="launchpad-owner-approval"');
    expect(overviewSrc).toContain('data-testid="launchpad-owner-finance"');
    expect(overviewSrc).toContain('data-testid="launchpad-owner-customer"');
    expect(overviewSrc).toContain('data-testid="launchpad-owner-system"');
  });

  it('defines flat-overview-section and modern 2-col styles in globals.css', () => {
    expect(cssSrc).toContain('.owner-overview-section.flat-overview-section');
    expect(cssSrc).toContain('.overview-analytics-grid-two-col');
    expect(cssSrc).toContain('.overview-top-concerts-card');
    expect(cssSrc).toContain('.overview-recent-activity-section');
  });

  it('strictly enforces 100% Zero Emojis (D-14) in component code', () => {
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(overviewSrc).not.toMatch(emojiRegex);
  });
});
