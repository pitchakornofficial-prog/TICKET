import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-189 Ticket Status Plain Text, Topmost Payment QR, 3 UBU Club Test Concerts & Floating Mobile Nav', () => {
  const rootDir = process.cwd();

  it('verifies Item 1: plain text status without pill border/background in event sessions accordion', () => {
    const accordionSrc = readFileSync(join(rootDir, 'src/components/event-sessions-accordion.tsx'), 'utf8');
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    expect(accordionSrc).toContain('ticket-status-text');
    expect(accordionSrc).toContain('status-available');
    expect(accordionSrc).toContain('status-sold-out');

    expect(globalsCss).toMatch(/\.ticket-status-text\s*\{[^}]*white-space:\s*nowrap;/);
    expect(globalsCss).toMatch(/\.ticket-status-text\s*\{[^}]*border:\s*none/);
    expect(globalsCss).toMatch(/\.ticket-status-text\s*\{[^}]*background:\s*transparent/);

    expect(accordionSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 2: topmost PromptPay QR code placement above concert status bar in order payment view', () => {
    const paymentViewSrc = readFileSync(join(rootDir, 'src/components/order-payment-view.tsx'), 'utf8');

    const qrSectionIdx = paymentViewSrc.indexOf('id="promptpay-payment-section"');
    const statusBarIdx = paymentViewSrc.indexOf('className="checkout-compact-status-bar"');
    const buyerCardIdx = paymentViewSrc.indexOf('className="payment-buyer-details-card"');
    const summaryCardIdx = paymentViewSrc.indexOf('className="payment-order-summary-card"');

    expect(qrSectionIdx).toBeGreaterThan(0);
    expect(statusBarIdx).toBeGreaterThan(0);
    expect(buyerCardIdx).toBeGreaterThan(0);
    expect(summaryCardIdx).toBeGreaterThan(0);

    // QR Section must appear above the compact status bar, buyer card, and order summary
    expect(qrSectionIdx).toBeLessThan(statusBarIdx);
    expect(statusBarIdx).toBeLessThan(buyerCardIdx);
    expect(buyerCardIdx).toBeLessThan(summaryCardIdx);

    expect(paymentViewSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 3: 3 additional UBU club concerts in database seed definitions', () => {
    const eventsSrc = readFileSync(join(rootDir, 'src/server/events.ts'), 'utf8');

    expect(eventsSrc).toContain('event-ubu-acoustic-2026');
    expect(eventsSrc).toContain('UBU Acoustic Night 2026');
    expect(eventsSrc).toContain('event-ubu-isan-indy-2026');
    expect(eventsSrc).toContain('Isan Indy Rock Fest 2026');
    expect(eventsSrc).toContain('event-ubu-countdown-2026');
    expect(eventsSrc).toContain('UBU Campus Music Countdown 2026');

    expect(eventsSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 4: mobile search button, floating navigation dropdown with icons, and mutually exclusive toggles', () => {
    const siteShellSrc = readFileSync(join(rootDir, 'src/components/site-shell.tsx'), 'utf8');
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Mobile header actions & search toggle button
    expect(siteShellSrc).toContain('mobile-header-actions');
    expect(siteShellSrc).toContain('mobile-search-btn');
    expect(siteShellSrc).toContain('mobile-hamburger-btn');
    expect(siteShellSrc).toContain('mobile-search-overlay');

    // Mutually exclusive toggle states in site-shell
    expect(siteShellSrc).toContain('setIsMobileSearchOpen(false)');
    expect(siteShellSrc).toContain('setIsMobileMenuOpen(false)');

    // Menu icons in mobile navigation
    expect(siteShellSrc).toContain('mobile-nav-icon');
    expect(siteShellSrc).toContain('HomeIcon');
    expect(siteShellSrc).toContain('TicketIcon');
    expect(siteShellSrc).toContain('BookOpenIcon');
    expect(siteShellSrc).toContain('UsersIcon');
    expect(siteShellSrc).toContain('PhoneIcon');

    // Floating overlay CSS styles (position absolute, not pushing content down)
    expect(globalsCss).toMatch(/\.mobile-nav-dropdown\s*\{[^}]*position:\s*absolute;/);
    expect(globalsCss).toMatch(/\.mobile-nav-dropdown\s*\{[^}]*top:\s*100%;/);
    expect(globalsCss).toMatch(/\.mobile-search-overlay\s*\{[^}]*position:\s*absolute;/);
    expect(globalsCss).toMatch(/\.mobile-search-overlay\s*\{[^}]*top:\s*100%;/);

    expect(siteShellSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
