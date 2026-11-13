import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Admin Notifications Menu & Interactive Detail Modal (D-80)', () => {
  const rootDir = process.cwd();

  it('integrates AdminNotificationsMenu on topbar between user profile stack and logout button in back-office workspace', () => {
    const pageContent = readFileSync(
      join(rootDir, 'src/app/back-office/[role]/page.tsx'),
      'utf8',
    );
    expect(pageContent).toContain('AdminNotificationsMenu');
    expect(pageContent).toMatch(
      /<div className="admin-user-profile-stack">[\s\S]*?<\/div>\s*<AdminNotificationsMenu \/>\s*<div className="admin-logout-wrap">/,
    );
    expect(pageContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('defines AdminNotificationsMenu with bell button, red unread dot, dropdown and zero emojis', () => {
    const compContent = readFileSync(
      join(rootDir, 'src/components/admin-notifications-menu.tsx'),
      'utf8',
    );
    expect(compContent).toContain('admin-notifications-bell-btn');
    expect(compContent).toContain('bell-unread-dot');
    expect(compContent).toContain('admin-notifications-dropdown');
    expect(compContent).toContain('notifications-mark-all-btn');
    expect(compContent).toContain('notifications-filter-tabs');
    expect(compContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('supports unread highlights, category badges, full detail reading modal, and actions to keep or delete', () => {
    const compContent = readFileSync(
      join(rootDir, 'src/components/admin-notifications-menu.tsx'),
      'utf8',
    );
    expect(compContent).toContain('notification-summary-card');
    expect(compContent).toContain('notification-modal-card');
    expect(compContent).toContain('handleToggleRead');
    expect(compContent).toContain('handleDelete');
    expect(compContent).toContain('อ่านฉบับเต็ม');
    expect(compContent).toContain('เก็บไว้');
    expect(compContent).toContain('ลบ');
    expect(compContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('includes proper styling rules in globals.css for notifications bell, dropdown, cards and modal', () => {
    const cssContent = (`${readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    )}\n${readFileSync(join(rootDir, 'src/app/globals.css').replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
    expect(cssContent).toContain('.admin-notifications-wrap');
    expect(cssContent).toContain('.admin-notifications-bell-btn');
    expect(cssContent).toContain('.bell-unread-dot');
    expect(cssContent).toContain('.admin-notifications-dropdown');
    expect(cssContent).toContain('.notification-summary-card.is-unread');
    expect(cssContent).toContain('.notification-modal-card');
  });

  it('enforces 100% monochrome black and white styling across all notification components (D-125)', () => {
    const cssContent = (`${readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    )}\n${readFileSync(join(rootDir, 'src/app/globals.css').replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
    // Bell unread dot uses black (#0f172a), no red
    expect(cssContent).toMatch(/\.bell-unread-dot\s*\{[^}]*background:\s*#0f172a/);
    // Unread pill uses monochrome
    expect(cssContent).toMatch(/\.notifications-unread-pill\s*\{[^}]*color:\s*#0f172a/);
    // Unread card uses dark border
    expect(cssContent).toMatch(/\.notification-summary-card\.is-unread\s*\{[^}]*border-left:\s*3\.5px solid #0f172a/);
    // Badges are monochrome
    expect(cssContent).toMatch(/\.notification-category-badge\s*\{[^}]*color:\s*#0f172a/);
    // View full link uses underline
    expect(cssContent).toMatch(/\.notification-view-full-btn\s*\{[^}]*text-decoration:\s*underline/);
    expect(cssContent).toMatch(/\.notification-view-full-btn\s*\{[^}]*color:\s*#0f172a/);
  });

  it('seeds UBU Freshy concert approval notification for club organizer (D-187)', () => {
    const compContent = readFileSync(
      join(rootDir, 'src/components/admin-notifications-menu.tsx'),
      'utf8',
    );
    expect(compContent).toContain('notif-ubu-freshy-session-approved');
    expect(compContent).toContain('UBU Freshy Music Fest 2026');
    expect(compContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements D-203: Real Bookmark System & 3-Tab Filter with Read/Saved Separation', () => {
    const compContent = readFileSync(
      join(rootDir, 'src/components/admin-notifications-menu.tsx'),
      'utf8',
    );
    // Real bookmark toggle handler
    expect(compContent).toContain('handleToggleSave');
    expect(compContent).toContain('isSaved');
    expect(compContent).toContain('savedCount');
    // 3 tabs: All, Unread, Saved
    expect(compContent).toContain('ที่บันทึกไว้');
    expect(compContent).toContain('ยังไม่อ่าน');
    expect(compContent).toContain('ทั้งหมด');
    // Save button states
    expect(compContent).toContain('บันทึกแล้ว');
    expect(compContent).toContain('เก็บไว้');
    // Explicit mark read
    expect(compContent).toContain('action-mark-read');
    expect(compContent).toContain('อ่านแล้ว');
    // Modal buttons
    expect(compContent).toContain('btn-toggle-read');
    expect(compContent).toContain('btn-save');
    expect(compContent).not.toMatch(/\p{Extended_Pictographic}/u);

    // CSS rules for saved button and saved indicator
    const cssContent = (`${readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8')}\n${readFileSync(join(rootDir, 'src/app/globals.css').replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
    expect(cssContent).toContain('.notification-action-btn.is-saved');
    expect(cssContent).toContain('.notification-saved-indicator');
    expect(cssContent).toContain('.notification-modal-btn.btn-save.is-saved');
    expect(cssContent).toContain('.notification-modal-btn.btn-toggle-read');
  });
});
