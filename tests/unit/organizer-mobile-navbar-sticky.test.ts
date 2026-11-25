import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer Mobile Navbar Sticky & Unified Layout Refinement', () => {
  const rootDir = process.cwd();

  it('verifies admin-topbar remains sticky at top: 0 with z-index: 50 and has no position: static on mobile', () => {
    const backOfficeCss = readFileSync(
      join(rootDir, 'src/app/back-office/back-office.css'),
      'utf8',
    );
    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );

    // globals.css desktop & base definition
    expect(globalsCss).toMatch(/\.admin-topbar\s*\{[^}]*position:\s*sticky;/);
    expect(globalsCss).toMatch(/\.admin-topbar\s*\{[^}]*top:\s*0;/);
    expect(globalsCss).toMatch(/\.admin-topbar\s*\{[^}]*z-index:\s*50;/);

    // back-office.css mobile definition must be sticky top: 0 and NOT static
    expect(backOfficeCss).not.toContain('position: static');
    expect(backOfficeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[^}]*\.admin-topbar\s*\{[^}]*position:\s*sticky;/);
    expect(backOfficeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[^}]*\.admin-topbar\s*\{[^}]*top:\s*0;/);
  });

  it('verifies organizer-subnav-bar remains sticky below topbar with dynamic height variable', () => {
    const backOfficeCss = readFileSync(
      join(rootDir, 'src/app/back-office/back-office.css'),
      'utf8',
    );

    expect(backOfficeCss).toMatch(/\.organizer-subnav-bar\s*\{[^}]*position:\s*sticky;/);
    expect(backOfficeCss).toMatch(/\.organizer-subnav-bar\s*\{[^}]*top:\s*var\(--admin-topbar-height/);
    expect(backOfficeCss).toMatch(/\.organizer-subnav-bar\s*\{[^}]*z-index:\s*45;/);
  });

  it('verifies organizer mobile category toggle bar with section label and backward-compatible testid', () => {
    const organizerWorkspaceViewSrc = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    const backOfficeCss = readFileSync(
      join(rootDir, 'src/app/back-office/back-office.css'),
      'utf8',
    );

    // Organizer mobile toggle bar wrapper & elements
    expect(organizerWorkspaceViewSrc).toContain('organizer-mobile-nav-bar');
    expect(organizerWorkspaceViewSrc).toContain('data-testid="organizer-mobile-menu-toggle"');
    expect(organizerWorkspaceViewSrc).toContain('mobile-toggle-bar');
    expect(organizerWorkspaceViewSrc).toContain('organizer-active-section-label');
    expect(organizerWorkspaceViewSrc).toContain('SECTION_TITLES');
    expect(organizerWorkspaceViewSrc).toContain('ChevronDownIcon');

    // CSS rules for mobile toggle bar and menu
    expect(backOfficeCss).toContain('.organizer-mobile-nav-bar');
    expect(backOfficeCss).toContain('.organizer-mobile-menu-content');
    expect(backOfficeCss).toContain('.organizer-active-section-label');
    expect(backOfficeCss).toContain('.organizer-mobile-chevron');
  });

  it('verifies Rule D-14 zero emojis in all modified files', () => {
    const files = [
      'src/components/organizer-workspace-view.tsx',
      'src/app/back-office/back-office.css',
      'tests/unit/organizer-mobile-navbar-sticky.test.ts',
    ];

    for (const file of files) {
      const content = readFileSync(join(rootDir, file), 'utf8');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
