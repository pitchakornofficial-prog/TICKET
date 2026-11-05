import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-217 to D-220: Organizer & Admin Concert Governance, UBU Privilege, and Fee Transparency', () => {
  const rootDir = process.cwd();

  it('verifies D-217: UBU student privilege mode & 3% fee transparency card in organizer concert creator', () => {
    const managerSrc = readFileSync(
      join(rootDir, 'src/components/organizer-events-manager.tsx'),
      'utf8',
    );

    // UBU Student Privilege Mode setting
    expect(managerSrc).toContain('ubu-privilege-setting-card');
    expect(managerSrc).toContain('สิทธิ์พิเศษนักศึกษาและบุคลากร ม.อุบลราชธานี');
    expect(managerSrc).toContain('@ubu.ac.th');
    expect(managerSrc).toContain('ubu-privilege-toggle');
    expect(managerSrc).toContain('ticket-student-checkbox-');

    // Platform Fee 3% Transparency Card
    expect(managerSrc).toContain('platform-fee-transparency-card');
    expect(managerSrc).toContain('สรุปข้อตกลงค่าบริการแพลตฟอร์ม TICKET');
    expect(managerSrc).toContain('ค่าบริการมาตรฐาน: 3.00%');
    expect(managerSrc).toContain('ยอดขายรวม − 3%');
  });

  it('verifies D-218: Comprehensive concert governance attributes in organizer events manager', () => {
    const managerSrc = readFileSync(
      join(rootDir, 'src/components/organizer-events-manager.tsx'),
      'utf8',
    );

    // Payout Bank Account Selection
    expect(managerSrc).toContain('payout-account-selection-group');
    expect(managerSrc).toContain('payout-account-select-grid');
    expect(managerSrc).toContain('payout-account-select-card');
    expect(managerSrc).toContain('payout-selected-badge');
    expect(managerSrc).toContain('loadPayoutAccounts');

    // Age restriction
    expect(managerSrc).toContain('event-age-restriction-select');
    expect(managerSrc).toContain('All Ages');
    expect(managerSrc).toContain('18+');
    expect(managerSrc).toContain('20+');

    // Refund policy
    expect(managerSrc).toContain('event-refund-policy-select');
    expect(managerSrc).toContain('refundable_7d');
    expect(managerSrc).toContain('non_refundable');

    // Entry guidelines
    expect(managerSrc).toContain('event-entry-guidelines-input');
  });

  it('verifies D-219: Admin Full Concert Review Modal with custom fee adjustments in owner session approval manager', () => {
    const ownerApprovalSrc = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );

    // Pending Concerts Section & Review Trigger
    expect(ownerApprovalSrc).toContain('owner-pending-concerts-section');
    expect(ownerApprovalSrc).toContain('review-session-btn-');
    expect(ownerApprovalSrc).toContain('ตรวจสอบรายละเอียดและอนุมัติ');

    // Full Concert Review Modal
    expect(ownerApprovalSrc).toContain('admin-full-concert-review-modal');
    expect(ownerApprovalSrc).toContain('ตรวจสอบรายละเอียดคอนเสิร์ตเพื่ออนุมัติเปิดขาย');
    expect(ownerApprovalSrc).toContain('admin-fee-adjustment-box');
    expect(ownerApprovalSrc).toContain('custom-organizer-fee-input');
    expect(ownerApprovalSrc).toContain('custom-reserve-percentage-input');
    expect(ownerApprovalSrc).toContain('admin-approve-concert-btn');
    expect(ownerApprovalSrc).toContain('reject-pending-reason-input-');
  });

  it('verifies D-219 backend: API route /api/owner/sessions supports custom fee rates and rejection', () => {
    const ownerApiSrc = readFileSync(
      join(rootDir, 'src/app/api/owner/sessions/route.ts'),
      'utf8',
    );

    expect(ownerApiSrc).toContain('saveEventFeeSettings');
    expect(ownerApiSrc).toContain('rejectSession');
    expect(ownerApiSrc).toContain('organizerFeeRate');
    expect(ownerApiSrc).toContain('reservePercentage');
    expect(ownerApiSrc).toContain('ubuPrivilegeMode');
  });

  it('verifies database schema in events.ts supports governance columns and session rejection', () => {
    const eventsSchemaSrc = readFileSync(
      join(rootDir, 'src/server/events.ts'),
      'utf8',
    );

    expect(eventsSchemaSrc).toContain('"ageRestriction"');
    expect(eventsSchemaSrc).toContain('"refundPolicy"');
    expect(eventsSchemaSrc).toContain('"entryGuidelines"');
    expect(eventsSchemaSrc).toContain('"payoutAccountId"');
    expect(eventsSchemaSrc).toContain('"ubuPrivilegeMode"');
    expect(eventsSchemaSrc).toContain('"isStudentPrivilege"');
    expect(eventsSchemaSrc).toContain('export async function rejectSession(');
  });

  it('ensures 100% Zero Emojis (D-14) compliance across all touched files', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const files = [
      'docs/requirement.md',
      'src/server/events.ts',
      'src/app/api/events/route.ts',
      'src/app/api/events/[id]/route.ts',
      'src/app/api/owner/sessions/route.ts',
      'src/components/organizer-events-manager.tsx',
      'src/components/owner-session-approval-manager.tsx',
      'src/app/globals.css',
    ];

    for (const relPath of files) {
      const fullPath = join(rootDir, relPath);
      const content = readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        expect(
          emojiRegex.test(line),
          `Found emoji on line ${idx + 1} of ${relPath}: ${line}`,
        ).toBe(false);
      });
    }
  });
});
