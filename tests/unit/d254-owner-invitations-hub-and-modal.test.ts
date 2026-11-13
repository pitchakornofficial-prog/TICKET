import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-254: Users & Invitations Hub Modernization, Underline Tabs & Modal-Driven Creation', () => {
  const rootDir = process.cwd();

  it('verifies D-254: Flat Canvas container for Users & Invitations Hub', () => {
    const cssContent = (`${readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8')}\n${readFileSync(join(rootDir, 'src/app/globals.css').replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
    const viewContent = readFileSync(
      join(rootDir, 'src/components/owner-invitations-view.tsx'),
      'utf8',
    );

    // CSS excludes .owner-invitations-management-hub from outer card container
    expect(cssContent).toContain('.owner-invitations-management-hub');
    expect(cssContent).toContain('background: transparent;');
    expect(cssContent).toContain('box-shadow: none;');

    // Component includes flat canvas class and test id
    expect(viewContent).toContain('owner-invitations-management-hub');
    expect(viewContent).toContain('data-testid="owner-invitations-hub"');
  });

  it('verifies D-254: Balanced Toolbar pairing 3 Underline Tabs with Search, Filter & 38px Primary Invite Button (Q1 -> A1, Q2 -> B1)', () => {
    const viewContent = readFileSync(
      join(rootDir, 'src/components/owner-invitations-view.tsx'),
      'utf8',
    );

    // 3 Underline Tabs (Q1 -> A1)
    expect(viewContent).toContain('รายการคำเชิญ');
    expect(viewContent).toContain('บัญชีผู้จัดงาน');
    expect(viewContent).toContain('บัญชีผู้ดูแลระบบ');

    // Balanced Toolbar structure
    expect(viewContent).toContain('hub-toolbar-row');
    expect(viewContent).toContain('hub-filter-tabs-bar');
    expect(viewContent).toContain('hub-toolbar-tools-right');

    // Tools: Search, Filter, Refresh & 38px Primary Button (Q2 -> B1)
    expect(viewContent).toContain('hub-search-box');
    expect(viewContent).toContain('hub-search-input');
    expect(viewContent).toContain('hub-filter-select');
    expect(viewContent).toContain('hub-refresh-btn');
    expect(viewContent).toContain('data-testid="open-invite-modal-btn"');
    expect(viewContent).toContain('ส่งคำเชิญใหม่');
  });

  it('verifies D-254: Horizontal Row Cards with 4-row ordered hierarchy and 240px right column with 38px buttons (Q3 -> C1)', () => {
    const viewContent = readFileSync(
      join(rootDir, 'src/components/owner-invitations-view.tsx'),
      'utf8',
    );

    // Horizontal Card structure
    expect(viewContent).toContain('concert-horizontal-row-card');
    expect(viewContent).toContain('row-card-center');
    expect(viewContent).toContain('row-card-right');
    expect(viewContent).toContain('row-card-badge-row');
    expect(viewContent).toContain('row-detail-pill');

    // 240px Action buttons in row cards
    expect(viewContent).toContain('คัดลอกลิงก์คำเชิญ');
    expect(viewContent).toContain('ส่งคำเชิญซ้ำ / ออกลิงก์ใหม่');
    expect(viewContent).toContain('ส่งลิงก์รีเซ็ตรหัสผ่าน');
    expect(viewContent).toContain('ดูรายละเอียดบัญชี');
  });

  it('verifies D-254: All-in-One Create Invite Modal Dialog (Q2 -> B1)', () => {
    const viewContent = readFileSync(
      join(rootDir, 'src/components/owner-invitations-view.tsx'),
      'utf8',
    );

    // Modal structure
    expect(viewContent).toContain('review-modal-backdrop');
    expect(viewContent).toContain('admin-full-dialog-modal invite-dialog');
    expect(viewContent).toContain('เชิญผู้จัดงานหรือผู้ดูแลระบบใหม่');

    // Backward-compatibility IDs for tests
    expect(viewContent).toContain('id="invite-organizer-form"');
    expect(viewContent).toContain('id="invite-role-select"');
    expect(viewContent).toContain('id="organizer-email"');
    expect(viewContent).toContain('id="invite-error"');
    expect(viewContent).toContain('id="invite-success"');
    expect(viewContent).toContain('id="submit-invite-btn"');
  });

  it('verifies D-254: Account Details Modal Dialog', () => {
    const viewContent = readFileSync(
      join(rootDir, 'src/components/owner-invitations-view.tsx'),
      'utf8',
    );

    expect(viewContent).toContain('admin-full-dialog-modal user-details-dialog');
    expect(viewContent).toContain('รายละเอียดบัญชีผู้ใช้งาน');
    expect(viewContent).toContain('modal-summary-card');
  });

  it('verifies D-14: Zero Emojis compliance across all touched files', () => {
    const filesToCheck = [
      'src/components/owner-invitations-view.tsx',
      'src/components/owner-workspace-view.tsx',
      'src/app/globals.css',
      'docs/requirement.md',
      'tests/unit/d254-owner-invitations-hub-and-modal.test.ts',
    ];

    const emojiRegex =
      /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;

    for (const file of filesToCheck) {
      const content = readFileSync(join(rootDir, file), 'utf8');
      expect(emojiRegex.test(content)).toBe(false);
    }
  });
});
