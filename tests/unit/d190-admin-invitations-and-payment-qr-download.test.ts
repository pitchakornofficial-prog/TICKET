import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-190 Admin Invitations Hub, Local Dev Mail Preview & Payment Screen Clean-up', () => {
  const rootDir = process.cwd();

  it('verifies Item 1: dedicated admin invitations page and workspace section mapping', () => {
    const workspaceSrc = readFileSync(join(rootDir, 'src/components/owner-workspace-view.tsx'), 'utf8');
    const invitationsViewSrc = readFileSync(join(rootDir, 'src/components/owner-invitations-view.tsx'), 'utf8');
    const apiRouteSrc = readFileSync(join(rootDir, 'src/app/api/owner/invitations/route.ts'), 'utf8');
    const invitationServerSrc = readFileSync(join(rootDir, 'src/server/invitation.ts'), 'utf8');

    // Workspace defines invitations section
    expect(workspaceSrc).toContain("'invitations'");
    expect(workspaceSrc).toContain('OwnerInvitationsView');
    expect(workspaceSrc).toContain("invitations: 'invitations'");
    expect(workspaceSrc).toContain("invitation: 'invitations'");

    // OwnerInvitationsView has full modern UX/UI elements
    expect(invitationsViewSrc).toContain('owner-invitations-view');
    expect(invitationsViewSrc).toContain('invite-organizer-form');
    expect(invitationsViewSrc).toContain('คำเชิญทั้งหมด');
    expect(invitationsViewSrc).toContain('รอการตอบรับ');
    expect(invitationsViewSrc).toContain('ตอบรับแล้ว');
    expect(invitationsViewSrc).toContain('ผู้จัดงาน (Organizer)');
    expect(invitationsViewSrc).toContain('ผู้ดูแลระบบ (Admin / Owner)');
    expect(invitationsViewSrc).toContain('คัดลอกลิงก์คำเชิญ');
    expect(invitationsViewSrc).toContain('ประวัติคำเชิญทั้งหมด');

    // Server and API support
    expect(invitationServerSrc).toContain('export async function listOrganizerInvitations');
    expect(apiRouteSrc).toContain('listOrganizerInvitations');
    expect(apiRouteSrc).toContain('createOrganizerInvitation');

    // Zero emojis check (D-14)
    expect(workspaceSrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(invitationsViewSrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(apiRouteSrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(invitationServerSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 2: local dev captured emails API and test preview support', () => {
    const devMailApiSrc = readFileSync(join(rootDir, 'src/app/api/dev/captured-emails/route.ts'), 'utf8');
    const emailServerSrc = readFileSync(join(rootDir, 'src/server/email.ts'), 'utf8');

    expect(devMailApiSrc).toContain('getCapturedEmails');
    expect(devMailApiSrc).toContain('clearCapturedEmails');
    expect(emailServerSrc).toContain('capturedEmails');

    expect(devMailApiSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 3: payment screen banner removal, timer pill removal, and QR Code PNG download', () => {
    const paymentViewSrc = readFileSync(join(rootDir, 'src/components/order-payment-view.tsx'), 'utf8');

    // Panoramic cover banner must be removed
    expect(paymentViewSrc).not.toContain('payment-cover-banner-wrapper');
    expect(paymentViewSrc).not.toContain('payment-cover-banner-img');

    // Timer badge inside payment card must be removed
    expect(paymentViewSrc).not.toContain('payment-timer-pill');

    // Download QR Code button and canvas handler must exist
    expect(paymentViewSrc).toContain('download-qr-code-btn');
    expect(paymentViewSrc).toContain('handleDownloadQrCode');
    expect(paymentViewSrc).toContain('บันทึกรูป QR Code (PNG)');
    expect(paymentViewSrc).toContain('promptpay-qr-');

    // Zero emojis check (D-14)
    expect(paymentViewSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
