import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('D-198: Organizer Concert Creator Modernization, Borderless Tooltip, and WYSIWYG Live Preview', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const eventsManagerPath = path.join(rootDir, 'src/components/organizer-events-manager.tsx');
  const tooltipComponentPath = path.join(rootDir, 'src/components/header-info-tooltip.tsx');
  const globalsCssPath = path.join(rootDir, 'src/app/globals.css');
  const requirementPath = path.join(rootDir, 'docs/requirement.md');

  const eventsManagerContent = fs.readFileSync(eventsManagerPath, 'utf8');
  const tooltipComponentContent = fs.readFileSync(tooltipComponentPath, 'utf8');
  const globalsCssContent = fs.readFileSync(globalsCssPath, 'utf8');
  const requirementContent = fs.readFileSync(requirementPath, 'utf8');

  it('1. Item 1: Removed upcoming tab from organizer status filter tabs', () => {
    expect(eventsManagerContent).not.toContain('เร็ว ๆ นี้');
    expect(eventsManagerContent).toContain('ทั้งหมด ({events.length})');
    expect(eventsManagerContent).toContain('เปิดจำหน่ายแล้ว');
    expect(eventsManagerContent).toContain('รออนุมัติ');
    expect(eventsManagerContent).toContain('ฉบับร่าง');
  });

  it('2. Item 2: Circular "i" tooltip icon is borderless', () => {
    expect(globalsCssContent).toContain('.header-info-tooltip-btn');
    // Ensure border: none is applied to header-info-tooltip-btn
    expect(globalsCssContent).toMatch(/\.header-info-tooltip-btn\s*\{[^}]*border:\s*none/);
  });

  it('3. Item 3: Create concert modal title includes tooltip "i" and in-modal error/success banners', () => {
    // Tooltip next to modal title
    expect(eventsManagerContent).toContain('id="create-concert-title"');
    expect(eventsManagerContent).toContain('<HeaderInfoTooltip text="สร้างคอนเสิร์ตใหม่');

    // In-modal alert banners
    expect(eventsManagerContent).toContain('modalError &&');
    expect(eventsManagerContent).toContain('modalSuccess &&');
    expect(eventsManagerContent).toContain('className="modal-danger-banner"');
    expect(eventsManagerContent).toContain('className="modal-info-banner"');
  });

  it('4. Item 4: WYSIWYG live preview faithfully reproduces customer storefront view', () => {
    expect(eventsManagerContent).toContain('simulated-preview');
    expect(eventsManagerContent).toContain('event-cover-banner-wrapper');
    expect(eventsManagerContent).toContain('event-hero-card');
    expect(eventsManagerContent).toContain('hero-meta-cards-track');
    expect(eventsManagerContent).toContain('detail-with-poster-layout');
    expect(eventsManagerContent).toContain('artist-grid-2x2');
    expect(eventsManagerContent).toContain('event-sticky-bottom-bar');
    expect(eventsManagerContent).toContain('กลับไปแก้ไขข้อมูล');
  });

  it('5. Item 5: Closing or reopening modal resets form states completely', () => {
    expect(eventsManagerContent).toContain('handleCloseModal');
    expect(eventsManagerContent).toContain('setDraftSaved(false)');
    expect(eventsManagerContent).toContain('setWizardStep(1)');
    expect(eventsManagerContent).toContain('setModalError(\'\')');
    expect(eventsManagerContent).toContain('setModalSuccess(\'\')');
    expect(eventsManagerContent).toContain('setTitle(\'\')');
    expect(eventsManagerContent).toContain('setLocation(\'\')');
  });

  it('6. Item 6: Modal is reorganized into 5 distinct subcategories with map preview and test button (updated by D-199)', () => {
    expect(eventsManagerContent).toContain('1. ข้อมูลงาน & ศิลปิน');
    expect(eventsManagerContent).toContain('2. สถานที่ & แผนที่');
    expect(eventsManagerContent).toContain('3. กำหนดการ & กติกา');
    expect(eventsManagerContent).toContain('4. รอบ & โซนบัตร');
    expect(eventsManagerContent).toContain('5. รูปภาพ & สื่อ');

    // Map preview card and test pin button
    expect(eventsManagerContent).toContain('map-preview-card');
    expect(eventsManagerContent).toContain('ทดสอบเปิดดูพิกัดจริง &rarr;');
    expect(eventsManagerContent).toContain('data-testid="test-map-pin-btn"');
  });

  it('7. Item 7 & 13: Save draft and submit approval actions for drafts (evolved in D-199/D-200)', () => {
    expect(eventsManagerContent).toContain('data-testid="save-draft-btn"');
    expect(eventsManagerContent).toContain('submit-draft-btn');
    expect(eventsManagerContent).toContain('handleSubmitSessionForApproval');
  });

  it('8. Item 8 & 11: Modal header and actions are sticky at the top with consistent dimensions', () => {
    expect(globalsCssContent).toContain('.editor-modal-sticky-header');
    expect(globalsCssContent).toContain('.editor-modal-top-row');
    expect(globalsCssContent).toContain('.editor-modal-top-actions');
    expect(globalsCssContent).toContain('.editor-modal-body-scrollable');

    expect(globalsCssContent).toMatch(/\.editor-modal-sticky-header\s*\{[^}]*position:\s*sticky/);
    expect(globalsCssContent).toMatch(/\.events-editor-modal-card\s*\{[^}]*width:\s*880px/);
  });

  it('9. Item 9: Session cards have Move Up and Move Down reorder buttons', () => {
    expect(eventsManagerContent).toContain('handleMoveSession');
    expect(eventsManagerContent).toContain('session-reorder-btn');
    expect(eventsManagerContent).toMatch(/data-testid=\{`move-session-up-\$\{idx\}`\}/);
    expect(eventsManagerContent).toMatch(/data-testid=\{`move-session-down-\$\{idx\}`\}/);
    expect(eventsManagerContent).toContain('ChevronUpIcon');
    expect(eventsManagerContent).toContain('ChevronDownIcon');
  });

  it('10. Item 10: Order limit provides 1-10 plus unlimited option (evolved in D-200 to volume bar)', () => {
    expect(eventsManagerContent).toContain('volume-bar-stepper');
    expect(eventsManagerContent).toContain('volume-bar-track');
    expect(eventsManagerContent).toContain('data-testid="limit-pill-unlimited"');
    expect(eventsManagerContent).toContain('ไม่จำกัดจำนวน');
    expect(eventsManagerContent).toContain('setLimitPerOrder(99)');
  });

  it('11. Item 12: Cancel button styling is harmonized with other action buttons', () => {
    expect(eventsManagerContent).toContain('className="btn-form-cancel"');
    expect(globalsCssContent).toContain('.events-editor-modal-card .btn-form-cancel');
    expect(globalsCssContent).toContain('.btn-form-cancel');
  });

  it('12. D-198 requirements recorded in requirement.md', () => {
    expect(requirementContent).toContain('D-198');
    expect(requirementContent).toContain('Organizer Concert Creator Modernization');
  });

  it('13. Zero Emojis (D-14) compliance across all touched files', () => {
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(eventsManagerContent)).toBe(false);
    expect(emojiRegex.test(tooltipComponentContent)).toBe(false);
    expect(emojiRegex.test(globalsCssContent)).toBe(false);
    expect(emojiRegex.test(requirementContent)).toBe(false);
  });
});
