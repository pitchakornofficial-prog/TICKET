import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INVITATION_EXPIRATION_HOURS } from '../../src/server/invitation';

describe('D-188 Purchasing Flow, Responsive Optimization & Multi-Role Invitation', () => {
  const rootDir = process.cwd();

  it('verifies Item 1: direct ticket view URL in ticket email delivery', () => {
    const deliverySrc = readFileSync(join(rootDir, 'src/server/ticket-delivery.ts'), 'utf8');
    expect(deliverySrc).toMatch(/\/orders\/\$\{order\.id\}\/success\?tab=tickets/);
    expect(deliverySrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 2 & 3: responsive ticket cards on mobile and full-width CTA button', () => {
    const accordionSrc = readFileSync(join(rootDir, 'src/components/event-sessions-accordion.tsx'), 'utf8');
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    expect(accordionSrc).toContain('ticket-types-cards-mobile');
    expect(globalsCss).toContain('.ticket-types-cards-mobile');
    expect(globalsCss).toContain('.sticky-bar-buy-btn');
    expect(globalsCss).toMatch(/\.sticky-bar-buy-btn\s*\{[^}]*width:\s*100%;/);
    expect(accordionSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 4, 5, 6, 9, 10, 13: PDPA consent, modal OTP dialog, full-width inputs, and auto-proceed', () => {
    const guestEntrySrc = readFileSync(join(rootDir, 'src/components/guest-checkout-entry.tsx'), 'utf8');
    const flowSrc = readFileSync(join(rootDir, 'src/components/event-checkout-flow.tsx'), 'utf8');

    // PDPA consent checkbox
    expect(guestEntrySrc).toContain('pdpa-consent-checkbox');
    expect(guestEntrySrc).toContain('นโยบายความเป็นส่วนตัว (PDPA)');

    // Modal OTP dialog
    expect(guestEntrySrc).toContain('otp-modal-overlay');
    expect(guestEntrySrc).toContain('otp-modal-card');
    expect(guestEntrySrc).toContain('otp-modal-cancel-btn');

    // Auto-proceed parameter in onVerified
    expect(guestEntrySrc).toContain('autoProceed?: boolean');
    expect(guestEntrySrc).toContain('onVerified(buyerInfo, data.buyerQuota, true)');
    expect(flowSrc).toContain('onVerified={(verifiedInfo, quotaInfo, autoProceed) => {');
    expect(flowSrc).toContain('handleConfirmReservation(undefined, verifiedInfo)');

    expect(guestEntrySrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(flowSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 7: PromptPay QR code auto-generation on payment page entry', () => {
    const paymentViewSrc = readFileSync(join(rootDir, 'src/components/order-payment-view.tsx'), 'utf8');
    expect(paymentViewSrc).toContain('handleGeneratePaymentQr');
    expect(paymentViewSrc).toContain('กำลังโหลด QR Code ชำระเงิน PromptPay...');
    expect(paymentViewSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 8, 11, 12: hide footer in checkout, mobile hamburger button, and full-bleed banner', () => {
    const siteShellSrc = readFileSync(join(rootDir, 'src/components/site-shell.tsx'), 'utf8');
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Hide footer on focused checkout
    expect(siteShellSrc).toContain('!isFocusedCheckout &&');
    expect(siteShellSrc).toContain('mobile-hamburger-btn');
    expect(siteShellSrc).toContain('mobile-nav-dropdown');

    // Full-bleed banner CSS
    expect(globalsCss).toMatch(/\.upcoming-banner-section\s*\{[^}]*max-width:\s*100%;/);
    expect(globalsCss).toMatch(/\.banner-carousel-container\s*\{[^}]*border-radius:\s*0;/);

    expect(siteShellSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 14: multi-role invitation for organizers and admins', () => {
    const inviteSrc = readFileSync(join(rootDir, 'src/server/invitation.ts'), 'utf8');
    const authHttpSrc = readFileSync(join(rootDir, 'src/server/auth-http.ts'), 'utf8');
    const inviteFormSrc = readFileSync(join(rootDir, 'src/components/invite-organizer-form.tsx'), 'utf8');
    const acceptFormSrc = readFileSync(join(rootDir, 'src/components/accept-invitation-form.tsx'), 'utf8');

    // Invitation server supports role: 'organizer' | 'owner'
    expect(inviteSrc).toContain("role?: 'organizer' | 'owner'");
    expect(inviteSrc).toContain("role: (row.role as 'organizer' | 'owner') || 'organizer'");
    expect(INVITATION_EXPIRATION_HOURS).toBe(48);

    // Auth HTTP endpoint parses role
    expect(authHttpSrc).toContain('invitedRole');

    // Admin UI provides role selector
    expect(inviteFormSrc).toContain('ผู้จัดงาน (Organizer)');
    expect(inviteFormSrc).toContain('ผู้ดูแลระบบ (Admin / Owner)');

    // Accept invitation UI handles any invited role
    expect(acceptFormSrc).toContain('ตั้งบัญชีผู้ใช้สำเร็จ');
    expect(acceptFormSrc).toContain('ไปหน้าเข้าสู่ระบบ');

    // Zero emojis check
    expect(inviteSrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(authHttpSrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(inviteFormSrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(acceptFormSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
