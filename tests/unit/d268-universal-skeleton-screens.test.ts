import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('D-268 & D-270: Universal Bespoke 1:1 Skeleton Screen & Shimmer Engine', () => {
  const rootDir = resolve(__dirname, '../..');

  it('implements core CSS shimmer engine and skeleton tokens in globals.css', () => {
    const globalsCss = readFileSync(
      resolve(rootDir, 'src/app/globals.css'),
      'utf-8',
    );

    expect(globalsCss).toContain('skeleton-shimmer-sweep');
    expect(globalsCss).toContain('.skeleton-shimmer');
    expect(globalsCss).toMatch(/\.skeleton-shimmer\s*\{[^}]*linear-gradient/);
    expect(globalsCss).toContain('.skeleton-box');
    expect(globalsCss).toContain('.skeleton-pill');
    expect(globalsCss).toContain('.skeleton-text');
    expect(globalsCss).toContain('.skeleton-title');
    expect(globalsCss).toContain('.skeleton-catalog-grid');
    expect(globalsCss).toContain('.skeleton-concert-card');
    expect(globalsCss).toContain('prefers-reduced-motion');
    expect(globalsCss).toContain('.skeleton-dots-bar');
  });

  it('provides loading.tsx skeletons for all major discovery, purchase, and workspace routes', () => {
    const routes = [
      'src/app/loading.tsx',
      'src/app/events/[id]/loading.tsx',
      'src/app/events/[id]/checkout/loading.tsx',
      'src/app/news/loading.tsx',
      'src/app/news/[id]/loading.tsx',
      'src/app/orders/[id]/payment/loading.tsx',
      'src/app/orders/[id]/success/loading.tsx',
      'src/app/my-tickets/loading.tsx',
      'src/app/back-office/loading.tsx',
    ];

    for (const route of routes) {
      const fullPath = resolve(rootDir, route);
      expect(existsSync(fullPath)).toBe(true);
      const content = readFileSync(fullPath, 'utf-8');
      expect(content).toContain('skeleton-shimmer');
      expect(content).toContain('skeleton-page-wrapper');
      expect(content).toContain('aria-busy="true"');
    }
  });

  it('verifies D-270 Root Loading Bleed Elimination & Decoupling', () => {
    // 1. Root loading.tsx is a Minimal Neutral Route Bridge (DOES NOT contain home-specific banner or catalog grid)
    const rootLoadingContent = readFileSync(resolve(rootDir, 'src/app/loading.tsx'), 'utf-8');
    expect(rootLoadingContent).not.toContain('skeleton-home-banner');
    expect(rootLoadingContent).not.toContain('catalog-events-grid');
    expect(rootLoadingContent).not.toContain('catalog-tabs');

    // 2. Dedicated HomeCatalogSkeleton component exists with full 1:1 fidelity
    const homeSkeletonPath = resolve(rootDir, 'src/components/home-catalog-skeleton.tsx');
    expect(existsSync(homeSkeletonPath)).toBe(true);
    const homeSkeletonContent = readFileSync(homeSkeletonPath, 'utf-8');
    expect(homeSkeletonContent).toContain('skeleton-home-banner');
    expect(homeSkeletonContent).toContain('catalog-section');
    expect(homeSkeletonContent).toContain('catalog-events-grid');
    expect(homeSkeletonContent).toContain('card-split-poster-frame');

    // 3. Home page (src/app/page.tsx) uses HomeCatalogSkeleton in Suspense boundary
    const homePageContent = readFileSync(resolve(rootDir, 'src/app/page.tsx'), 'utf-8');
    expect(homePageContent).toContain('HomeCatalogSkeleton');
    expect(homePageContent).toContain('fallback={<HomeCatalogSkeleton />}');
  });

  it('verifies D-269 Bespoke 1:1 page-specific layout parity across all subroutes', () => {
    // 1. Event Detail Skeleton
    const eventDetailContent = readFileSync(resolve(rootDir, 'src/app/events/[id]/loading.tsx'), 'utf-8');
    expect(eventDetailContent).toContain('event-detail-page');
    expect(eventDetailContent).toContain('PurchaseStepIndicator');
    expect(eventDetailContent).toContain('event-cover-banner-wrapper');
    expect(eventDetailContent).toContain('event-hero-card');
    expect(eventDetailContent).toContain('hero-meta-cards-track');
    expect(eventDetailContent).toContain('detail-with-poster-layout');
    expect(eventDetailContent).toContain('detail-section-divider');

    // 2. Checkout Flow Skeleton
    const checkoutContent = readFileSync(resolve(rootDir, 'src/app/events/[id]/checkout/loading.tsx'), 'utf-8');
    expect(checkoutContent).toContain('PurchaseStepIndicator');
    expect(checkoutContent).toContain('checkout-compact-status-bar');
    expect(checkoutContent).toContain('session-tab-chips-grid');
    expect(checkoutContent).toContain('session-tab-chip-card');

    // 3. Payment View Skeleton
    const paymentContent = readFileSync(resolve(rootDir, 'src/app/orders/[id]/payment/loading.tsx'), 'utf-8');
    expect(paymentContent).toContain('PurchaseStepIndicator');
    expect(paymentContent).toContain('payment-buyer-details-card');
    expect(paymentContent).toContain('payment-buyer-grid');
    expect(paymentContent).toContain('payment-qr-card');
    expect(paymentContent).toContain('payment-order-summary-card');

    // 4. Success / Digital Ticket Slip Skeleton
    const successContent = readFileSync(resolve(rootDir, 'src/app/orders/[id]/success/loading.tsx'), 'utf-8');
    expect(successContent).toContain('checkout-compact-status-bar');
    expect(successContent).toContain('success-tabs-nav');
    expect(successContent).toContain('payment-receipt-slip-card');
    expect(successContent).toContain('slip-perforated-divider');

    // 5. My Tickets Skeleton
    const myTicketsContent = readFileSync(resolve(rootDir, 'src/app/my-tickets/loading.tsx'), 'utf-8');
    expect(myTicketsContent).toContain('lookup-search-card');

    // 6. News & News Detail Skeletons
    const newsContent = readFileSync(resolve(rootDir, 'src/app/news/loading.tsx'), 'utf-8');
    expect(newsContent).toContain('static-header');
    expect(newsContent).toContain('skeleton-magazine-grid');

    const newsDetailContent = readFileSync(resolve(rootDir, 'src/app/news/[id]/loading.tsx'), 'utf-8');
    expect(newsDetailContent).toContain('news-back-nav');
    expect(newsDetailContent).toContain('news-detail-cover');
    expect(newsDetailContent).toContain('news-related-concert-card');

    // 7. Back Office Skeleton
    const backOfficeContent = readFileSync(resolve(rootDir, 'src/app/back-office/loading.tsx'), 'utf-8');
    expect(backOfficeContent).toContain('admin-topbar');
  });

  it('verifies 100% Zero Emojis compliance (D-14) in all skeleton files', () => {
    const filesToCheck = [
      'src/app/loading.tsx',
      'src/components/home-catalog-skeleton.tsx',
      'src/app/events/[id]/loading.tsx',
      'src/app/events/[id]/checkout/loading.tsx',
      'src/app/news/loading.tsx',
      'src/app/news/[id]/loading.tsx',
      'src/app/orders/[id]/payment/loading.tsx',
      'src/app/orders/[id]/success/loading.tsx',
      'src/app/my-tickets/loading.tsx',
      'src/app/back-office/loading.tsx',
      'tests/unit/d268-universal-skeleton-screens.test.ts',
    ];

    for (const file of filesToCheck) {
      const content = readFileSync(resolve(rootDir, file), 'utf-8');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
