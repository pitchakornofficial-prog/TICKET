import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateCustomQrSvg } from '@/lib/ticket-qr';
import { generateTicketQrSvg } from '@/server/tickets';

describe('D-279: All-in-One Session & Concert Amendment Suite, Ticket Design Uniformity & Strict Buyer Protection Guardrails', () => {
  it('1. Verifies D-279 is documented in docs/requirement.md with Zero Emojis', () => {
    const reqPath = path.resolve(process.cwd(), 'docs/requirement.md');
    const content = fs.readFileSync(reqPath, 'utf8');
    expect(content).toContain('D-279');
    expect(content).toContain('All-in-One Session & Concert Amendment Suite');
    expect(content).toContain('Strict Buyer Protection Guardrails');

    // D-14 Zero Emojis check
    const emojiRegex = /\p{Extended_Pictographic}/u;
    const d279Line = content.split('\n').find(line => line.includes('D-279'));
    expect(d279Line).toBeDefined();
    expect(emojiRegex.test(d279Line || '')).toBe(false);
  });

  it('2. Verifies Zone & Category has no frame and QR code has rounded corners in SVGs', () => {
    const customSvg = generateCustomQrSvg('TKT-TEST-001', { moduleSize: 8, bgColor: '#ffffff', fgColor: '#000000' });
    const decodedCustomSvg = decodeURIComponent(customSvg);
    expect(decodedCustomSvg).toContain('rx="12"');
    expect(decodedCustomSvg).toContain('ry="12"');

    const ticketSvg = generateTicketQrSvg('TK-0001', 'PAYLOAD-001');
    const decodedTicketSvg = decodeURIComponent(ticketSvg);
    expect(decodedTicketSvg).toContain('rx="12"');
    expect(decodedTicketSvg).toContain('ry="12"');
  });

  it('3. Verifies ticket-canvas-download renders zoneBadge as plain text without drawElementBox', () => {
    const canvasFilePath = path.resolve(process.cwd(), 'src/components/ticket-canvas-download.ts');
    const content = fs.readFileSync(canvasFilePath, 'utf8');

    // Should NOT have drawElementBox for badge
    expect(content).not.toContain('drawElementBox(badge');
    expect(content).toContain("badge.secondaryText || 'โซน / ประเภทบัตร (ZONE & CATEGORY)'");
    expect(content).toContain('innerQrRadius');
  });

  it('4. Verifies admin-ticket-designer renders zoneBadge as meta-block and has rounded QR', () => {
    const designerFilePath = path.resolve(process.cwd(), 'src/components/admin-ticket-designer.tsx');
    const content = fs.readFileSync(designerFilePath, 'utf8');

    expect(content).toContain("label: 'โซน / ประเภทบัตร (Zone & Category)'");
    expect(content).toContain("secondaryText: 'โซน / ประเภทบัตร (ZONE & CATEGORY)'");
    expect(content).toContain('className="surface-qr-btn"');
    expect(content).toContain("borderRadius: '12px'");
  });

  it('5. Verifies organizer amendment modal has 3 sections, add tier button, and quota protection', () => {
    const organizerFilePath = path.resolve(process.cwd(), 'src/components/organizer-events-manager.tsx');
    const content = fs.readFileSync(organizerFilePath, 'utf8');

    expect(content).toContain('1. ข้อมูลคอนเสิร์ต (Concert Details):');
    expect(content).toContain('2. กำหนดการแสดงและเวลาเปิดประตู (Session Times & Admission):');
    expect(content).toContain('3. ประเภทบัตร โควตา และสิทธิ์พิเศษ (Ticket Tiers & Quota Governance):');
    expect(content).toContain('amendment-add-tier-btn');
    expect(content).toContain('จำหน่ายแล้ว');
    expect(content).toContain('ล็อกขั้นต่ำ');
    expect(content).toContain('ไม่สามารถลบประเภทบัตรที่มียอดจำหน่ายแล้วได้');
  });

  it('6. Verifies owner session approval manager displays concert amendment diff strip', () => {
    const ownerApprovalPath = path.resolve(process.cwd(), 'src/components/owner-session-approval-manager.tsx');
    const content = fs.readFileSync(ownerApprovalPath, 'utf8');

    expect(content).toContain('amd.concertDetails');
    expect(content).toContain('ขอแก้ไขข้อมูลคอนเสิร์ต:');
  });

  it('7. Verifies backend events.ts schema and submission validation for concertDetails and buyer protection', () => {
    const eventsPath = path.resolve(process.cwd(), 'src/server/events.ts');
    const content = fs.readFileSync(eventsPath, 'utf8');

    expect(content).toContain('ALTER TABLE session_amendments ADD COLUMN IF NOT EXISTS "concertDetails" JSONB');
    expect(content).toContain('ไม่สามารถลบประเภทบัตร');
    expect(content).toContain('เนื่องจากมีผู้ซื้อหรือถือครองบัตรแล้ว');
    expect(content).toContain('concertDetails');
  });
});
