import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Checkout Navigation Guards and PDPA Modal', () => {
  const rootDir = process.cwd();

  it('verifies PdpaModal defines accessible dialog, PDPA policy sections, and zero emojis', () => {
    const pdpaSrc = readFileSync(join(rootDir, 'src/components/pdpa-modal.tsx'), 'utf8');
    expect(pdpaSrc).toContain('role="dialog"');
    expect(pdpaSrc).toContain('aria-modal="true"');
    expect(pdpaSrc).toContain('aria-labelledby="pdpa-modal-title"');
    expect(pdpaSrc).toContain('นโยบายความเป็นส่วนตัว (PDPA)');
    expect(pdpaSrc).toContain('1. ข้อมูลส่วนบุคคลที่เราจัดเก็บ');
    expect(pdpaSrc).toContain('2. วัตถุประสงค์ในการประมวลผลข้อมูล');
    expect(pdpaSrc).toContain('3. มาตรการจำกัดสิทธิ์การเข้าถึง');
    expect(pdpaSrc).toContain('4. สิทธิ์ของเจ้าของข้อมูลส่วนบุคคล');
    expect(pdpaSrc).toContain('5. ความมั่นคงปลอดภัยของข้อมูล');
    expect(pdpaSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies GuestCheckoutEntry integrates PdpaModal and triggers it via button instead of external link', () => {
    const guestSrc = readFileSync(join(rootDir, 'src/components/guest-checkout-entry.tsx'), 'utf8');
    expect(guestSrc).toContain('PdpaModal');
    expect(guestSrc).toContain('showPdpaModal');
    expect(guestSrc).toContain('setShowPdpaModal(true)');
    expect(guestSrc).not.toContain('<a href="/privacy"');
    expect(guestSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies SiteShell traps search clicks, browser history popstate, and beforeunload during focused checkout', () => {
    const shellSrc = readFileSync(join(rootDir, 'src/components/site-shell.tsx'), 'utf8');
    expect(shellSrc).toContain('onClickCapture');
    expect(shellSrc).toContain('onFocusCapture');
    expect(shellSrc).toContain('ticket:request-exit');
    expect(shellSrc).toContain('ticketCheckoutGuard');
    expect(shellSrc).toContain('popstate');
    expect(shellSrc).toContain('beforeunload');
    expect(shellSrc).toContain('__BROWSER_BACK__');
    expect(shellSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies event checkout, order payment, and queue views dispatch ticket:request-exit on back button', () => {
    const flowSrc = readFileSync(join(rootDir, 'src/components/event-checkout-flow.tsx'), 'utf8');
    const paymentSrc = readFileSync(join(rootDir, 'src/components/order-payment-view.tsx'), 'utf8');
    const queueSrc = readFileSync(join(rootDir, 'src/components/queue-waiting-room.tsx'), 'utf8');

    expect(flowSrc).toContain('ticket:request-exit');
    expect(paymentSrc).toContain('ticket:request-exit');
    expect(queueSrc).toContain('ticket:request-exit');

    expect(flowSrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(paymentSrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(queueSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
