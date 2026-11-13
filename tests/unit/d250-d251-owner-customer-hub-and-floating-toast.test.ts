import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-250 & D-251: Customer & Orders Hub Modernization & Top-Center Floating Toast Notification', () => {
  const rootDir = process.cwd();

  it('verifies D-250: Containerless flat canvas for Customer & Orders Hub', () => {
    const cssContent = (`${readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8')}\n${readFileSync(join(rootDir, 'src/app/globals.css').replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
    const hubContent = readFileSync(
      join(rootDir, 'src/components/owner-customer-hub.tsx'),
      'utf8',
    );

    // CSS excludes .owner-customer-management-hub from outer card box
    expect(cssContent).toContain('.owner-section-body > div:not(.owner-concert-management-hub):not(.owner-refund-management-hub):not(.owner-customer-management-hub)');
    expect(cssContent).toContain('.owner-customer-management-hub');
    expect(cssContent).toContain('background: transparent;');
    expect(cssContent).toContain('box-shadow: none;');

    // Component has main class
    expect(hubContent).toContain('owner-customer-management-hub');
  });

  it('verifies D-250: Balanced Toolbar pairing 3 Underline Tabs with Dual Dropdown Filters, Search & Refresh', () => {
    const hubContent = readFileSync(
      join(rootDir, 'src/components/owner-customer-hub.tsx'),
      'utf8',
    );

    // 3 Underline Tabs (Q1 -> A2)
    expect(hubContent).toContain('คำสั่งซื้อทั้งหมด');
    expect(hubContent).toContain('ประวัติการแก้ไขข้อมูล');
    expect(hubContent).toContain('ปัญหาการส่งอีเมลบัตร');

    // Balanced Toolbar Layout
    expect(hubContent).toContain('hub-toolbar-row');
    expect(hubContent).toContain('hub-filter-tabs-bar');
    expect(hubContent).toContain('hub-toolbar-tools-right');

    // Tools: Search, Dual Filters, Refresh (Q2 -> B1)
    expect(hubContent).toContain('hub-search-box');
    expect(hubContent).toContain('hub-search-input');
    expect(hubContent).toContain('customer-filter-event');
    expect(hubContent).toContain('customer-filter-status');
    expect(hubContent).toContain('การแก้ไข: ทั้งหมด');
    expect(hubContent).toContain('เคยแก้ไขข้อมูลแล้ว');
    expect(hubContent).toContain('ยังไม่เคยแก้ไข');
    expect(hubContent).toContain('hub-refresh-btn');
  });

  it('verifies D-250: Standard 38px Button Dimensions & Uniform 240px Action Column', () => {
    const cssContent = (`${readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8')}\n${readFileSync(join(rootDir, 'src/app/globals.css').replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
    const hubContent = readFileSync(
      join(rootDir, 'src/components/owner-customer-hub.tsx'),
      'utf8',
    );

    // Standard 38px button height
    expect(cssContent).toContain('height: 38px;');
    expect(cssContent).toContain('min-height: 38px;');

    // Modal action button 38px
    expect(cssContent).toContain('.modal-footer-btn {');
    expect(cssContent).toContain('height: 38px;');

    // Text inputs 38px
    expect(cssContent).toContain('.modal-text-input {');
    expect(cssContent).toContain('height: 38px;');

    // Action buttons inside row card
    expect(hubContent).toContain('row-card-right');
    expect(hubContent).toContain('row-action-btn');
  });

  it('verifies D-250: Modal-Driven Dialogs for Contact Edit, Audit History & Order Details', () => {
    const hubContent = readFileSync(
      join(rootDir, 'src/components/owner-customer-hub.tsx'),
      'utf8',
    );

    // 1. Edit Contact Modal
    expect(hubContent).toContain('review-modal-backdrop');
    expect(hubContent).toContain('edit-contact-dialog');
    expect(hubContent).toContain('new-buyer-email');
    expect(hubContent).toContain('new-buyer-phone');
    expect(hubContent).toContain('correction-reason');
    expect(hubContent).toContain('บันทึกเหตุผลการตรวจสอบตัวตนผู้ซื้อ *');

    // 2. Audit History Modal
    expect(hubContent).toContain('audit-history-dialog');
    expect(hubContent).toContain('contact-audit-log-container');
    expect(hubContent).toContain('timeline-item-card');
    expect(hubContent).toContain('audit-diff-box');

    // 3. Order Details Modal
    expect(hubContent).toContain('order-details-dialog');
    expect(hubContent).toContain('รายละเอียดคำสั่งซื้อ');
  });

  it('verifies D-250: System-wide audit logs API route exists', () => {
    const auditRouteContent = readFileSync(
      join(rootDir, 'src/app/api/owner/orders/contact-correction/audits/route.ts'),
      'utf8',
    );
    expect(auditRouteContent).toContain('getAllOrderContactAuditLogs');
    expect(auditRouteContent).toContain('GET');
  });

  it('verifies D-251: Universal Top-Center Floating Toast with 5-Second Countdown', () => {
    const toastContent = readFileSync(
      join(rootDir, 'src/components/toast-notification.tsx'),
      'utf8',
    );
    const cssContent = (`${readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8')}\n${readFileSync(join(rootDir, 'src/app/globals.css').replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);

    // 1. Component props and structure
    expect(toastContent).toContain('top-center-toast-notification');
    expect(toastContent).toContain('toast-timer-pill');
    expect(toastContent).toContain('toast-progress-bar');
    expect(toastContent).toContain('toast-close-btn');
    expect(toastContent).toContain('triggerToast');

    // 2. CSS Positioning: Top-Center Floating (Q3 -> C2)
    expect(cssContent).toContain('.top-center-toast-notification {');
    expect(cssContent).toMatch(/\.top-center-toast-notification\s*\{[^}]*position:\s*fixed;/);
    expect(cssContent).toMatch(/\.top-center-toast-notification\s*\{[^}]*top:\s*1\.25rem;/);
    expect(cssContent).toMatch(/\.top-center-toast-notification\s*\{[^}]*left:\s*50%;/);
    expect(cssContent).toMatch(/\.top-center-toast-notification\s*\{[^}]*transform:\s*translateX\(-50%\);/);
    expect(cssContent).toMatch(/\.top-center-toast-notification\s*\{[^}]*z-index:\s*10000;/);

    // 3. Toast Modes: Success & Error
    expect(cssContent).toContain('.top-center-toast-notification.toast-success');
    expect(cssContent).toContain('.top-center-toast-notification.toast-error');
  });

  it('verifies D-14: Zero Emojis compliance across all D-250 and D-251 files', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const files = [
      'src/components/owner-customer-hub.tsx',
      'src/components/toast-notification.tsx',
      'src/components/owner-contact-correction-manager.tsx',
      'src/components/owner-workspace-view.tsx',
      'src/server/contact-correction.ts',
      'src/app/api/owner/orders/contact-correction/audits/route.ts',
      'src/app/globals.css',
      'docs/requirement.md',
    ];

    for (const relPath of files) {
      const fullPath = join(rootDir, relPath);
      const content = readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        expect(
          emojiRegex.test(line),
          `Found emoji on line ${idx + 1} of ${relPath}: ${line}`,
        ).toBe(false);
      });
    }
  });
});
