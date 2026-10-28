import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer Scanner Manager (D-89)', () => {
  const rootDir = process.cwd();

  it('wires OrganizerScannerManager into OrganizerWorkspaceView for activeSection === "scanners"', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('OrganizerScannerManager');
    expect(workspaceContent).toContain("activeSection === 'scanners'");
    expect(workspaceContent).toContain('organizer-nav-scanners');
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements 2 core sub-tabs: จัดการทีมงาน and ประวัติการสแกน', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    // Sub-tabs
    expect(scannerManagerContent).toContain('จัดการทีมงาน');
    expect(scannerManagerContent).toContain('ประวัติการสแกน');
    expect(scannerManagerContent).toContain('scanner-tab-manage');
    expect(scannerManagerContent).toContain('scanner-tab-history');
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('enforces maximum 3 additional scanners quota display (D-101) and disabled add button when reaching limit', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    // Quota pill and limits
    expect(scannerManagerContent).toContain('MAX_ADDITIONAL_SCANNERS = 3');
    expect(scannerManagerContent).toContain('scanner-quota-pill');
    expect(scannerManagerContent).toContain('isQuotaFull');
    expect(scannerManagerContent).toContain('โควตาทีมเสริม: {additionalScanners.length}/{MAX_ADDITIONAL_SCANNERS} คน');
  });

  it('provides Quick Add Scanner modal with only officer name required', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('เพิ่มเจ้าหน้าที่สแกนบัตร');
    expect(scannerManagerContent).toContain('ชื่อเจ้าหน้าที่ / ประตูหรือจุดตรวจ');
    expect(scannerManagerContent).toContain('สมหมาย - ประตู A');
    expect(scannerManagerContent).toContain('showAddModal');
  });

  it('provides QR Code and direct login link modal without requiring manual password entry', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('activeQrScanner');
    expect(scannerManagerContent).toContain('คิวอาร์โค้ดและลิงก์เข้าใช้งาน');
    expect(scannerManagerContent).toContain('คัดลอกลิงก์');
    expect(scannerManagerContent).toContain('/scanner/access?scannerId=');
    expect(scannerManagerContent).toContain('scanner-qr-frame');
  });

  it('provides admission scan logs view toggle and data table', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('ประวัติสแกนบัตร');
    expect(scannerManagerContent).toContain('ประวัติเครื่องหลัก');
    expect(scannerManagerContent).toContain('history-view-switcher');
    expect(scannerManagerContent).toContain('ticketCode');
    expect(scannerManagerContent).toContain('scannerName');
  });

  it('verifies scanner direct access route sets session and redirects to /back-office/scanner', () => {
    const accessRouteContent = readFileSync(
      join(rootDir, 'src/app/scanner/access/route.ts'),
      'utf8',
    );
    expect(accessRouteContent).toContain('ticket.session_token');
    expect(accessRouteContent).toContain('/back-office/scanner');
    expect(accessRouteContent).toContain('auth_session');
    expect(accessRouteContent).toContain('createHmac');
    expect(accessRouteContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies organizer scanners API enforces quota of 3 additional scanners (D-101) and auto-assigns primary scanner for 1st scanner', () => {
    const scannersApiContent = readFileSync(
      join(rootDir, 'src/app/api/organizer/events/[id]/scanners/route.ts'),
      'utf8',
    );
    expect(scannersApiContent).toContain('จำกัดจำนวนทีมสแกนเพิ่มเติมไม่เกิน 3 คนต่อคอนเสิร์ต');
    expect(scannersApiContent).toContain('setEventPrimaryScanner');
    expect(scannersApiContent).toContain('accessUrl');
    expect(scannersApiContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies organizer admissions API exists and returns admission logs', () => {
    const admissionsApiContent = readFileSync(
      join(rootDir, 'src/app/api/organizer/events/[id]/admissions/route.ts'),
      'utf8',
    );
    expect(admissionsApiContent).toContain('ticket_admission_logs');
    expect(admissionsApiContent).toContain('logs: res.rows');
    expect(admissionsApiContent).toContain('คุณไม่มีสิทธิ์ดูข้อมูลของงานนี้');
    expect(admissionsApiContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies CSS styling rules for D-89 scanner features in globals.css', () => {
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-quota-pill');
    expect(cssContent).toContain('.scanner-quota-alert');
    expect(cssContent).toContain('.scanner-qr-frame');
    expect(cssContent).toContain('.history-view-switcher');
    expect(cssContent).toContain('.history-view-btn');
    expect(cssContent).toContain('.btn-qr-link');
    expect(cssContent).toContain('.scanner-access-link-box');
  });

  it('implements D-90 & D-102: editorial cards layout with dedicated primary card and additional staff table', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('scanner-editorial-cards-list');
    expect(scannerManagerContent).toContain('scanner-editorial-card');
    expect(scannerManagerContent).toContain('badge-primary-offline');
    expect(scannerManagerContent).toContain('badge-standard-online');
    expect(scannerManagerContent).toContain('scanner-card-td');
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements D-91: mobile and iPad centered card terminal layout for scanner', () => {
    const terminalContent = readFileSync(
      join(rootDir, 'src/components/scanner-admission-terminal.tsx'),
      'utf8',
    );
    expect(terminalContent).toContain('terminal-centered-wrapper');
    expect(terminalContent).toContain('terminal-container');
    expect(terminalContent).not.toMatch(/\p{Extended_Pictographic}/u);

    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.terminal-centered-wrapper');
    expect(cssContent).toContain('.scanner-workspace-card');
  });

  it('implements D-92: session isolation guidance in QR modal explaining browser session behavior and incognito testing', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('scanner-session-tip-box');
    expect(scannerManagerContent).toContain('คำแนะนำการใช้งานและวิธีทดสอบระบบ');
    expect(scannerManagerContent).toContain('หน้าต่างไม่ระบุตัวตน (Incognito / InPrivate Window)');
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements D-93: clean 3-zone horizontal scanner card redesign with minimalist status and unified actions', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('scanner-card-3zones');
    expect(scannerManagerContent).toContain('scanner-zone-identity');
    expect(scannerManagerContent).toContain('scanner-zone-status');
    expect(scannerManagerContent).toContain('scanner-zone-actions');
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);

    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-card-3zones');
    expect(cssContent).toContain('.scanner-zone-actions');
  });

  it('implements D-94: minimalist grayscale scanner card & scanner name editing (no avatar, no timestamp, strict disabled states)', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('scanner-edit-name-btn');
    expect(scannerManagerContent).toContain('edit-scanner-name-input');
    expect(scannerManagerContent).toContain('save-scanner-name-submit-btn');
    expect(scannerManagerContent).toContain('PATCH');
    expect(scannerManagerContent).not.toContain('className="scanner-avatar"');
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);

    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-card-title-row');
    expect(cssContent).toContain('.scanner-edit-name-btn');
    expect(cssContent).toContain('.scanner-action-btn:disabled');
  });

  it('implements D-95: uniform 4-button fixed right toolbar and edit name popup modal', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('btn-edit-name');
    expect(scannerManagerContent).toContain('is-active-primary');
    expect(scannerManagerContent).toContain('edit-scanner-modal-title');
    expect(scannerManagerContent).toContain('save-scanner-name-submit-btn');
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);

    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-action-btn.btn-edit-name');
    expect(cssContent).toContain('.scanner-action-btn.btn-handover.is-active-primary');
  });

  it('implements D-96: centered backdrop-blur edit scanner name modal and refined monochrome toolbar', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('D-96: Edit Scanner Name Modal (Centered Backdrop Blur Modal)');
    expect(scannerManagerContent).toContain('className="modal-backdrop"');
    expect(scannerManagerContent).toContain("style={{ maxWidth: '460px', padding: '1.75rem' }}");
    expect(scannerManagerContent).toContain('id="edit-scanner-modal-title"');
    expect(scannerManagerContent).toContain('save-scanner-name-submit-btn');
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);

    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-zone-actions');
    expect(cssContent).toContain('gap: 0.6rem');
    expect(cssContent).toContain('height: 36px');
    expect(cssContent).toContain('transition: all 0.18s cubic-bezier');
  });

  it('implements D-97: unified control bar for scanner management (concert selector + add scanner + emergency halt)', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    expect(scannerManagerContent).toContain('scanner-unified-control-bar');
    expect(scannerManagerContent).toContain('scanner-control-selector-group');
    expect(scannerManagerContent).toContain('scanner-control-actions-toolbar');
    expect(scannerManagerContent).toContain('id="select-scanner-event"');
    expect(scannerManagerContent).toContain('btn-add-scanner');
    expect(scannerManagerContent).toContain('id="emergency-stop-offline-btn"');
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);

    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-unified-control-bar');
    expect(cssContent).toContain('.scanner-control-btn.btn-add-scanner');
    expect(cssContent).toContain('.scanner-control-btn.btn-emergency-halt');
  });

  it('implements D-98: unified control bar horizontal baseline alignment (align-items: flex-end and uniform 42px height)', () => {
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-unified-control-bar');
    expect(cssContent).toContain('align-items: flex-end');
    expect(cssContent).toContain('height: 42px');
  });

  it('implements D-99: searchable and filterable concert combobox popover with zero emojis and E2E native select synchronization', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    // Combobox trigger and E2E synchronization
    expect(scannerManagerContent).toContain('id="scanner-event-combobox-btn"');
    expect(scannerManagerContent).toContain('scanner-event-combobox-trigger');
    expect(scannerManagerContent).toContain('scanner-control-select-native-sync');
    expect(scannerManagerContent).toContain('id="select-scanner-event"');

    // Popover components
    expect(scannerManagerContent).toContain('scanner-event-popover');
    expect(scannerManagerContent).toContain('scanner-popover-search-input');
    expect(scannerManagerContent).toContain('scanner-popover-status-nav');
    expect(scannerManagerContent).toContain('popover-tab-count');
    expect(scannerManagerContent).toContain('scanner-popover-list');

    // Zero emojis check
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);

    // CSS check
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-event-combobox-trigger');
    expect(cssContent).toContain('.scanner-control-select-native-sync');
    expect(cssContent).toContain('.scanner-event-popover');
    expect(cssContent).toContain('.scanner-popover-search-input');
    expect(cssContent).toContain('.scanner-popover-status-nav');
  });

  it('implements D-100: removes legacy bottom account creation card and consolidates to name-only Quick Add Modal', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    // Legacy bottom card should be completely removed from UI layout
    expect(scannerManagerContent).not.toContain('scanner-create-layout');
    expect(scannerManagerContent).not.toContain('modern-create-card');
    expect(scannerManagerContent).not.toContain('<span>สร้างบัญชี</span>');

    // Consolidated Quick Add button & modal
    expect(scannerManagerContent).toContain('btn-add-scanner');
    expect(scannerManagerContent).toContain('modal-scanner-name');
    expect(scannerManagerContent).toContain('modal-submit-scanner-btn');
    expect(scannerManagerContent).toContain('สร้างและรับ QR Code');

    // Backward compatibility hidden sync form
    expect(scannerManagerContent).toContain('legacy-scanner-sync-form');
    expect(scannerManagerContent).toContain('scanner-control-form-native-sync');

    // Zero emojis check
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);

    // CSS check
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-control-form-native-sync');
  });

  it('implements D-101: automatic organizer primary scanner, max 3 additional staff quota, and strict organizer primary binding', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    // Organizer primary device row & quota
    expect(scannerManagerContent).toContain('เครื่องหลักของผู้จัด (Organizer Primary Device)');
    expect(scannerManagerContent).toContain('MAX_ADDITIONAL_SCANNERS = 3');
    expect(scannerManagerContent).toContain('additionalScanners');
    expect(scannerManagerContent).toContain('scanner-handover-test-compat');
    expect(scannerManagerContent).toContain('เครื่องหลักของผู้จัดไม่สามารถนำออกได้');

    // Zero emojis check
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);

    // CSS check
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-handover-test-compat');
  });

  it('implements D-102: dedicated organizer primary card, separate additional staff section, and removal of search and status filters', () => {
    const scannerManagerContent = readFileSync(
      join(rootDir, 'src/components/organizer-scanner-manager.tsx'),
      'utf8',
    );
    // Dedicated Primary Card
    expect(scannerManagerContent).toContain('scanner-primary-dedicated-card');
    expect(scannerManagerContent).toContain('เครื่องสแกนหลักของผู้จัด (โหมดออฟไลน์)');
    expect(scannerManagerContent).toContain(
      'เครื่องหลักประจำงาน มีสิทธิ์ดาวน์โหลดชุดข้อมูลและสแกนบัตรในโหมดออฟไลน์ (Offline-Ready) ได้ทันที ผูกกับบัญชีผู้จัดงาน',
    );
    expect(scannerManagerContent).toContain('btn-open-terminal-primary');
    expect(scannerManagerContent).toContain('เปิด Terminal สแกน');
    expect(scannerManagerContent).toContain('primary-device-info-bar');

    // Additional Scanners Section
    expect(scannerManagerContent).toContain('scanner-additional-section');
    expect(scannerManagerContent).toContain('เจ้าหน้าที่สแกนบัตรเพิ่มเติม (โหมดออนไลน์)');
    expect(scannerManagerContent).toContain('โควตาทีมเสริม: {additionalScanners.length}/{MAX_ADDITIONAL_SCANNERS} คน');
    expect(scannerManagerContent).toContain(
      'ทีมงานสแกนบัตรหน้าประตู ทำงานผ่านระบบออนไลน์แบบ Real-time (จำกัดไม่เกิน 3 คน)',
    );
    expect(scannerManagerContent).toContain('ยังไม่มีเจ้าหน้าที่สแกนเสริมสำหรับงานนี้');

    // 3 Buttons on Additional Staff
    expect(scannerManagerContent).toContain('btn-qr-link');
    expect(scannerManagerContent).toContain('btn-edit-name');
    expect(scannerManagerContent).toContain('btn-remove');

    // Removed search and status tabs for scanner list
    expect(scannerManagerContent).not.toContain('className="scanner-status-nav"');
    expect(scannerManagerContent).not.toContain('searchScanner');
    expect(scannerManagerContent).not.toContain('scannerStatusFilter');

    // Zero emojis check
    expect(scannerManagerContent).not.toMatch(/\p{Extended_Pictographic}/u);

    // CSS checks
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.scanner-primary-dedicated-card');
    expect(cssContent).toContain('.primary-card-top-row');
    expect(cssContent).toContain('.primary-card-heading');
    expect(cssContent).toContain('.primary-card-caption');
    expect(cssContent).toContain('.primary-device-info-bar');
    expect(cssContent).toContain('.btn-open-terminal-primary');
    expect(cssContent).toContain('.scanner-additional-section');
    expect(cssContent).toContain('.scanner-additional-heading');
  });
});
