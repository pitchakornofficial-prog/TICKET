import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('D-256: Back-Office Owner Overview Modernization & Flat Canvas Layout', () => {
  const overviewPath = resolve(process.cwd(), 'src/components/owner-overview-dashboard.tsx');
  const cssPath = resolve(process.cwd(), 'src/app/globals.css');

  const overviewSrc = readFileSync(overviewPath, 'utf8');
  const cssSrc = `${readFileSync(cssPath, 'utf8')}\n${readFileSync(cssPath.replace(/src[/\\]app[/\\]globals\.css/, 'src/app/back-office/back-office.css'), 'utf8')}`;

  it('preserves top 4 KPI cards with test IDs and pure-kpi styling without trend badge pills', () => {
    expect(overviewSrc).toContain('data-testid="owner-kpi-concerts"');
    expect(overviewSrc).toContain('data-testid="owner-kpi-pending"');
    expect(overviewSrc).toContain('data-testid="owner-kpi-revenue"');
    expect(overviewSrc).toContain('data-testid="owner-kpi-system"');
    expect(overviewSrc).toContain('pure-kpi');
    expect(overviewSrc).toContain('ค่าบริการที่เรียกเก็บจากผู้จัดงาน');
    expect(overviewSrc).not.toContain('overview-trend-badge');
  });

  it('preserves unified actionable work queues including news and payouts with single refresh button', () => {
    expect(overviewSrc).toContain('data-testid="owner-overview-dashboard"');
    expect(overviewSrc).toContain('data-testid="overview-total-status"');
    expect(overviewSrc).toMatch(/overview-card-\$\{card\.id\}/);
    expect(overviewSrc).toContain("'pending-sessions'");
    expect(overviewSrc).toContain("'pending-refunds'");
    expect(overviewSrc).toContain("'pending-news'");
    expect(overviewSrc).toContain("'pending-payouts'");
    expect(overviewSrc).toContain("'payment-exceptions'");
    expect(overviewSrc).toContain("'failed-emails'");
    expect(overviewSrc).toContain("'sync-conflicts'");
    expect(overviewSrc).toContain('data-testid="owner-overview-refresh-btn"');
    expect(overviewSrc).not.toContain('data-testid="overview-refresh-btn"');
  });

  it('implements 2-column analytics and top 5 performing concerts without redundant banner/activity/launchpad', () => {
    expect(overviewSrc).toContain('overview-analytics-grid-two-col');
    expect(overviewSrc).toContain('data-testid="owner-charts-panel"');
    expect(overviewSrc).toContain('data-testid="owner-barchart"');
    expect(overviewSrc).toContain('data-testid="owner-linechart"');
    expect(overviewSrc).toContain('overview-top-concerts-card');
    expect(overviewSrc).toContain('คอนเสิร์ตยอดขายสูงสุด');
    expect(overviewSrc).toContain('top-concert-rank-badge');
    expect(overviewSrc).not.toContain('overview-attention-banner');
    expect(overviewSrc).not.toContain('overview-recent-activity-section');
    expect(overviewSrc).not.toContain('overview-launchpad-section');
  });

  it('defines flat-overview-section and modern 2-col styles in CSS', () => {
    expect(cssSrc).toContain('.owner-overview-section.flat-overview-section');
    expect(cssSrc).toContain('.overview-analytics-grid-two-col');
    expect(cssSrc).toContain('.overview-top-concerts-card');
    expect(cssSrc).toContain('.owner-overview-status-note');
    expect(cssSrc).toContain('overflow-x: clip;');
    expect(overviewSrc).toContain('owner-overview-top-row');
    expect(overviewSrc).toContain('barchart-status-text');
  });

  it('strictly enforces 100% Zero Emojis (D-14) in component code', () => {
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(overviewSrc).not.toMatch(emojiRegex);
  });
});
