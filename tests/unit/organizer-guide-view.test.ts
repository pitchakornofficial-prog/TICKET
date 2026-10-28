import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer User Guide Workspace (D-86)', () => {
  const rootDir = process.cwd();

  it('wires OrganizerGuideView and guide tab into OrganizerWorkspaceView', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('OrganizerGuideView');
    expect(workspaceContent).toContain("activeSection === 'guide'");
    expect(workspaceContent).toContain('organizer-nav-guide');
    expect(workspaceContent).toContain('คู่มือ');
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('organizes subnav into left core group and right support/settings group with guide, contact, and settings', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('organizer-subnav-left-group');
    expect(workspaceContent).toContain('organizer-subnav-right-group');
    
    // Check order within right group
    const rightGroupIndex = workspaceContent.indexOf('organizer-subnav-right-group');
    const guideIndex = workspaceContent.indexOf('organizer-nav-guide', rightGroupIndex);
    const contactIndex = workspaceContent.indexOf('organizer-nav-contact', rightGroupIndex);
    const settingsIndex = workspaceContent.indexOf('organizer-nav-settings', rightGroupIndex);

    expect(guideIndex).toBeGreaterThan(rightGroupIndex);
    expect(contactIndex).toBeGreaterThan(guideIndex);
    expect(settingsIndex).toBeGreaterThan(contactIndex);
  });

  it('provides all 4 core guide modules in OrganizerGuideView', () => {
    const guideContent = readFileSync(
      join(rootDir, 'src/components/organizer-guide-view.tsx'),
      'utf8',
    );
    // 1. Scanning
    expect(guideContent).toContain('ระบบสแกนบัตรและควบคุมประตูเข้างาน');
    expect(guideContent).toContain('โหมดสแกนออนไลน์และเครื่องหลักออฟไลน์');
    expect(guideContent).toContain('เครื่องหลัก (Primary Scanner)');
    expect(guideContent).toContain('การส่งมอบเครื่องหลัก (Handover)');
    expect(guideContent).toContain('การระงับฉุกเฉิน (Emergency Stop)');

    // 2. Concerts
    expect(guideContent).toContain('การจัดการงานคอนเสิร์ตและรอบการแสดง');
    expect(guideContent).toContain('การสร้างงานคอนเสิร์ตและตั้งค่าบัตร');
    expect(guideContent).toContain('การส่งให้เจ้าของระบบตรวจสอบและอนุมัติ');

    // 3. Finance
    expect(guideContent).toContain('ระบบการเงิน รอบการโอนเงิน และเงินสำรอง');
    expect(guideContent).toContain('ค่าบริการแพลตฟอร์ม 5%');
    expect(guideContent).toContain('การหักเงินสำรอง 10%');

    // 4. News
    expect(guideContent).toContain('การประชาสัมพันธ์ ข่าวสาร และประกาศงาน');
    expect(guideContent).toContain('16:9');

    // Zero emojis check
    expect(guideContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('includes styling rules for organizer guide in globals.css', () => {
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.organizer-guide-page');
    expect(cssContent).toContain('.guide-page-container');
    expect(cssContent).toContain('.guide-header-text');
    expect(cssContent).toContain('.guide-toolbar-actions');
    expect(cssContent).toContain('.guide-action-pill-btn');
    expect(cssContent).toContain('.guide-module-card');
    expect(cssContent).toContain('.guide-step-content-card');
    expect(cssContent).toContain('.organizer-subnav-left-group');
    expect(cssContent).toContain('.organizer-subnav-right-group');
  });

  it('implements D-87: clean typography header without icon and unified floating back-to-top button', () => {
    const guideContent = readFileSync(
      join(rootDir, 'src/components/organizer-guide-view.tsx'),
      'utf8',
    );
    // 1. Header has clean text without icon wrap
    expect(guideContent).toContain('guide-header-text');
    expect(guideContent).not.toContain('guide-header-icon-wrap');
    expect(guideContent).toContain('คู่มือการใช้งานระบบสำหรับผู้จัดงาน');

    // 2. Uses unified floating-back-to-top button matching Settings
    expect(guideContent).toContain('className="floating-back-to-top"');
    expect(guideContent).toContain('title="กลับสู่ด้านบนสุด"');
    expect(guideContent).toContain('aria-label="กลับสู่ด้านบนสุด"');

    // 3. Zero emojis check
    expect(guideContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements D-88: default collapsed state for all 4 guide modules', () => {
    const guideContent = readFileSync(
      join(rootDir, 'src/components/organizer-guide-view.tsx'),
      'utf8',
    );
    // Initial state has scanning, concerts, finance, news set to false
    expect(guideContent).toContain('scanning: false');
    expect(guideContent).toContain('concerts: false');
    expect(guideContent).toContain('finance: false');
    expect(guideContent).toContain('news: false');

    // Expand all and collapse all buttons exist
    expect(guideContent).toContain('ขยายทั้งหมด');
    expect(guideContent).toContain('พับทั้งหมด');

    // Zero emojis check
    expect(guideContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
