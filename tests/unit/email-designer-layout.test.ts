import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-284 Email Designer Popup-First Architecture & V2 Redesign', () => {
  const rootDir = process.cwd();
  const ownerWorkspaceView = readFileSync(join(rootDir, 'src/components/owner-workspace-view.tsx'), 'utf8');
  const adminEmailDesigner = readFileSync(join(rootDir, 'src/components/admin-email-designer.tsx'), 'utf8');
  const backOfficeCss = readFileSync(join(rootDir, 'src/app/back-office/back-office.css'), 'utf8');
  const emailTemplateLib = readFileSync(join(rootDir, 'src/lib/email-template.ts'), 'utf8');
  const requirementDoc = readFileSync(join(rootDir, 'docs/requirement.md'), 'utf8');

  it('hides .owner-section-header card for email-designer to remove duplicate top card', () => {
    expect(ownerWorkspaceView).toContain("activeSection === 'email-designer'");
    expect(ownerWorkspaceView).toMatch(/activeSection === 'email-designer'\s*\?\s*\{\s*display:\s*'none'\s*\}/);
  });

  it('renders AdminEmailDesigner wrapped in .email-designer-container without restrictive minHeight inline styles', () => {
    expect(ownerWorkspaceView).toContain('<div className="email-designer-container">');
    expect(ownerWorkspaceView).toContain('<AdminEmailDesigner />');
    expect(ownerWorkspaceView).not.toContain("minHeight: '800px'");
  });

  it('excludes .email-designer-container from floating card box and includes it in flat canvas hubs', () => {
    expect(backOfficeCss).toContain(':not(.email-designer-container)');
    expect(backOfficeCss).toContain('.owner-section-body > div.email-designer-container');
    expect(backOfficeCss).toContain('.email-designer-container');
    expect(backOfficeCss).toContain('.email-overview-card');
  });

  it('enforces D-282 standard 38px button height and removes duplicate action buttons', () => {
    // 38px button height enforcement in CSS
    expect(backOfficeCss).toContain('height: 38px;');
    expect(backOfficeCss).toContain('min-height: 38px;');
    expect(backOfficeCss).toContain('border-radius: 8px;');

    // Single source action bar in top hub
    expect(adminEmailDesigner).toContain('className="hub-top-bar"');
    expect(adminEmailDesigner).toContain('className="hub-toolbar-tools-right"');

    // Overview header has zero duplicate action buttons
    const overviewCardHeaderMatch = adminEmailDesigner.match(/<div className="email-overview-header"[^>]*>([\s\S]*?)<\/div>/);
    expect(overviewCardHeaderMatch).not.toBeNull();
    const overviewHeaderContent = overviewCardHeaderMatch ? overviewCardHeaderMatch[1] : '';
    expect(overviewHeaderContent).not.toContain('ดูตัวอย่าง');
    expect(overviewHeaderContent).not.toContain('แก้ไขเทมเพลต');
  });

  it('implements User-Driven Template CRUD toolbar and grounded tabs', () => {
    expect(adminEmailDesigner).toContain('email-preset-dropdown');
    expect(adminEmailDesigner).toContain('เพิ่มเทมเพลต');
    expect(adminEmailDesigner).toContain('แก้ไขชื่อ');
    expect(adminEmailDesigner).toContain('handleDeleteActiveTemplate');
    expect(adminEmailDesigner).toContain('currentScenarioPresets');
    expect(adminEmailDesigner).toContain('currentActivePresetId');
    expect(adminEmailDesigner).toContain('hub-filter-tabs-bar');
    expect(adminEmailDesigner).toContain('hub-filter-tab');
    expect(adminEmailDesigner).toContain('รายละเอียดการตั้งค่าเทมเพลต');
    expect(adminEmailDesigner).toContain('ตัวอย่างการแสดงผลอีเมลจริง');
    expect(emailTemplateLib).toContain('INITIAL_EMAIL_PRESETS');
    expect(emailTemplateLib).toContain('getDefaultScenarioPresets');
    expect(emailTemplateLib).toContain('parseEmailMasterPayload');
  });

  it('uses real .direct-modal-backdrop and .direct-modal-card popups with 2-column split live editor and free section reordering', () => {
    expect(adminEmailDesigner).toContain('direct-modal-backdrop');
    expect(adminEmailDesigner).toContain('direct-modal-card');
    expect(adminEmailDesigner).toContain('email-split-modal-card');
    expect(adminEmailDesigner).toContain('email-split-modal-body');
    expect(adminEmailDesigner).toContain('handleMoveSection');
    expect(adminEmailDesigner).toContain('sectionOrder');
    expect(adminEmailDesigner).toContain('email-reorder-list');
    expect(adminEmailDesigner).toContain('email-reorder-btn');
    expect(adminEmailDesigner).not.toContain('email-designer-modal-overlay');

    expect(adminEmailDesigner).toContain('1. ข้อมูลเทมเพลต &amp; หัวเรื่อง');
    expect(adminEmailDesigner).toContain('2. รูปภาพ บัตรจริง &amp; ย้ายลำดับ');
    expect(adminEmailDesigner).toContain('3. เนื้อหา &amp; ตัวแปร');
    expect(adminEmailDesigner).toContain('4. สไตล์ปุ่มดำเนินการ');
  });

  it('uses docked preview header bar with outline mode buttons excluded from universal dark button rule', () => {
    expect(adminEmailDesigner).toContain('email-preview-shell');
    expect(adminEmailDesigner).toContain('email-preview-docked-header');
    expect(adminEmailDesigner).toContain('email-preview-mode-btn');

    expect(backOfficeCss).toContain(':not(.email-preview-mode-btn)');
    expect(backOfficeCss).toContain(':not(.email-modal-tab-btn)');
    expect(backOfficeCss).toContain(':not(.email-variable-chip-btn)');
    expect(backOfficeCss).toContain(':not(.email-reorder-btn)');
    expect(backOfficeCss).toContain(':not(.email-modal-close-btn)');

    const modeBtnActiveMatch = backOfficeCss.match(/\.email-preview-mode-btn\.active\s*\{([^}]*)\}/);
    expect(modeBtnActiveMatch).not.toBeNull();
    expect(modeBtnActiveMatch?.[1] ?? '').not.toContain('background: #0f172a');
  });

  it('removes payment slip feature completely and renders edge-to-edge full-height poster and real ticket pass', () => {
    expect(adminEmailDesigner).not.toContain('showPaymentSlip');
    expect(adminEmailDesigner).not.toContain('slipStyle');
    expect(adminEmailDesigner).not.toContain('generateBankSlipSvgDataUrl');
    expect(emailTemplateLib).not.toContain('showPaymentSlip');
    expect(emailTemplateLib).not.toContain('slipStyle');
    expect(emailTemplateLib).toContain('normalizeEmailSectionOrder');

    expect(adminEmailDesigner).toContain('showConcertPoster');
    expect(adminEmailDesigner).toContain("height: '220px'");
    expect(adminEmailDesigner).toContain("objectFit: 'cover'");
    expect(adminEmailDesigner).toContain('showTicketCard');
    expect(adminEmailDesigner).toContain('generateTicketDataUrl');
    expect(adminEmailDesigner).not.toContain('#1848ed');
    expect(emailTemplateLib).toContain("primaryButtonColor: '#0f172a'");
    expect(emailTemplateLib).not.toContain("primaryButtonColor: '#1848ed'");
  });

  it('renders email header bar with pure white background (#ffffff) and dark text (#0f172a)', () => {
    // Both preview card and delivery template have pure white header
    const ticketDelivery = readFileSync(join(rootDir, 'src/server/ticket-delivery.ts'), 'utf8');
    expect(adminEmailDesigner).toContain("background: '#ffffff'");
    expect(adminEmailDesigner).toContain("color: '#0f172a'");
    expect(adminEmailDesigner).toContain("borderBottom: '1px solid #e2e8f0'");
    expect(ticketDelivery).toContain('background-color: #ffffff; color: #0f172a; padding: 20px 24px; border-bottom: 1px solid #e2e8f0;');
  });

  it("cuts out secondary button completely in favor of single primary CTA", () => {
    expect(emailTemplateLib).toContain('showSecondaryButton: false');
    expect(adminEmailDesigner).not.toContain('showSecondaryButton: e.target.checked');
    expect(adminEmailDesigner).toContain('Single CTA Mode: Secondary button removed');
  });

  it('renders pure ticket pass image without container wrapper, label text, or disclaimer caption', () => {
    // Ticket pass is rendered purely without container box or extra labels
    expect(adminEmailDesigner).not.toContain('รูปบัตรคอนเสิร์ตสำหรับเข้างาน (Ticket Pass Image)');
    expect(adminEmailDesigner).not.toContain('* ภาพบัตรคอนเสิร์ตจริงของลูกค้าพร้อมบาร์โค้ด');
    expect(adminEmailDesigner).toContain('alt="รูปบัตรคอนเสิร์ตจริงของลูกค้า"');
  });

  it('supports multi-ticket rendering and quota guard (> 20 tickets) with 100% table replacement', () => {
    const ticketDelivery = readFileSync(join(rootDir, 'src/server/ticket-delivery.ts'), 'utf8');
    expect(adminEmailDesigner).toContain('previewTicketCount');
    expect(adminEmailDesigner).toContain('SAMPLE_BATCH_25_TICKETS');
    expect(adminEmailDesigner).toContain('เกินโควตา (25 ใบ)');
    expect(adminEmailDesigner).toContain('คำสั่งซื้อนี้มีบัตรทั้งหมด 25 ใบ (เกินโควตาการแสดงผลรูปบัตรในอีเมล 20 ใบ)');
    expect(adminEmailDesigner).toContain('Quota Alert Box - Pure Table Replacement Mode');

    expect(ticketDelivery).toContain('const isLargeBatch = tickets.length > 20;');
    expect(ticketDelivery).toContain('const ticketsHtml = isLargeBatch');
    expect(ticketDelivery).toContain('? \'\'');
    expect(ticketDelivery).toContain('quotaAlertHtml');
    expect(ticketDelivery).toContain('เกินโควตาการแสดงผลรูปบัตรในอีเมล 20 ใบ');
  });

  it('documents D-284 in docs/requirement.md', () => {
    expect(requirementDoc).toContain('D-284');
  });
});
