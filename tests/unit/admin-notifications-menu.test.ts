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
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.admin-notifications-wrap');
    expect(cssContent).toContain('.admin-notifications-bell-btn');
    expect(cssContent).toContain('.bell-unread-dot');
    expect(cssContent).toContain('.admin-notifications-dropdown');
    expect(cssContent).toContain('.notification-summary-card.is-unread');
    expect(cssContent).toContain('.notification-modal-card');
  });
});
