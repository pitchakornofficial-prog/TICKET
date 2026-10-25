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
});
