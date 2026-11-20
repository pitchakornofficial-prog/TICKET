import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTicketQrMatrix, generateCustomQrSvg } from '../../src/lib/ticket-qr';

describe('Admin Concert Ticket Designer & Background Testing Studio', () => {
  const rootDir = process.cwd();

  it('verifies ticket-qr generator creates valid matrix and SVG data URLs', () => {
    const payload = 'TK-849201-9482-01';
    const matrix = createTicketQrMatrix(payload);
    expect(matrix.length).toBeGreaterThan(0);
    expect(matrix[0].length).toBe(matrix.length);

    // Custom SVG output
    const svgDataUrl = generateCustomQrSvg(payload, {
      fgColor: '#0f172a',
      bgColor: '#ffffff',
      moduleSize: 8,
      quietZone: 2,
    });
    expect(svgDataUrl).toContain('data:image/svg+xml;utf8');
    expect(svgDataUrl).toContain('%3Cpath');
    expect(svgDataUrl).toContain('0f172a');
  });

  it('verifies AdminTicketDesigner component structure, presets, and controls', () => {
    const designerSrc = readFileSync(
      join(rootDir, 'src/components/admin-ticket-designer.tsx'),
      'utf8',
    );

    // D-14 zero emojis check
    expect(designerSrc).not.toMatch(/\p{Extended_Pictographic}/u);

    // Realistic physical concert ticket presets (Zero neon/AI fantasy styles)
    expect(designerSrc).toContain('classic-white');
    expect(designerSrc).toContain('matte-black');
    expect(designerSrc).toContain('vip-gold-pass');
    expect(designerSrc).toContain('festival-kraft');
    expect(designerSrc).toContain('minimal-slate');
    expect(designerSrc).not.toContain('neon-festival');

    // D-275 Free drag-and-drop & canonical layout controls
    expect(designerSrc).toContain('fullscreen-ticket-studio');
    expect(designerSrc).toContain('ticket-surface-box');
    expect(designerSrc).toContain('canvas-zoom-container');
    expect(designerSrc).toContain('canvas-scale-dock');
    expect(designerSrc).toContain('zoomMode');
    expect(designerSrc).toContain('movable-item');
    expect(designerSrc).toContain('handlePointerDown');
    expect(designerSrc).toContain('handlePointerMove');
    expect(designerSrc).toContain('coord-chip');
    expect(designerSrc).toContain('tearLineX');
    expect(designerSrc).toContain('tearLineStyle');

    // Background testing modes
    expect(designerSrc).toContain('bgType');
    expect(designerSrc).toContain('gradient');
    expect(designerSrc).toContain('pattern');
    expect(designerSrc).toContain('bgImageUrl');
    expect(designerSrc).toContain('bgOverlayDarkness');
    expect(designerSrc).toContain('bgOverlayBlur');

    // Typography and contextual inspector controls
    expect(designerSrc).toContain('fontFamily');
    expect(designerSrc).toContain('itemFontSize');
    expect(designerSrc).toContain('itemColor');
    expect(designerSrc).toContain('inspector-card');

    // QR Code controls
    expect(designerSrc).toContain('qrSize');
    expect(designerSrc).toContain('qrFgColor');
    expect(designerSrc).toContain('qrBgColor');
    expect(designerSrc).toContain('qrPayload');

    // Anatomical Concert Ticket Sections (Gate, Seat, Price, Barcode, Stub Summary)
    expect(designerSrc).toContain('gateInfo');
    expect(designerSrc).toContain('seatInfo');
    expect(designerSrc).toContain('priceInfo');
    expect(designerSrc).toContain('barcode');
    expect(designerSrc).toContain('stubEventSummary');
    expect(designerSrc).toContain('SecurityBarcodeSvg');
    expect(designerSrc).toContain('SECTIONS_DIRECTORY');

    // Master Ticket Template System & Multi-Mode Previews
    expect(designerSrc).toContain('MASTER_TEMPLATE_STORAGE_KEY');
    expect(designerSrc).toContain('ticket_master_template_v1');
    expect(designerSrc).toContain('handleSaveMasterTemplate');
    expect(designerSrc).toContain('handleLoadMasterTemplate');
    expect(designerSrc).toContain('viewMode');

    // Export functionality
    expect(designerSrc).toContain('handleExportPng');
    expect(designerSrc).toContain('toDataURL');

    // Workspace Stage Environment Customizer (ฉากหลังโต๊ะทำงานรอบบัตร ไม่ใช่พื้นหลังบัตร)
    expect(designerSrc).toContain('workspaceStage');
    expect(designerSrc).toContain('DEFAULT_WORKSPACE_STAGE');
    expect(designerSrc).toContain('stage-style-card');
    expect(designerSrc).toContain('customStageColor');

    // Ticket Card Test Image File Upload & Dropzone
    expect(designerSrc).toContain('handleTicketImageUpload');
    expect(designerSrc).toContain('ticket-upload-dropzone');
    expect(designerSrc).toContain('ticket-upload-thumbnail');
    expect(designerSrc).toContain('handleClearCardImage');

    // 5 Redesigned Menu Tabs
    expect(designerSrc).toContain("activeSideTab === 'elements'");
    expect(designerSrc).toContain("activeSideTab === 'cardBg'");
    expect(designerSrc).toContain("activeSideTab === 'stageBg'");
    expect(designerSrc).toContain("activeSideTab === 'tearLine'");
    expect(designerSrc).toContain("activeSideTab === 'allElements'");

    // Non-Solid Button Architecture
    expect(designerSrc).toContain('studio-btn save-master');
    expect(designerSrc).toContain('studio-preset-pill');
    expect(designerSrc).toContain('studio-view-mode-btn');

    // Element Visibility & Hide Controls (สำหรับส่วนที่ไม่ต้องการใช้บนบัตร)
    expect(designerSrc).toContain('hide-element-action-btn');
    expect(designerSrc).toContain('section-quick-item-pill-group');
    expect(designerSrc).toContain('quick-item-eye-btn');
    expect(designerSrc).toContain('layers-batch-actions');
    expect(designerSrc).toContain('layers-preset-btn');

    // Subtitle Color & Transparent Background/Border Customization
    expect(designerSrc).toContain('secondaryColor');
    expect(designerSrc).toContain('itemSecondaryColor');
    expect(designerSrc).toContain('transparent-swatch');
    expect(designerSrc).toContain('itemBorderColor');
    expect(designerSrc).toContain('getElementBoxStyle');
  });

  it('verifies ticket designer page route exists under back-office and expands to 1920 full screen', () => {
    const pageSrc = readFileSync(
      join(rootDir, 'src/app/back-office/ticket-designer/page.tsx'),
      'utf8',
    );
    expect(pageSrc).toContain('AdminTicketDesigner');
    expect(pageSrc).toContain('admin-topbar');
    expect(pageSrc).toContain('ticket-designer-1920-root');
    expect(pageSrc).toContain('1920px');
    expect(pageSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies OwnerWorkspaceView integration with ticket-designer section', () => {
    const workspaceSrc = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceSrc).toContain('ticket-designer');
    expect(workspaceSrc).toContain('AdminTicketDesigner');
    expect(workspaceSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies non-solid button CSS rules and universal back-office button exclusion', () => {
    const cssSrc = readFileSync(
      join(rootDir, 'src/app/back-office/back-office.css'),
      'utf8',
    );
    expect(cssSrc).toContain(':not(.fullscreen-ticket-studio *)');
    expect(cssSrc).toContain('.fullscreen-ticket-studio .studio-btn');
    expect(cssSrc).toContain('.fullscreen-ticket-studio .studio-preset-pill');
    expect(cssSrc).toContain('.fullscreen-ticket-studio .studio-view-mode-btn');
    expect(cssSrc).toContain('.fullscreen-ticket-studio .side-tab-btn');
    expect(cssSrc).toContain('.fullscreen-ticket-studio .section-quick-item-btn');
    expect(cssSrc).toContain('.fullscreen-ticket-studio .stage-backdrop-clickarea');
  });
});
