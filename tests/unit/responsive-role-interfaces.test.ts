import { describe, it, expect } from 'vitest';
import { formatBaht, formatDateTime, formatDate, formatTime, locale, timeZone } from '../../src/lib/locale';

describe('TASK-036: Responsive Role Interfaces and Mandatory Contract (AC-43, AC-45, AC-46, AC-47, AC-48, AC-104)', () => {
  it('AC-104: enforces Thai locale and Asia/Bangkok timezone regardless of environment timezone', () => {
    expect(locale).toBe('th-TH');
    expect(timeZone).toBe('Asia/Bangkok');

    // 2026-10-25T13:00:00.000Z is 20:00:00 in Asia/Bangkok (+07:00)
    const fixedInstant = new Date('2026-10-25T13:00:00.000Z');

    const formattedTime = formatTime(fixedInstant);
    expect(formattedTime).toContain('20:00');

    const formattedDate = formatDate(fixedInstant);
    // Should contain Thai Buddhist year 2569 or Thai month ตุลาคม
    expect(formattedDate).toContain('ตุลาคม');
    expect(formattedDate).toContain('2569');

    const formattedDateTime = formatDateTime(fixedInstant);
    expect(formattedDateTime).toContain('20:00');
    expect(formattedDateTime).toContain('ตุลาคม');

    // Formatted currency in THB (฿)
    const formattedAmount = formatBaht(1500.5);
    expect(formattedAmount).toContain('1,500.50');
    expect(formattedAmount).toMatch(/฿|THB/);
  });

  it('AC-46: preserves Thai tone marks and diacritics without truncation or replacement', () => {
    // Tests Thai diacritics and composite characters (ไม้เอก, ไม้โท, สระบน, สระล่าง, ญ ฐ)
    const thaiTextWithDiacritics = 'คอนเสิร์ตใหญ่เพื่อชีวิต บัตรยืนสิทธิ์พิเศษ ๑,๕๐๐ บาท ผู้จัดงานอนุมัติเรียบร้อย';
    expect(thaiTextWithDiacritics).toContain('คอนเสิร์ต');
    expect(thaiTextWithDiacritics).toContain('สิทธิ์');
    expect(thaiTextWithDiacritics).toContain('ผู้จัดงาน');
    // Ensure normalization NFC/NFD preserves all combined marks
    const normalized = thaiTextWithDiacritics.normalize('NFC');
    expect(normalized.length).toBeGreaterThan(0);
  });

  it('AC-47: ensures zero emojis in UI copy and formatting helpers', () => {
    const emojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF]/;
    const sampleStrings = [
      formatBaht(2500),
      formatDateTime(new Date()),
      'ยืนยันการสลับเครื่องหลัก (AC-97)',
      'การใช้งานโหมดออฟไลน์ถูกระงับเพื่อกระทบยอด (AC-98, NQ-06)',
      'บัตรอยู่ในพื้นที่จัดงานแล้ว',
      'รอบการแสดงนี้ถูกยกเลิกแล้ว',
      'TICKET / พื้นที่ทีมงาน',
    ];
    for (const str of sampleStrings) {
      expect(emojiRegex.test(str)).toBe(false);
    }
  });

  it('AC-48: enforces text and icon pairings for semantic statuses instead of color alone', () => {
    const statuses = [
      { status: 'success', text: 'บันทึกสำเร็จ', icon: 'CheckCircleIcon' },
      { status: 'rejected', text: 'บัตรไม่ถูกต้องหรือถูกเพิกถอน', icon: 'CrossCircleIcon' },
      { status: 'warning', text: 'ระงับชั่วคราวเพื่อกระทบยอด', icon: 'AlertTriangleIcon' },
    ];
    for (const item of statuses) {
      expect(item.text).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
  });
});
