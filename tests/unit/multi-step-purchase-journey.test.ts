import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Multi-step purchase journey (TASK-040, AC-117, D-27)', () => {
  const rootDir = process.cwd();

  it('defines the PurchaseStepIndicator with Thai labels, zero emojis, and without "ห้องรอคิว"', () => {
    const content = readFileSync(
      join(rootDir, 'src/components/purchase-step-indicator.tsx'),
      'utf8',
    );
    expect(content).toContain('รายละเอียดคอนเสิร์ต');
    expect(content).toContain('เลือกรอบและประเภทบัตร');
    expect(content).toContain('ชำระเงิน');
    // As explicitly requested, "ห้องรอคิว" is removed from the visible step label
    expect(content).not.toContain('ห้องรอคิว');
    expect(content).toContain('data-testid="purchase-step-indicator"');
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('separates event detail page (/events/[id]) with collapsible sessions, google maps, and a single purchase CTA button', () => {
    const eventDetailPage = readFileSync(
      join(rootDir, 'src/app/events/[id]/page.tsx'),
      'utf8',
    );
    expect(eventDetailPage).toContain('currentStep="details"');
    expect(eventDetailPage).toContain('/queue');
    expect(eventDetailPage).toContain('enter-queue-cta-btn');
    expect(eventDetailPage).toContain('sidebar-buy-tickets-btn');
    // Rich details: Google Maps & Collapsible Accordion
    expect(eventDetailPage).toContain('maps.google.com/maps');
    expect(eventDetailPage).toContain('<EventSessionsAccordion');
    // Does not show the words "ห้องรอคิว"
    expect(eventDetailPage).not.toContain('ห้องรอคิว');
    expect(eventDetailPage).not.toContain('<TicketReservationFlow');
    expect(eventDetailPage).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements collapsible sessions accordion (EventSessionsAccordion)', () => {
    const accordionComponent = readFileSync(
      join(rootDir, 'src/components/event-sessions-accordion.tsx'),
      'utf8',
    );
    expect(accordionComponent).toContain('session-accordion-card');
    expect(accordionComponent).toContain('session-accordion-trigger');
    expect(accordionComponent).toContain('ticket-types-table');
    expect(accordionComponent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements queue waiting room (/events/[id]/queue), checkout (/events/[id]/checkout), and payment (/orders/[id]/payment)', () => {
    const queueComponent = readFileSync(
      join(rootDir, 'src/components/queue-waiting-room.tsx'),
      'utf8',
    );
    expect(queueComponent).toContain('currentStep="queue"');
    expect(queueComponent).toContain('queue-number-display');
    expect(queueComponent).toContain('queue-ahead-count');
    expect(queueComponent).toContain('proceed-to-checkout-btn');
    expect(queueComponent).not.toContain('ห้องรอคิว');
    expect(queueComponent).not.toMatch(/\p{Extended_Pictographic}/u);

    const checkoutComponent = readFileSync(
      join(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf8',
    );
    expect(checkoutComponent).toContain('currentStep="checkout"');
    expect(checkoutComponent).toContain('เลือกรอบการแสดงและจำนวนบัตร');
    expect(checkoutComponent).toContain('<GuestCheckoutEntry');
    expect(checkoutComponent).toContain('confirm-reservation-btn');
    expect(checkoutComponent).toContain('/orders/');
    expect(checkoutComponent).toContain('/payment');
    expect(checkoutComponent).not.toMatch(/\p{Extended_Pictographic}/u);

    const paymentComponent = readFileSync(
      join(rootDir, 'src/components/order-payment-view.tsx'),
      'utf8',
    );
    expect(paymentComponent).toContain('currentStep="payment"');
    expect(paymentComponent).toContain('reservation-countdown');
    expect(paymentComponent).toContain('generate-payment-qr-btn');
    expect(paymentComponent).toContain('simulate-payment-button');
    expect(paymentComponent).toContain('issued-tickets-section');
    expect(paymentComponent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements CheckoutTimeoutModal with safe pure countdown and effect-based redirect (D-49)', () => {
    const timeoutModal = readFileSync(
      join(rootDir, 'src/components/checkout-timeout-modal.tsx'),
      'utf8',
    );
    expect(timeoutModal).toContain('CheckoutTimeoutModal');
    expect(timeoutModal).toContain('timeout-modal-overlay');
    expect(timeoutModal).toContain('timeout-countdown-note');
    expect(timeoutModal).toContain('timeout-modal-redirect-btn');
    expect(timeoutModal).toContain('setCountdown(prev => Math.max(0, prev - 1));');
    expect(timeoutModal).toContain('countdown !== 0');
    expect(timeoutModal).toContain('handleRedirect()');
    expect(timeoutModal).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements D-144 & D-146: Session quota column, sold-out status, minimalist schedule meta, clean lineup, expandable description, and prohibited items carousel', () => {
    const accordion = readFileSync(
      join(rootDir, 'src/components/event-sessions-accordion.tsx'),
      'utf8',
    );
    expect(accordion).toContain('คงเหลือ');
    expect(accordion).toContain('ticket-quota-cell');
    expect(accordion).toContain('price-sold-out');
    expect(accordion).toContain('sold-out-badge');
    expect(accordion).toContain('session-meta-time-text');
    expect(accordion).not.toContain('session-round-pill');
    expect(accordion).not.toMatch(/\p{Extended_Pictographic}/u);

    const expandableDesc = readFileSync(
      join(rootDir, 'src/components/expandable-event-description.tsx'),
      'utf8',
    );
    expect(expandableDesc).toContain('ExpandableEventDescription');
    expect(expandableDesc).toContain('description-modal-open-btn');
    expect(expandableDesc).toContain('อ่านรายละเอียดทั้งหมด');
    expect(expandableDesc).toContain('description-modal-card');
    expect(expandableDesc).not.toMatch(/\p{Extended_Pictographic}/u);

    const eventPage = readFileSync(
      join(rootDir, 'src/app/events/[id]/page.tsx'),
      'utf8',
    );
    expect(eventPage).not.toContain('เตรียมพบกับการรวมตัวของไลน์อัปศิลปินแถวหน้า');
    expect(eventPage).toContain('artist-grid-2x2');
    expect(eventPage).toContain('THE NEON BAND');
    expect(eventPage).toContain('ELECTRIC DREAMS');
    expect(eventPage).toContain('EventProhibitedItemsCarousel');
    expect(eventPage).toContain('ExpandableEventDescription');
    expect(eventPage).not.toMatch(/\p{Extended_Pictographic}/u);

    const prohibitedCarousel = readFileSync(
      join(rootDir, 'src/components/event-prohibited-items-carousel.tsx'),
      'utf8',
    );
    expect(prohibitedCarousel).toContain('EventProhibitedItemsCarousel');
    expect(prohibitedCarousel).toContain('prohibited-items-scroll-track');
    expect(prohibitedCarousel).toContain('prohibited-standalone-icon');
    expect(prohibitedCarousel).toContain('header-carousel-nav');
    expect(prohibitedCarousel).toContain('carousel-nav-btn');
    expect(prohibitedCarousel).toContain('กฎระเบียบและสิ่งของต้องห้ามนำเข้างาน');
    expect(prohibitedCarousel).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.ticket-quota-cell');
    expect(globalsCss).toContain('.price-num.price-sold-out');
    expect(globalsCss).toContain('.session-meta-time-text');
    expect(globalsCss).toContain('.artist-grid-2x2');
    expect(globalsCss).toContain('.description-modal-card');
    expect(globalsCss).toContain('.prohibited-items-scroll-track');
    expect(globalsCss).toContain('.prohibited-standalone-icon');
    expect(globalsCss).toContain('.header-carousel-nav');
    expect(globalsCss).toContain('.carousel-nav-btn');
  });

  it('implements D-147: Standalone hero meta icons, unbroken Thai text, sharp 4:5 poster with lightbox, and official gallery grid', () => {
    const eventPage = readFileSync(
      join(rootDir, 'src/app/events/[id]/page.tsx'),
      'utf8',
    );
    expect(eventPage).toContain('text-nowrap');
    expect(eventPage).toContain('EventInteractivePoster');
    expect(eventPage).toContain('EventOfficialGallery');
    expect(eventPage).not.toMatch(/\p{Extended_Pictographic}/u);

    const interactivePoster = readFileSync(
      join(rootDir, 'src/components/event-interactive-poster.tsx'),
      'utf8',
    );
    expect(interactivePoster).toContain('category-vertical-poster-card');
    expect(interactivePoster).toContain('category-vertical-poster-btn');
    expect(interactivePoster).toContain('ImageLightboxModal');
    expect(interactivePoster).not.toMatch(/\p{Extended_Pictographic}/u);

    const lightboxModal = readFileSync(
      join(rootDir, 'src/components/image-lightbox-modal.tsx'),
      'utf8',
    );
    expect(lightboxModal).toContain('image-lightbox-backdrop');
    expect(lightboxModal).toContain('image-lightbox-img');
    expect(lightboxModal).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.text-nowrap');
    expect(globalsCss).toContain('aspect-ratio: 4 / 5;');
    expect(globalsCss).toContain('border-radius: 0;');
    expect(globalsCss).toContain('.image-lightbox-backdrop');
  });

  it('implements D-148, D-149 & D-150: Hero Overview & Artist Lineup Transparent Borderless Styling', () => {
    const eventPage = readFileSync(
      join(rootDir, 'src/app/events/[id]/page.tsx'),
      'utf8',
    );
    expect(eventPage).toContain('hero-meta-cards-track');
    expect(eventPage).toContain('hero-meta-card');
    expect(eventPage).toContain('hero-meta-card-content');
    expect(eventPage).toContain('artist-grid-2x2');
    expect(eventPage).toContain('artist-card-item');
    expect(eventPage).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.hero-meta-cards-track');
    expect(globalsCss).toContain('.hero-meta-card');
    expect(globalsCss).toContain('.hero-meta-card-content');
    expect(globalsCss).toMatch(
      /\.hero-meta-card\s*\{[^}]*background:\s*transparent;[^}]*border:\s*none;/,
    );
    expect(globalsCss).toMatch(
      /\.artist-card-item\s*\{[^}]*background:\s*transparent;[^}]*border:\s*none;/,
    );
    expect(globalsCss).toMatch(
      /\.artist-card-item\.primary-artist\s*\{[^}]*background:\s*transparent;[^}]*border:\s*none;/,
    );
  });

  it('implements D-151 & D-152: Pure 16:9 Image Gallery without Card or Caption, Sharp Rectangular Corners, and Arrow-Controlled Minimalist Lightbox', () => {
    const officialGallery = readFileSync(
      join(rootDir, 'src/components/event-official-gallery.tsx'),
      'utf8',
    );
    expect(officialGallery).toContain('pure-gallery-grid-16x9');
    expect(officialGallery).toContain('gallery-thumb-pure-btn');
    expect(officialGallery).toContain('gallery-thumb-pure-img');
    expect(officialGallery).not.toContain('gallery-card-body');
    expect(officialGallery).not.toContain('gallery-card-title');
    expect(officialGallery).not.toContain('gallery-card-desc');
    expect(officialGallery).not.toMatch(/\p{Extended_Pictographic}/u);

    const lightboxModal = readFileSync(
      join(rootDir, 'src/components/image-lightbox-modal.tsx'),
      'utf8',
    );
    expect(lightboxModal).toContain('image-lightbox-nav-btn prev-btn');
    expect(lightboxModal).toContain('image-lightbox-nav-btn next-btn');
    expect(lightboxModal).not.toContain('image-lightbox-close-btn');
    expect(lightboxModal).not.toContain('image-lightbox-meta');
    expect(lightboxModal).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.pure-gallery-grid-16x9');
    expect(globalsCss).toContain('.gallery-thumb-pure-btn');
    expect(globalsCss).toContain('aspect-ratio: 16 / 9;');
    expect(globalsCss).toContain('.image-lightbox-nav-btn');
    expect(globalsCss).toMatch(
      /\.gallery-thumb-pure-btn\s*\{[^}]*border-radius:\s*0;/,
    );
    expect(globalsCss).toMatch(
      /\.gallery-thumb-pure-img\s*\{[^}]*border-radius:\s*0;/,
    );
  });

  it('implements D-153: Artist Buy-CTA Pointer Mascot Sticker & Transparent Checkout Round Pill', () => {
    const eventDetail = readFileSync(
      join(rootDir, 'src/app/events/[id]/page.tsx'),
      'utf8',
    );
    expect(eventDetail).toContain('sticky-bar-cta-wrap');
    expect(eventDetail).toContain('ArtistPointerMascot');
    expect(eventDetail).toContain('artistPointerUrl');
    expect(eventDetail).not.toMatch(/\p{Extended_Pictographic}/u);

    const mascotComponent = readFileSync(
      join(rootDir, 'src/components/artist-pointer-mascot.tsx'),
      'utf8',
    );
    expect(mascotComponent).toContain('artist-pointer-sticker');
    expect(mascotComponent).toContain('ศิลปินชี้ปุ่มซื้อบัตร');
    expect(mascotComponent).not.toMatch(/\p{Extended_Pictographic}/u);

    const defaultSvg = readFileSync(
      join(rootDir, 'public/artist-pointer-default.svg'),
      'utf8',
    );
    expect(defaultSvg).toContain('<svg');
    expect(defaultSvg).not.toMatch(/\p{Extended_Pictographic}/u);

    const checkoutFlow = readFileSync(
      join(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf8',
    );
    expect(checkoutFlow).toContain('รอบ {idx + 1}');
    expect(checkoutFlow).not.toContain('รอบที่ {idx + 1}');
    expect(checkoutFlow).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.sticky-bar-cta-wrap');
    expect(globalsCss).toContain('.artist-pointer-sticker');
    expect(globalsCss).toMatch(
      /\.session-tab-chip-pill\s*\{[^}]*background:\s*transparent;/,
    );
    expect(globalsCss).toMatch(
      /\.session-tab-chip-pill\s*\{[^}]*border:\s*none;/,
    );
  });

  it('implements D-154: Checkout Clean Black Text Badges & Sticky Bar UBU Pill Removal', () => {
    const checkoutFlow = readFileSync(
      join(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf8',
    );
    expect(checkoutFlow).toContain('queue-pass-pill');
    expect(checkoutFlow).toContain('ubu-active-pill');
    // Ensure ubu-ticket-pill is removed from sticky bottom bar
    expect(checkoutFlow).not.toMatch(
      /checkout-sticky-bar[\s\S]*ubu-ticket-pill/,
    );
    expect(checkoutFlow).not.toContain(
      'สิทธิ์ ม.อุบลฯ -{formatBaht(ubuDiscountAmount)}',
    );
    expect(checkoutFlow).not.toMatch(/\p{Extended_Pictographic}/u);

    const guestEntry = readFileSync(
      join(rootDir, 'src/components/guest-checkout-entry.tsx'),
      'utf8',
    );
    expect(guestEntry).toContain('ubu-inline-pill');
    expect(guestEntry).toContain('รอเปิดใช้งานสิทธิ์ ม.อุบลฯ');
    expect(guestEntry).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toMatch(
      /\.queue-pass-pill\s*\{[^}]*background:\s*transparent;/,
    );
    expect(globalsCss).toMatch(
      /\.queue-pass-pill\s*\{[^}]*color:\s*#0f172a;/,
    );
    expect(globalsCss).toMatch(
      /\.ubu-inline-pill\s*\{[^}]*background:\s*transparent;/,
    );
    expect(globalsCss).toMatch(
      /\.ubu-inline-pill\s*\{[^}]*color:\s*#0f172a;/,
    );
    expect(globalsCss).toMatch(
      /\.ubu-active-pill\s*\{[^}]*background:\s*transparent;/,
    );
    expect(globalsCss).toMatch(
      /\.ubu-active-pill\s*\{[^}]*color:\s*#0f172a;/,
    );
  });

  it('implements D-155: Artist CTA Pointer Mascot Right-Tilted Placement & 650ms Multi-Frame Cycling', () => {
    const mascotComponent = readFileSync(
      join(rootDir, 'src/components/artist-pointer-mascot.tsx'),
      'utf8',
    );
    expect(mascotComponent).toContain('artist-pointer-mascot-container');
    expect(mascotComponent).toContain('/artist-pointer-frame1.svg');
    expect(mascotComponent).toContain('/artist-pointer-frame2.svg');
    expect(mascotComponent).toContain('/artist-pointer-frame3.svg');
    expect(mascotComponent).toContain('intervalMs = 650');
    expect(mascotComponent).not.toMatch(/\p{Extended_Pictographic}/u);

    for (const frame of [
      'artist-pointer-frame1.svg',
      'artist-pointer-frame2.svg',
      'artist-pointer-frame3.svg',
    ]) {
      const svgContent = readFileSync(join(rootDir, 'public', frame), 'utf8');
      expect(svgContent).toContain('<svg');
      expect(svgContent).not.toMatch(/\p{Extended_Pictographic}/u);
    }

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.artist-pointer-mascot-container');
    expect(globalsCss).toMatch(/transform:\s*rotate\((-4|1[024])deg\);/);
    expect(globalsCss).toMatch(/right:\s*(-(10|12|15)px|clamp)/);
    expect(globalsCss).toContain('pointerFloatTilted');
  });

  it('implements D-156: Lisa Card-Clinging CTA Mascot & Enlarged Multi-Frame Sequence', () => {
    const mascotComponent = readFileSync(
      join(rootDir, 'src/components/artist-pointer-mascot.tsx'),
      'utf8',
    );
    expect(mascotComponent).toContain('data-testid="artist-pointer-mascot-img"');
    expect(mascotComponent).not.toMatch(/\p{Extended_Pictographic}/u);

    // Verify Lisa artwork frames contain signature bangs and zero emojis
    for (const frame of [
      'artist-pointer-frame1.svg',
      'artist-pointer-frame2.svg',
      'artist-pointer-frame3.svg',
      'artist-pointer-default.svg',
    ]) {
      const svg = readFileSync(join(rootDir, 'public', frame), 'utf8');
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox="0 0 160 180"');
      expect(svg).not.toMatch(/\p{Extended_Pictographic}/u);
    }

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.artist-pointer-sticker');
    expect(globalsCss).toMatch(
      /\.artist-pointer-mascot-container\s*\{[^}]*bottom:\s*calc\(100% - 1[468]px\);/,
    );
  });

  it('implements D-157 & D-158: Lisa Near Half-Screen Hero Mascot Scale (42vh) & Viewport-Right Anchor', () => {
    const mascotComponent = readFileSync(
      join(rootDir, 'src/components/artist-pointer-mascot.tsx'),
      'utf8',
    );
    expect(mascotComponent).toContain('width={320}');
    expect(mascotComponent).toContain('height={360}');
    expect(mascotComponent).not.toMatch(/\p{Extended_Pictographic}/u);

    const eventDetail = readFileSync(
      join(rootDir, 'src/app/events/[id]/page.tsx'),
      'utf8',
    );
    expect(eventDetail).toContain('ArtistPointerMascot');
    expect(eventDetail).toContain('event-sticky-bottom-bar');
    expect(eventDetail).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toMatch(
      /\.artist-pointer-sticker\s*\{[^}]*height:\s*clamp\(220px,\s*42vh,\s*420px\);/,
    );
    expect(globalsCss).toMatch(
      /\.artist-pointer-sticker\s*\{[^}]*max-width:\s*clamp\(190px,\s*45vw,\s*380px\);/,
    );
    expect(globalsCss).toMatch(
      /\.artist-pointer-sticker\s*\{[^}]*pointer-events:\s*none;/,
    );
    expect(globalsCss).toMatch(
      /\.artist-pointer-mascot-container\s*\{[^}]*bottom:\s*calc\(100% - 16px\);/,
    );
    expect(globalsCss).toMatch(
      /\.artist-pointer-mascot-container\s*\{[^}]*right:\s*clamp\(12px,\s*2\.5vw,\s*36px\);/,
    );
    expect(globalsCss).toMatch(
      /\.artist-pointer-mascot-container\s*\{[^}]*transform:\s*rotate\(-4deg\);/,
    );
  });

  it('implements D-169: Unified Session Card Layout & Max-Width Proportion for Single & Multi Sessions', () => {
    const checkoutFlow = readFileSync(
      join(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf8',
    );
    // Verifies unified session card rendering for both 1 session and multi-sessions
    expect(checkoutFlow).toContain('sessions.length > 0');
    expect(checkoutFlow).toContain('session-tab-chips-grid');
    expect(checkoutFlow).toContain('session-tab-chip-card');
    expect(checkoutFlow).toContain('session-tab-chip-single');
    expect(checkoutFlow).not.toContain('sessions.length === 1 && (');
    expect(checkoutFlow).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toMatch(
      /\.session-tab-chips-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*250px\),\s*320px\)\);/,
    );
    expect(globalsCss).toContain('.session-tab-chip-single');
  });
});
