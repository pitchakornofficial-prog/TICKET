import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('D-197: Organizer Concerts Redesign, Financial Report Pop-up, and Universal Tooltips', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const eventsManagerPath = path.join(rootDir, 'src/components/organizer-events-manager.tsx');
  const moneyReportPath = path.join(rootDir, 'src/components/organizer-money-report-view.tsx');
  const tooltipComponentPath = path.join(rootDir, 'src/components/header-info-tooltip.tsx');
  const globalsCssPath = path.join(rootDir, 'src/app/globals.css');
  const eventsServerPath = path.join(rootDir, 'src/server/events.ts');

  const overviewViewPath = path.join(rootDir, 'src/components/organizer-overview-view.tsx');
  const scannerManagerPath = path.join(rootDir, 'src/components/organizer-scanner-manager.tsx');
  const financeViewPath = path.join(rootDir, 'src/components/organizer-finance-view.tsx');
  const newsViewPath = path.join(rootDir, 'src/components/organizer-news-view.tsx');
  const guideViewPath = path.join(rootDir, 'src/components/organizer-guide-view.tsx');
  const contactViewPath = path.join(rootDir, 'src/components/organizer-contact-view.tsx');
  const settingsViewPath = path.join(rootDir, 'src/components/organizer-settings-view.tsx');

  const eventsManagerContent = fs.readFileSync(eventsManagerPath, 'utf8');
  const moneyReportContent = fs.readFileSync(moneyReportPath, 'utf8');
  const tooltipComponentContent = fs.readFileSync(tooltipComponentPath, 'utf8');
  const globalsCssContent = (`${fs.readFileSync(globalsCssPath, 'utf8')}\n${fs.readFileSync(globalsCssPath.replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
  const eventsServerContent = fs.readFileSync(eventsServerPath, 'utf8');

  it('1. Organizer Events Manager includes unified capsule tabs matching homepage (.catalog-tabs) without upcoming', () => {
    expect(eventsManagerContent).toContain('className="catalog-tabs"');
    expect(eventsManagerContent).toContain('className={`catalog-tab-btn ${statusFilter === \'all\'');
    expect(eventsManagerContent).toContain('ทั้งหมด ({events.length})');
    expect(eventsManagerContent).toContain('เปิดจำหน่ายแล้ว');
    expect(eventsManagerContent).not.toContain('เร็ว ๆ นี้');
    expect(eventsManagerContent).toContain('รออนุมัติ');
    expect(eventsManagerContent).toContain('ฉบับร่าง');
  });

  it('2. Create Concert button has no duplicate "+" text', () => {
    // Should NOT contain "+ สร้างงานคอนเสิร์ตใหม่"
    expect(eventsManagerContent).not.toContain('+ สร้างงานคอนเสิร์ตใหม่');
    // Should contain clean text with PlusIcon
    expect(eventsManagerContent).toContain('สร้างงานคอนเสิร์ตใหม่');
    expect(eventsManagerContent).toContain('PlusIcon');
  });

  it('3. Concert cards render plain text status and no Google Maps link', () => {
    // Plain text status with clean class
    expect(eventsManagerContent).toContain('events-card-status-text');
    expect(eventsManagerContent).not.toContain('events-status-badge');
    expect(eventsManagerContent).toContain('สถานะ: {');

    // Google Maps link completely removed
    expect(eventsManagerContent).not.toContain('เปิดดูใน Google Maps');
    expect(eventsManagerContent).not.toContain('events-map-link');
  });

  it('4. Financial Report is rendered inside a dedicated pop-up modal and not embedded inside the event card', () => {
    expect(eventsManagerContent).toContain('finance-report-modal-dialog');
    // Financial report should be wrapped in modal backdrop
    expect(eventsManagerContent).toMatch(/selectedReportEventId && \(\s*<div\s+className="organizer-modal-backdrop"/);
  });

  it('5. Financial Report view has CSV export and collapsible accordion sections', () => {
    expect(moneyReportContent).toContain('handleExportCsv');
    expect(moneyReportContent).toContain('data-testid="export-money-report-csv-btn"');
    expect(moneyReportContent).toContain('ดาวน์โหลดรายงาน CSV');
    expect(moneyReportContent).toContain('report-collapsible-section');
    expect(moneyReportContent).toContain('report-collapsible-summary');
  });

  it('6. Amendment and Cancellation modals are modernized floating card dialogs', () => {
    expect(eventsManagerContent).toContain('amendment-modal-dialog');
    expect(eventsManagerContent).toContain('cancellation-modal-dialog');
    expect(eventsManagerContent).toContain('modal-info-banner');
    expect(eventsManagerContent).toContain('modal-danger-banner');
    expect(eventsManagerContent).toContain('data-testid="submit-amendment-btn"');
    expect(eventsManagerContent).toContain('data-testid="submit-cancel-session-btn"');
  });

  it('7. Circular "i" tooltip (HeaderInfoTooltip) is installed across all 8 organizer views', () => {
    expect(fs.readFileSync(overviewViewPath, 'utf8')).toContain('HeaderInfoTooltip');
    expect(eventsManagerContent).toContain('HeaderInfoTooltip');
    expect(fs.readFileSync(scannerManagerPath, 'utf8')).toContain('HeaderInfoTooltip');
    expect(fs.readFileSync(financeViewPath, 'utf8')).toContain('HeaderInfoTooltip');
    expect(fs.readFileSync(newsViewPath, 'utf8')).toContain('HeaderInfoTooltip');
    expect(fs.readFileSync(guideViewPath, 'utf8')).toContain('HeaderInfoTooltip');
    expect(fs.readFileSync(contactViewPath, 'utf8')).toContain('HeaderInfoTooltip');
    expect(fs.readFileSync(settingsViewPath, 'utf8')).toContain('HeaderInfoTooltip');
  });

  it('8. Events definitions include 4 distinct statuses across the 4 concerts', () => {
    expect(eventsServerContent).toContain('event-ubu-freshy-2026');
    expect(eventsServerContent).toContain('event-ubu-acoustic-2026');
    expect(eventsServerContent).toContain('event-ubu-isan-indy-2026');
    expect(eventsServerContent).toContain('event-ubu-countdown-2026');

    expect(eventsServerContent).toContain("status: 'approved'");
    expect(eventsServerContent).toContain("status: 'pending_approval'");
    expect(eventsServerContent).toContain("status: 'draft'");
  });

  it('9. globals.css defines styles for tooltip, plain status, and modal enhancements', () => {
    expect(globalsCssContent).toContain('.header-info-tooltip-wrap');
    expect(globalsCssContent).toContain('.header-info-tooltip-btn');
    expect(globalsCssContent).toContain('.header-info-tooltip-popover');
    expect(globalsCssContent).toContain('.events-card-status-text');
    expect(globalsCssContent).toContain('.finance-report-modal-dialog');
    expect(globalsCssContent).toContain('.report-collapsible-section');
  });

  it('10. Zero Emojis (D-14) compliance across all touched files', () => {
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(eventsManagerContent)).toBe(false);
    expect(emojiRegex.test(moneyReportContent)).toBe(false);
    expect(emojiRegex.test(tooltipComponentContent)).toBe(false);
    expect(emojiRegex.test(globalsCssContent)).toBe(false);
    expect(emojiRegex.test(eventsServerContent)).toBe(false);
  });
});
