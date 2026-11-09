import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('D-264: Concert Detail Dividers & Queue Waiting Room Decluttering', () => {
  const rootDir = resolve(__dirname, '../..');

  it('implements subtle horizontal dividers between major topics in event detail page', () => {
    const detailPage = readFileSync(
      resolve(rootDir, 'src/app/events/[id]/page.tsx'),
      'utf-8',
    );
    expect(detailPage).toContain('className="detail-section-divider"');
    const dividerMatches = detailPage.match(/className="detail-section-divider"/g) || [];
    expect(dividerMatches.length).toBeGreaterThanOrEqual(5);

    const globalsCss = readFileSync(
      resolve(rootDir, 'src/app/globals.css'),
      'utf-8',
    );
    expect(globalsCss).toContain('.detail-section-divider');
    expect(globalsCss).toMatch(/\.detail-section-divider\s*\{[^}]*border-top:\s*1px\s*solid\s*var\(--line\)/);
  });

  it('implements queue waiting room back navigation prevention with direct redirect', () => {
    const queueComponent = readFileSync(
      resolve(rootDir, 'src/components/queue-waiting-room.tsx'),
      'utf-8',
    );
    expect(queueComponent).toContain('handlePopState');
    expect(queueComponent).toContain('window.location.replace(`' + '/events/${' + 'eventId}`)');
    expect(queueComponent).toContain("window.history.pushState({ inQueue: true }");
    expect(queueComponent).toContain('handlePageShow');
    expect(queueComponent).toContain('replace className="back-link"');
    expect(queueComponent).toContain('getDeterministicQueueNumber');
    expect(queueComponent).toContain('suppressHydrationWarning');
  });

  it('implements zero-container typography for queue metrics and decluttered active badge and prep items', () => {
    const globalsCss = readFileSync(
      resolve(rootDir, 'src/app/globals.css'),
      'utf-8',
    );
    expect(globalsCss).toMatch(/\.queue-active-badge\s*\{[^}]*background:\s*transparent/);
    expect(globalsCss).toMatch(/\.queue-active-badge\s*\{[^}]*border:\s*none/);
    expect(globalsCss).toMatch(/\.queue-metric-box\s*\{[^}]*background:\s*transparent/);
    expect(globalsCss).toMatch(/\.queue-metric-box\s*\{[^}]*border:\s*none/);
    expect(globalsCss).toMatch(/\.queue-preparation-card\s*\{[^}]*background:\s*transparent/);
    expect(globalsCss).toMatch(/\.queue-preparation-card\s*\{[^}]*border:\s*none/);
    expect(globalsCss).toMatch(/\.queue-prep-item\s*\{[^}]*background:\s*transparent/);
    expect(globalsCss).toMatch(/\.queue-prep-item\s*\{[^}]*border:\s*none/);
  });

  it('implements D-265: dynamic session selection layout (1 session 100%, 2 sessions pair, 3+ scroll track)', () => {
    const checkoutFlow = readFileSync(
      resolve(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf-8',
    );
    expect(checkoutFlow).toContain('session-layout-single');
    expect(checkoutFlow).toContain('session-layout-pair');
    expect(checkoutFlow).toContain('session-layout-scroll');

    const globalsCss = readFileSync(
      resolve(rootDir, 'src/app/globals.css'),
      'utf-8',
    );
    expect(globalsCss).toContain('.session-tab-chips-grid.session-layout-single');
    expect(globalsCss).toContain('.session-tab-chips-grid.session-layout-pair');
    expect(globalsCss).toContain('.session-tab-chips-grid.session-layout-scroll');
    expect(globalsCss).toMatch(/\.session-layout-single\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(globalsCss).toMatch(/\.session-layout-pair\s*\{[^}]*grid-template-columns:\s*1fr\s*1fr/);
    expect(globalsCss).toMatch(/\.session-layout-scroll\s*\{[^}]*overflow-x:\s*auto/);
    expect(globalsCss).toMatch(/\.session-layout-scroll\s*\{[^}]*scroll-snap-type:\s*x\s*mandatory/);
  });

  it('implements queue pass driven 15-minute countdown reset and stale session clearance', () => {
    const queueComponent = readFileSync(
      resolve(rootDir, 'src/components/queue-waiting-room.tsx'),
      'utf-8',
    );
    expect(queueComponent).toContain('sessionStorage.removeItem(`' + 'ticket_checkout_deadline_${' + 'eventId}`);');
    expect(queueComponent).toContain('freshDeadline');
    expect(queueComponent).toContain('sessionStorage.setItem(`' + 'ticket_checkout_deadline_${' + 'eventId}`, freshDeadline.toString());');

    const checkoutFlow = readFileSync(
      resolve(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf-8',
    );
    expect(checkoutFlow).toContain('handleBackToDetails');
    expect(checkoutFlow).toContain('sessionStorage.removeItem(`' + 'ticket_checkout_deadline_${' + 'eventId}`);');
    expect(checkoutFlow).toContain('sessionStorage.removeItem(`' + 'ticket_queue_pass_${' + 'eventId}`);');
    expect(checkoutFlow).toContain('passDeadline');
  });

  it('implements D-266: payment page buyer details zero-box, disclaimer cleanup, count badge, qty icon, and grand total divider', () => {
    const paymentView = readFileSync(
      resolve(rootDir, 'src/components/order-payment-view.tsx'),
      'utf-8',
    );
    expect(paymentView).not.toContain('(AC-11)');
    expect(paymentView).toContain('ไม่จำเป็นต้องลงทะเบียนชื่อผู้เข้าชมแยกใบ');
    expect(paymentView).toContain('× {item.quantity}');

    const globalsCss = readFileSync(
      resolve(rootDir, 'src/app/globals.css'),
      'utf-8',
    );
    expect(globalsCss).toMatch(/\.buyer-grid-item\s*\{[^}]*background:\s*transparent/);
    expect(globalsCss).toMatch(/\.buyer-grid-item\s*\{[^}]*border:\s*none/);
    expect(globalsCss).toMatch(/\.payment-buyer-disclaimer\s*\{[^}]*background:\s*transparent/);
    expect(globalsCss).toMatch(/\.payment-summary-count-badge\s*\{[^}]*background:\s*transparent/);
    expect(globalsCss).toMatch(/\.payment-item-qty\s*\{[^}]*background:\s*transparent/);
    expect(globalsCss).toMatch(/\.payment-grand-total-row\s*\{[^}]*border-top:\s*1px\s*solid\s*var\(--line\)/);
  });

  it('verifies 100% Zero Emojis compliance (D-14) in modified files', () => {
    const detailPage = readFileSync(
      resolve(rootDir, 'src/app/events/[id]/page.tsx'),
      'utf-8',
    );
    const queueComponent = readFileSync(
      resolve(rootDir, 'src/components/queue-waiting-room.tsx'),
      'utf-8',
    );
    const checkoutFlow = readFileSync(
      resolve(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf-8',
    );
    const paymentView = readFileSync(
      resolve(rootDir, 'src/components/order-payment-view.tsx'),
      'utf-8',
    );
    const thisTestFile = readFileSync(
      resolve(rootDir, 'tests/unit/d264-event-detail-dividers-and-queue-declutter.test.ts'),
      'utf-8',
    );

    expect(detailPage).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(queueComponent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(checkoutFlow).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(paymentView).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(thisTestFile).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
