import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-255 System & News Hub Modernization, News Approval & Authoring Hub, Admin Contact Channels & Live Preview', () => {
  const rootDir = process.cwd();
  const systemHubPath = join(rootDir, 'src/components/owner-system-hub.tsx');
  const workspaceViewPath = join(rootDir, 'src/components/owner-workspace-view.tsx');
  const globalsCssPath = join(rootDir, 'src/app/globals.css');
  const requirementDocPath = join(rootDir, 'docs/requirement.md');

  const systemHubSrc = readFileSync(systemHubPath, 'utf8');
  const workspaceViewSrc = readFileSync(workspaceViewPath, 'utf8');
  const globalsCssSrc = (`${readFileSync(globalsCssPath, 'utf8')}\n${readFileSync(globalsCssPath.replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
  const requirementDocSrc = readFileSync(requirementDocPath, 'utf8');

  it('verifies D-255 requirement is properly recorded in docs/requirement.md', () => {
    expect(requirementDocSrc).toContain('D-255');
    expect(requirementDocSrc).toContain('System & News Hub Modernization');
    expect(requirementDocSrc).toContain('/back-office/owner#system');
    expect(requirementDocSrc).toContain('Flat Canvas');
    expect(requirementDocSrc).toContain('ข่าวสารและประกาศ');
    expect(requirementDocSrc).toContain('ข้อมูลติดต่อแอดมิน');
    expect(requirementDocSrc).toContain('ข้อขัดแย้งออฟไลน์');
  });

  it('verifies Flat Canvas architecture and 3 Underline Tabs (Q1 -> A1)', () => {
    // Excluded from old white card wrapper
    expect(globalsCssSrc).toContain(':not(.owner-system-management-hub)');
    expect(globalsCssSrc).toContain('.owner-system-management-hub');
    expect(systemHubSrc).toContain('owner-system-management-hub');

    // 3 Underline Tabs with count badges
    expect(systemHubSrc).toContain('data-testid="tab-news"');
    expect(systemHubSrc).toContain('data-testid="tab-contacts"');
    expect(systemHubSrc).toContain('data-testid="tab-conflicts"');
    expect(systemHubSrc).toContain('ข่าวสารและประกาศ');
    expect(systemHubSrc).toContain('ข้อมูลติดต่อแอดมิน');
    expect(systemHubSrc).toContain('ข้อขัดแย้งออฟไลน์');
  });

  it('verifies Balanced Toolbar, Live Search, Source Filter & 38px News Creation Button (Q2 -> A2)', () => {
    expect(systemHubSrc).toContain('hub-toolbar-row');
    expect(systemHubSrc).toContain('hub-toolbar-tools-right');
    expect(systemHubSrc).toContain('hub-search-box');
    expect(systemHubSrc).toContain('ค้นหาหัวข้อข่าว, ผู้จัดงาน, คอนเสิร์ต...');
    expect(systemHubSrc).toContain('แหล่งที่มา: ทั้งหมด');
    expect(systemHubSrc).toContain('ประกาศแอดมิน (Admin)');
    expect(systemHubSrc).toContain('ส่งจากผู้จัดงาน (Organizer)');
    expect(systemHubSrc).toContain('data-testid="open-create-news-modal-btn"');
    expect(systemHubSrc).toContain('+ เขียนประกาศใหม่');
  });

  it('verifies Modal-Driven News Creation & Organizer News Approval Dialogs (Q2 -> A2)', () => {
    // Modal 1: Create News
    expect(systemHubSrc).toContain('id="owner-news-form"');
    expect(systemHubSrc).toContain('id="news-title"');
    expect(systemHubSrc).toContain('id="news-content"');
    expect(systemHubSrc).toContain('หมวดหมู่ประกาศ');
    expect(systemHubSrc).toContain('ช่องทางเผยแพร่');
    expect(systemHubSrc).toContain('หน้าแรกเว็บ (Home Catalog)');
    expect(systemHubSrc).toContain('หน้ารายละเอียดคอนเสิร์ต');
    expect(systemHubSrc).toContain('เผยแพร่ทันที');
    expect(systemHubSrc).toContain('บันทึกเป็นฉบับร่าง');

    // Modal 2: Organizer News Review & Approval Dialog
    expect(systemHubSrc).toContain('news-approval-dialog');
    expect(systemHubSrc).toContain('ตรวจสอบและอนุมัติข่าวสาร');
    expect(systemHubSrc).toContain('ส่งโดยผู้จัดงาน:');
    expect(systemHubSrc).toContain('rejection-notes');
    expect(systemHubSrc).toContain('ส่งกลับแก้ไข');
    expect(systemHubSrc).toContain('อนุมัติและเผยแพร่');
  });

  it('verifies Horizontal Row Cards 4-row hierarchy with 240px right action column (Q3 -> A3)', () => {
    expect(systemHubSrc).toContain('concert-horizontal-row-card');
    expect(systemHubSrc).toContain('row-card-center');
    expect(systemHubSrc).toContain('row-card-badge-row');
    expect(systemHubSrc).toContain('row-title-line');
    expect(systemHubSrc).toContain('row-description-line');
    expect(systemHubSrc).toContain('row-tags-strip');
    expect(systemHubSrc).toContain('row-card-right');
    expect(systemHubSrc).toContain('ตรวจและอนุมัติ');
    expect(systemHubSrc).toContain('ดูเนื้อหาฉบับเต็ม');
  });

  it('verifies Admin Contact Channels with 2-column layout and Live Preview Card (Q4 -> A4)', () => {
    expect(systemHubSrc).toContain('id="owner-contact-info-manager"');
    expect(systemHubSrc).toContain('owner-contacts-layout');
    expect(systemHubSrc).toContain('contacts-form-side');
    expect(systemHubSrc).toContain('contacts-preview-side');
    expect(systemHubSrc).toContain('contact-live-preview-card');
    expect(systemHubSrc).toContain('มุมมองจำลอง (Live Preview)');
    expect(systemHubSrc).toContain('LIVE SYNC');

    // Preserves all existing input IDs
    expect(systemHubSrc).toContain('id="owner-contact-hotline"');
    expect(systemHubSrc).toContain('id="owner-contact-hotline-badge"');
    expect(systemHubSrc).toContain('id="owner-contact-hotline-note"');
    expect(systemHubSrc).toContain('id="owner-contact-email"');
    expect(systemHubSrc).toContain('id="owner-contact-email-badge"');
    expect(systemHubSrc).toContain('id="owner-contact-email-note"');
    expect(systemHubSrc).toContain('id="owner-contact-line"');
    expect(systemHubSrc).toContain('id="owner-contact-line-badge"');
    expect(systemHubSrc).toContain('id="owner-contact-line-note"');
    expect(systemHubSrc).toContain('id="owner-contact-hours"');
    expect(systemHubSrc).toContain('id="owner-contact-address"');
    expect(systemHubSrc).toContain('บันทึกข้อมูลติดต่อ');
    expect(systemHubSrc).toContain('รีเซ็ตเป็นค่าเริ่มต้น');
  });

  it('verifies OwnerWorkspaceView integration and backward compatibility', () => {
    expect(workspaceViewSrc).toContain('OwnerSystemHub');
    expect(workspaceViewSrc).toContain("<OwnerSystemHub />");
    expect(workspaceViewSrc).toContain("activeSection === 'system'");
    expect(workspaceViewSrc).toContain('href="#owner-news-manager"');
    expect(workspaceViewSrc).toContain('href="#owner-contact-info-manager"');
    expect(workspaceViewSrc).toContain('href="#owner-sync-conflicts-manager"');
  });

  it('enforces 100% Zero Emojis (D-14) compliance', () => {
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(systemHubSrc).not.toMatch(emojiRegex);
  });
});
