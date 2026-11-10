import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-233 to D-245: Concert Hub Modernization, Balanced Toolbar, Card Hierarchy & Clean Underline Tabs', () => {
  const rootDir = process.cwd();

  it('verifies D-233: Containerless flat canvas for Concert Hub', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    // Ensure .owner-section-body > div does not apply background/border to .owner-concert-management-hub
    expect(cssContent).toContain('.owner-section-body > div:not(.owner-concert-management-hub)');
    expect(cssContent).toContain('.owner-concert-management-hub {');
    expect(cssContent).toContain('background: transparent;');
    expect(cssContent).toContain('box-shadow: none;');
  });

  it('verifies D-241 & D-245: Balanced Toolbar pairing 3 Underline Tabs on left with Search, Sort & Refresh on right', () => {
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Balanced toolbar layout
    expect(managerContent).toContain('hub-toolbar-row');
    expect(managerContent).toContain('hub-filter-tabs-bar');
    expect(managerContent).toContain('hub-toolbar-tools-right');
    expect(managerContent).toContain('hub-search-box');
    expect(managerContent).toContain('hub-sort-select');
    expect(managerContent).toContain('hub-refresh-btn');

    // 3 Status underline tabs
    expect(managerContent).toContain('รออนุมัติ');
    expect(managerContent).toContain('อนุมัติแล้ว');
    expect(managerContent).toContain('อื่น ๆ');

    // CSS styling
    expect(cssContent).toContain('.hub-toolbar-row');
    expect(cssContent).toContain('.hub-filter-tabs-bar');
    expect(cssContent).toContain('.hub-sort-select');
    expect(cssContent).toContain('.hub-refresh-btn');
  });

  it('verifies D-242: Image-free editorial cards with vertical divider and right action column', () => {
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Cards do not have poster image or placeholder
    expect(managerContent).not.toContain('row-poster-img');
    expect(managerContent).not.toContain('row-poster-placeholder');

    // Vertical divider on desktop
    expect(cssContent).toContain('.row-card-right {');
    expect(cssContent).toContain('border-left: 1px solid #e2e8f0;');
  });

  it('verifies D-243: 5-Row Ordered Information Hierarchy in concert cards', () => {
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );

    // Card structure has badge row, title, meta strip, tags strip
    expect(managerContent).toContain('row-card-badge-row');
    expect(managerContent).toContain('row-event-title');
    expect(managerContent).toContain('row-meta-strip');
    expect(managerContent).toContain('row-tags-strip');
  });

  it('verifies D-244: Default tab to pending and pagination controls', () => {
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Default status state is pending
    expect(managerContent).toContain("useState<'pending' | 'approved' | 'rejected'>('pending')");

    // Pagination controls present
    expect(managerContent).toContain('hub-pagination-bar');
    expect(managerContent).toContain('pagination-controls');
    expect(cssContent).toContain('.hub-pagination-bar');
    expect(cssContent).toContain('.pagination-controls');
  });

  it('verifies D-240: Unstyled structural top navigation without coming-soon pills', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // No coming-soon pill
    expect(workspaceContent).not.toContain('subnav-coming-soon-pill');

    // Underline active state
    expect(cssContent).toContain('.owner-subnav-bar');
    expect(cssContent).toContain('.owner-subnav-tab');
    expect(cssContent).toContain('border-bottom: 2px solid #0f172a;');
  });

  it('verifies D-235: Integrated live search bar with real-time filtering', () => {
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    expect(managerContent).toContain('SearchIcon');
    expect(managerContent).toContain('searchQuery');
    expect(managerContent).toContain('setSearchQuery');
    expect(managerContent).toContain('hub-search-box');
    expect(managerContent).toContain('hub-search-input');
    expect(managerContent).toContain('filteredSessions');
    expect(managerContent).toContain('filteredApprovedEvents');
    expect(managerContent).toContain('filteredRejectedEvents');
  });

  it('verifies D-236: Admin-granted privilege governance model', () => {
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    // On pending session row card, ensure no organizer-requested UBU badge is shown
    const pendingSectionMatch = managerContent.match(
      /<section className="owner-pending-concerts-section"[\s\S]*?>([\s\S]*?)<\/section>/,
    );
    expect(pendingSectionMatch?.[1]).toBeDefined();
    expect(pendingSectionMatch?.[1]).not.toContain('ubu-badge');

    // In Review Modal, Admin has explicit control/toggle to grant UBU privilege
    expect(managerContent).toContain('custom-ubu-grant-select');
    expect(managerContent).toContain('การให้สิทธิ์ ม.อุบลฯ (UBU Privilege Grant by Admin)');
    expect(managerContent).toContain('ไม่อนุมัติสิทธิ์ ม.อุบลฯ');
    expect(managerContent).toContain('อนุมัติมอบสิทธิ์ ม.อุบลฯ');
  });

  it('verifies D-237: Comprehensive full inspection review modal displaying all organizer details', () => {
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    expect(managerContent).toContain('admin-full-concert-review-modal');
    expect(managerContent).toContain('ข้อมูลทั่วไปของคอนเสิร์ต (Basic Information)');
    expect(managerContent).toContain('รอบการแสดงและประเภทบัตร (Sessions & Tickets)');
    expect(managerContent).toContain('บัญชีธนาคารสำหรับรับเงินโอน (Payout Bank Account)');
    expect(managerContent).toContain('กำหนดอัตราค่าบริการและสิทธิ์พิเศษสำหรับคอนเสิร์ตนี้ (Admin Governance)');
    expect(managerContent).toContain('แผนที่ / Google Maps:');
    expect(managerContent).toContain('จำกัดจำนวนซื้อต่อคำสั่งซื้อ:');
    expect(managerContent).toContain('คำอธิบายงานคอนเสิร์ต:');
    expect(managerContent).toContain('กติกาและระเบียบการเข้าชม:');
  });

  it('verifies D-238: High-contrast button hierarchy (Primary black, Secondary white, Danger red outline)', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Secondary buttons: white background with dark border and text
    expect(cssContent).toContain('.owner-workspace-container .secondary-button');
    expect(cssContent).toContain('background-color: #ffffff;');
    expect(cssContent).toContain('color: #0f172a;');
    expect(cssContent).toContain('border: 1px solid #cbd5e1;');

    // Danger / reject buttons: white background with red border and text
    expect(cssContent).toContain('.owner-workspace-container button.danger-button');
    expect(cssContent).toContain('.owner-workspace-container .reject-btn');
    expect(cssContent).toContain('color: #dc2626;');
    expect(cssContent).toContain('border: 1px solid #fca5a5;');
  });

  it('verifies D-246: Uniform Card Architecture, Divider Alignment & Fixed Action Column (240px)', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );

    // Fixed width 240px for .row-card-right
    expect(cssContent).toContain('flex: 0 0 240px;');
    expect(cssContent).toContain('width: 240px;');
    expect(cssContent).toContain('min-width: 240px;');
    expect(cssContent).toContain('max-width: 240px;');

    // Height 38px and width 100% for .row-action-btn
    expect(cssContent).toContain('height: 38px;');
    expect(cssContent).toContain('min-height: 38px;');
    expect(cssContent).toContain('width: 100%;');

    // Clean cards without thick colored left borders
    expect(cssContent).not.toContain('.concert-horizontal-row-card.amendment-row {');
    expect(cssContent).not.toContain('.concert-horizontal-row-card.cancellation-row {');
    expect(cssContent).not.toContain('.concert-horizontal-row-card.approved-row {');
    expect(cssContent).not.toContain('.concert-horizontal-row-card.rejected-row {');

    // Uniform 5th row tags strip across cards
    expect(managerContent).toContain('row-tags-strip');
  });

  it('verifies D-247: Modernized Refund Management Hub (Flat Canvas, 3 Underline Tabs, Uniform Cards & Modal Dialogs)', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    const refundsContent = readFileSync(
      join(rootDir, 'src/components/owner-refund-approval-manager.tsx'),
      'utf8',
    );
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );

    // 1. Flat Canvas exclusion and transparent background
    expect(cssContent).toContain('.owner-section-body > div.owner-refund-management-hub');
    expect(cssContent).toContain('.owner-refund-management-hub');
    expect(refundsContent).toContain('owner-refund-management-hub');

    // 2. No coming soon block in workspace view for refunds
    expect(workspaceContent).toContain("activeSection !== 'refunds'");

    // 3. Balanced Toolbar with 3 Underline Tabs
    expect(refundsContent).toContain('hub-toolbar-row');
    expect(refundsContent).toContain('hub-filter-tabs-bar');
    expect(refundsContent).toContain('รอตรวจสอบ');
    expect(refundsContent).toContain('รอโอนเงินคืน (Approved)');
    expect(refundsContent).toContain('โอนสำเร็จแล้ว (Completed)');

    // 4. Uniform Card architecture matching D-246
    expect(refundsContent).toContain('concert-horizontal-row-card refund-request-card');
    expect(refundsContent).toContain('row-card-center');
    expect(refundsContent).toContain('row-card-right');
    expect(refundsContent).toContain('row-action-btn');

    // 5. E2E selector compatibility
    expect(refundsContent).toContain('transfer-note-input-');
    expect(refundsContent).toContain('confirm-complete-transfer-btn-');
    expect(refundsContent).toContain('owner-refund-approval-manager');
    expect(refundsContent).toContain('owner-refund-feedback-banner');
  });

  it('verifies D-248: 4-Group Navigation Layout with Hairline Dividers across Desktop and Mobile', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // 1. 4 Functional Navigation Groups
    expect(workspaceContent).toContain('SECTION_GROUPS');
    expect(workspaceContent).toContain('dashboard');
    expect(workspaceContent).toContain('concerts-operations');
    expect(workspaceContent).toContain('commerce-finance');
    expect(workspaceContent).toContain('governance-system');

    // 2. DOM structure contains group wrapper and dividers
    expect(workspaceContent).toContain('owner-subnav-group');
    expect(workspaceContent).toContain('owner-subnav-divider');

    // 3. Desktop CSS
    expect(cssContent).toContain('.owner-subnav-group');
    expect(cssContent).toContain('.owner-subnav-divider');
    expect(cssContent).toContain('width: 1px;');
    expect(cssContent).toContain('height: 18px;');

    // 4. Mobile responsive CSS
    expect(cssContent).toContain('margin: 0.45rem 0;');
  });

  it('verifies D-249: Persistent Sticky Top Navigation for Admin & Organizer Portals', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    const clockContent = readFileSync(
      join(rootDir, 'src/components/admin-date-time-display.tsx'),
      'utf8',
    );

    // 1. Root variable and sticky topbar
    expect(cssContent).toContain('--admin-topbar-height:');
    expect(cssContent).toContain('.admin-topbar {');
    expect(cssContent).toMatch(/\.admin-topbar\s*\{[^}]*position:\s*sticky;/);
    expect(cssContent).toMatch(/\.admin-topbar\s*\{[^}]*top:\s*0;/);
    expect(cssContent).toMatch(/\.admin-topbar\s*\{[^}]*z-index:\s*50;/);

    // 2. Owner & Organizer subnav sticky positioning and white background
    expect(cssContent).toMatch(/\.owner-subnav-bar\s*\{[^}]*position:\s*sticky;/);
    expect(cssContent).toMatch(/\.owner-subnav-bar\s*\{[^}]*top:\s*var\(--admin-topbar-height/);
    expect(cssContent).toMatch(/\.owner-subnav-bar\s*\{[^}]*background:\s*#ffffff;/);

    expect(cssContent).toMatch(/\.organizer-subnav-bar\s*\{[^}]*position:\s*sticky;/);
    expect(cssContent).toMatch(/\.organizer-subnav-bar\s*\{[^}]*top:\s*var\(--admin-topbar-height/);
    expect(cssContent).toMatch(/\.organizer-subnav-bar\s*\{[^}]*background:\s*#ffffff;/);

    // 3. Dynamic height sync in AdminDateTimeDisplay
    expect(clockContent).toContain('--admin-topbar-height');
    expect(clockContent).toContain('ResizeObserver');
  });

  it('verifies D-14: Zero Emojis compliance across all modified files', () => {
    const filesToCheck = [
      'src/components/owner-session-approval-manager.tsx',
      'src/components/owner-refund-approval-manager.tsx',
      'src/components/owner-workspace-view.tsx',
      'src/components/admin-date-time-display.tsx',
      'src/app/globals.css',
      'docs/requirement.md',
    ];

    for (const file of filesToCheck) {
      const content = readFileSync(join(rootDir, file), 'utf8');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
