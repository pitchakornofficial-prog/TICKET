import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('D-199: Organizer Concert Creator Refinements, Card Actions, and Cancellation Modernization', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const eventsManagerPath = path.join(rootDir, 'src/components/organizer-events-manager.tsx');
  const globalsCssPath = path.join(rootDir, 'src/app/globals.css');
  const requirementPath = path.join(rootDir, 'docs/requirement.md');
  const serverEventsPath = path.join(rootDir, 'src/server/events.ts');
  const eventRoutePath = path.join(rootDir, 'src/app/api/events/[id]/route.ts');

  const eventsManagerContent = fs.readFileSync(eventsManagerPath, 'utf8');
  const globalsCssContent = (`${fs.readFileSync(globalsCssPath, 'utf8')}\n${fs.readFileSync(globalsCssPath.replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
  const requirementContent = fs.readFileSync(requirementPath, 'utf8');
  const serverEventsContent = fs.readFileSync(serverEventsPath, 'utf8');
  const eventRouteContent = fs.readFileSync(eventRoutePath, 'utf8');

  it('1. Item 1: Adds tooltip "i" to input field labels across wizard steps', () => {
    // Step 1
    expect(eventsManagerContent).toContain('ชื่องานคอนเสิร์ต *');
    expect(eventsManagerContent).toContain('<HeaderInfoTooltip text="ระบุชื่อคอนเสิร์ตหรือชื่องานแสดงอย่างเป็นทางการ');
    expect(eventsManagerContent).toContain('ศิลปินผู้ร่วมสร้างสรรค์ / ไลน์อัปการแสดง');
    expect(eventsManagerContent).toContain('<HeaderInfoTooltip text="ระบุรายชื่อศิลปินหรือวงดนตรี');
    expect(eventsManagerContent).toContain('เกี่ยวกับคอนเสิร์ตนี้ / รายละเอียดและจุดเด่น');
    expect(eventsManagerContent).toContain('<HeaderInfoTooltip text="ระบุคำอธิบาย ไฮไลต์การแสดง');

    // Step 2
    expect(eventsManagerContent).toContain('สถานที่จัดงาน *');
    expect(eventsManagerContent).toContain('<HeaderInfoTooltip text="ระบุชื่อฮอลล์ อารีน่า หรือสถานที่จัดงานจริง');

    // Step 3
    expect(eventsManagerContent).toContain('วันและเวลาเริ่มต้นเปิดขายบัตร');
    expect(eventsManagerContent).toContain('<HeaderInfoTooltip text="กำหนดเวลาเริ่มจำหน่าย');
    expect(eventsManagerContent).toContain('จำกัดการซื้อสูงสุดต่อคำสั่งซื้อ *');
    expect(eventsManagerContent).toContain('<HeaderInfoTooltip text="เลือกจำนวนบัตรสูงสุดที่ผู้ซื้อสามารถทำรายการได้ใน 1 คำสั่งซื้อ');

    // Step 4
    expect(eventsManagerContent).toContain('วันเวลาเริ่มการแสดง (Show Start) *');
    expect(eventsManagerContent).toContain('วันเวลาสิ้นสุดการแสดง (Show End) *');
    expect(eventsManagerContent).toContain('เวลาประตูเปิด / รับเข้างาน (Doors Open)');
  });

  it('2. Item 2 & 10: Cancel button styling has proper border, padding, and high contrast', () => {
    expect(globalsCssContent).toContain('.events-editor-modal-card .btn-form-cancel');
    expect(globalsCssContent).toContain('border: 1px solid #cbd5e1');
    expect(globalsCssContent).toContain('background: #ffffff');
    expect(globalsCssContent).toContain('color: #334155');
  });

  it('3. Item 3: Removes Preview and Submit Approval buttons from modal header', () => {
    // The modal top actions toolbar should only contain cancel, back, next, and save draft
    expect(eventsManagerContent).not.toContain('data-testid="preview-concert-btn"');
    expect(eventsManagerContent).not.toContain('data-testid="submit-approval-btn"');
    expect(eventsManagerContent).toContain('data-testid="save-draft-btn"');
  });

  it('4. Item 4: Two-segment tabs for custom purchase limit (1-10) vs unlimited', () => {
    expect(eventsManagerContent).toContain('limit-mode-tabs');
    expect(eventsManagerContent).toContain('limit-mode-tab-btn');
    expect(eventsManagerContent).toContain('data-testid="limit-mode-custom-btn"');
    expect(eventsManagerContent).toContain('data-testid="limit-pill-unlimited"');
    expect(eventsManagerContent).toContain('ระบุจำนวนเอง (1-10 ใบ)');
    expect(eventsManagerContent).toContain('ไม่จำกัดจำนวน');
    expect(eventsManagerContent).toContain('setLimitPerOrder(99)');
    expect(globalsCssContent).toContain('.limit-mode-tabs');
  });

  it('5. Item 5: Swaps Step 4 (Sessions & Zones) and Step 5 (Images & Media)', () => {
    expect(eventsManagerContent).toContain('4. รอบ & โซนบัตร');
    expect(eventsManagerContent).toContain('5. รูปภาพ & สื่อ');

    // Verify STEP 4 renders sessions and STEP 5 renders images
    const step4Index = eventsManagerContent.indexOf('{/* STEP 4: รอบการแสดง & โซนบัตร');
    const step5Index = eventsManagerContent.indexOf('{/* STEP 5: รูปภาพ & สื่อประชาสัมพันธ์');
    expect(step4Index).toBeGreaterThan(0);
    expect(step5Index).toBeGreaterThan(step4Index);

    const step4Snippet = eventsManagerContent.slice(step4Index, step5Index);
    expect(step4Snippet).toContain('กำหนดรอบการแสดงและประเภทบัตร');
    expect(step4Snippet).toContain('session-accordion-card');

    const step5Snippet = eventsManagerContent.slice(step5Index);
    expect(step5Snippet).toContain('compact-image-grid');
  });

  it('6. Item 6: Step 5 uses compact thumbnail image cards (~110px preview)', () => {
    expect(eventsManagerContent).toContain('compact-image-grid');
    expect(eventsManagerContent).toContain('compact-image-card');
    expect(eventsManagerContent).toContain('compact-image-preview-box');
    expect(eventsManagerContent).toContain('compact-image-thumb');
    expect(globalsCssContent).toContain('.compact-image-grid');
    expect(globalsCssContent).toContain('.compact-image-card');
    expect(globalsCssContent).toContain('.compact-image-preview-box');
  });

  it('7. Item 7: Removed optional banner text from images step', () => {
    expect(eventsManagerContent).not.toContain('คุณสามารถเพิ่มรูปภาพหรือไม่ใส่ก็ได้ หากยังไม่มีรูป ระบบจะใช้กราฟิกจำลองมาตรฐานที่สวยงามให้อัตโนมัติ');
  });

  it('8. Item 8: Collapsible accordion cards for concert sessions with summary header', () => {
    expect(eventsManagerContent).toContain('session-accordion-card');
    expect(eventsManagerContent).toContain('session-accordion-header');
    expect(eventsManagerContent).toContain('session-accordion-body');
    expect(eventsManagerContent).toContain('toggleSessionExpand');
    expect(eventsManagerContent).toContain('toggle-session-expand-');
    expect(globalsCssContent).toContain('.session-accordion-card');
    expect(globalsCssContent).toContain('.session-accordion-header');
    expect(globalsCssContent).toContain('.session-accordion-body');
  });

  it('9. Item 9: Removes duplicate "+" from add session button', () => {
    expect(eventsManagerContent).not.toContain('+ เพิ่มรอบการแสดงใหม่');
    expect(eventsManagerContent).toContain('<span>เพิ่มรอบการแสดงใหม่</span>');
  });

  it('10. Item 11: Draft card has edit draft and submit approval; hides storefront, finance, and preview (D-200)', () => {
    expect(eventsManagerContent).not.toMatch(/data-testid=\{`preview-draft-btn-\$\{ev\.id\}`\}/);
    expect(eventsManagerContent).toMatch(/data-testid=\{`edit-draft-btn-\$\{ev\.id\}`\}/);
    expect(eventsManagerContent).toMatch(/data-testid=\{`submit-draft-btn-\$\{ev\.id\}`\}/);
    expect(eventsManagerContent).toContain('handleEditDraft');
  });

  it('11. Item 12: Cancellation modal has 4-bullet impact card without technical jargon', () => {
    expect(eventsManagerContent).toContain('cancellation-impact-card');
    expect(eventsManagerContent).toContain('cancellation-impact-title');
    expect(eventsManagerContent).toContain('cancellation-impact-list');
    expect(eventsManagerContent).toContain('ผลกระทบเมื่อคำขอยกเลิกรอบการแสดงได้รับการอนุมัติ:');
    expect(eventsManagerContent).toContain('ระบบจะหยุดการจำหน่ายบัตรของรอบการแสดงนี้โดยทันที');
    expect(eventsManagerContent).toContain('ส่งอีเมลแจ้งเตือนการยกเลิกให้แก่ลูกค้าผู้ซื้อบัตรทุกคนโดยอัตโนมัติ');
    expect(eventsManagerContent).toContain('ดำเนินการคืนเงินเต็มจำนวน (100%)');
    expect(eventsManagerContent).toContain('รอบการแสดงที่ถูกยกเลิกแล้วจะไม่สามารถเปิดจำหน่ายซ้ำได้อีก');
    expect(eventsManagerContent).not.toContain('(AC-35, AC-91, AC-108)');
    expect(eventsManagerContent).toContain('ยืนยันส่งคำขอยกเลิกรอบการแสดง');
  });

  it('12. Item 13: Submitting draft updates events.status to pending_approval', () => {
    expect(serverEventsContent).toContain("UPDATE events SET status = 'pending_approval'");
    expect(eventRouteContent).toContain("action === 'submit-event'");
    expect(eventsManagerContent).toMatch(/\/api\/events\/\$\{eventId\}\?action=submit-event/);
  });

  it('13. Item 14: Removes amendment button from approved concert cards', () => {
    // Approved card action snippet
    const approvedBlock = eventsManagerContent.slice(eventsManagerContent.indexOf("ev.status === 'approved'"));
    expect(approvedBlock).not.toContain('<span>ขอแก้ไขรอบ</span>');
    expect(approvedBlock).toContain('<span>หน้าร้านลูกค้า</span>');
    expect(approvedBlock).toContain('<span>รายงานการเงิน</span>');
    expect(approvedBlock).toContain('<span>ขอยกเลิก</span>');
  });

  it('14. D-199 decisions recorded in requirement.md', () => {
    expect(requirementContent).toContain('D-199');
    expect(requirementContent).toContain('Organizer Creator Refinements');
  });

  it('15. Zero Emojis (D-14) compliance across all touched files', () => {
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(eventsManagerContent)).toBe(false);
    expect(emojiRegex.test(globalsCssContent)).toBe(false);
    expect(emojiRegex.test(serverEventsContent)).toBe(false);
    expect(emojiRegex.test(eventRouteContent)).toBe(false);
    expect(emojiRegex.test(requirementContent)).toBe(false);
  });
});
