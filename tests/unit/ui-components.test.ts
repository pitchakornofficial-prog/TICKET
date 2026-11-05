import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Unified Atomic UI Design System (D-117)', () => {
  const rootDir = process.cwd();
  const uiDir = join(rootDir, 'src/components/ui');

  it('exports all atomic components from barrel file', () => {
    const indexPath = join(uiDir, 'index.ts');
    expect(existsSync(indexPath)).toBe(true);

    const indexContent = readFileSync(indexPath, 'utf8');
    expect(indexContent).toContain("export * from './button';");
    expect(indexContent).toContain("export * from './modal';");
    expect(indexContent).toContain("export * from './input';");
    expect(indexContent).toContain("export * from './select';");
    expect(indexContent).toContain("export * from './textarea';");
    expect(indexContent).toContain("export * from './badge';");
    expect(indexContent).toContain("export * from './card';");
    expect(indexContent).toContain("export * from './tabs';");
  });

  it('ensures zero emojis (D-14) across all UI component files', () => {
    const files = [
      'button.tsx',
      'modal.tsx',
      'input.tsx',
      'select.tsx',
      'textarea.tsx',
      'badge.tsx',
      'card.tsx',
      'tabs.tsx',
      'index.ts',
    ];

    for (const file of files) {
      const content = readFileSync(join(uiDir, file), 'utf8');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('verifies Button component structure, variants, and accessible loading spinner', () => {
    const content = readFileSync(join(uiDir, 'button.tsx'), 'utf8');
    expect(content).toContain('export const Button');
    expect(content).toContain("variant = 'primary'");
    expect(content).toContain("size = 'md'");
    expect(content).toContain('ui-btn-');
    expect(content).toContain('variant');
    expect(content).toContain("'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'");
    expect(content).toContain('ui-btn-spinner');
    expect(content).toContain('aria-busy');
  });

  it('verifies Modal component accessibility, backdrop, and keyboard shortcuts', () => {
    const content = readFileSync(join(uiDir, 'modal.tsx'), 'utf8');
    expect(content).toContain('export function Modal');
    expect(content).toContain('role="dialog"');
    expect(content).toContain('aria-modal="true"');
    expect(content).toContain('closeOnEscape');
    expect(content).toContain('ui-modal-backdrop');
    expect(content).toContain('ui-modal-dialog');
    expect(content).toContain('ui-modal-close-btn');
    expect(content).toContain('aria-label="ปิดหน้าต่าง"');
  });

  it('verifies Input, Select, and Textarea form controls and error messaging', () => {
    const inputContent = readFileSync(join(uiDir, 'input.tsx'), 'utf8');
    expect(inputContent).toContain('export const Input');
    expect(inputContent).toContain('ui-input-has-error');
    expect(inputContent).toContain('aria-invalid');
    expect(inputContent).toContain('role="alert"');

    const selectContent = readFileSync(join(uiDir, 'select.tsx'), 'utf8');
    expect(selectContent).toContain('export const Select');
    expect(selectContent).toContain('ui-select-arrow');
    expect(selectContent).toContain('ui-select-has-error');

    const textareaContent = readFileSync(join(uiDir, 'textarea.tsx'), 'utf8');
    expect(textareaContent).toContain('export const Textarea');
    expect(textareaContent).toContain('ui-textarea-has-error');
  });

  it('verifies Badge component variants, sizes, and dot indicator', () => {
    const content = readFileSync(join(uiDir, 'badge.tsx'), 'utf8');
    expect(content).toContain('export function Badge');
    expect(content).toContain('ui-badge');
    expect(content).toContain('ui-badge-dot');
    expect(content).toContain('neutral');
    expect(content).toContain('success');
    expect(content).toContain('warning');
    expect(content).toContain('danger');
    expect(content).toContain('info');
    expect(content).toContain('brand');
  });

  it('verifies Card and subcomponent composite layout', () => {
    const content = readFileSync(join(uiDir, 'card.tsx'), 'utf8');
    expect(content).toContain('export function Card');
    expect(content).toContain('export function CardHeader');
    expect(content).toContain('export function CardTitle');
    expect(content).toContain('export function CardDescription');
    expect(content).toContain('export function CardContent');
    expect(content).toContain('export function CardFooter');
    expect(content).toContain('ui-card-interactive');
  });

  it('verifies Tabs context, ARIA roles, and keyboard navigation support', () => {
    const content = readFileSync(join(uiDir, 'tabs.tsx'), 'utf8');
    expect(content).toContain('export function Tabs');
    expect(content).toContain('export function TabList');
    expect(content).toContain('export function TabTrigger');
    expect(content).toContain('export function TabContent');
    expect(content).toContain('role="tablist"');
    expect(content).toContain('role="tab"');
    expect(content).toContain('role="tabpanel"');
    expect(content).toContain('aria-selected');
    expect(content).toContain('aria-controls');
  });

  it('verifies unified CSS tokens and classes are present in globals.css', () => {
    const css = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(css).toContain('UNIFIED ATOMIC DESIGN SYSTEM COMPONENTS (D-117)');
    expect(css).toContain('.ui-btn');
    expect(css).toContain('.ui-btn-primary');
    expect(css).toContain('.ui-modal-backdrop');
    expect(css).toContain('.ui-input');
    expect(css).toContain('.ui-select');
    expect(css).toContain('.ui-textarea');
    expect(css).toContain('.ui-badge');
    expect(css).toContain('.ui-card');
    expect(css).toContain('.ui-tabs');
    expect(css).toContain('.ui-tab-trigger-active');
  });

  it('verifies OrderSuccessView minimalist ticket pass parity with D-167', () => {
    const content = readFileSync(join(rootDir, 'src/components/order-success-view.tsx'), 'utf8');

    // 1. Pure white pass, no background image linear-gradient
    expect(content).not.toContain('backgroundImage: linear-gradient');
    expect(content).not.toContain('tkt.ticketTemplateUrl || tkt.eventPosterUrl');

    // 2. Eliminates decorative noise and badges
    expect(content).not.toContain('stub-number-tag');
    expect(content).not.toContain('พร้อมใช้งาน');
    expect(content).not.toContain('SCAN FOR ENTRY');
    expect(content).not.toContain('stub-scan-instruction');

    // 3. Zone name without price
    expect(content).toContain('{tkt.ticketTypeName}');
    expect(content).not.toContain('{tkt.ticketTypeName} · {formatBaht(tkt.ticketPrice)}');

    // 4. Straight dashed divider with test-compatible classes
    expect(content).toContain('stub-divider-straight stub-notch-divider');
    expect(content).not.toContain('stub-notch-top');
    expect(content).not.toContain('stub-notch-bottom');

    // 5. Bilingual labels and metadata
    expect(content).toContain('วันและเวลาแสดง (DATE & TIME)');
    expect(content).toContain('สถานที่จัดงาน (VENUE)');
    expect(content).toContain('ผู้สั่งซื้อ (BUYER)');
    expect(content).toContain('รหัสบัตร (TICKET CODE)');
    expect(content).toContain('หมายเลขคำสั่งซื้อ (ORDER ID)');

    // 6. Direct image rendering from canvas data url (D-165, D-168)
    expect(content).toContain('generateTicketDataUrl');
    expect(content).toContain('ticketImageUrls');
    expect(content).toContain('classic-ticket-img');

    // 7. Zero Emojis (D-14)
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  describe('D-172: Long Buyer Flow Pages Universal Floating Back-to-Top Button', () => {
    it('verifies FloatingBackToTop component implementation and properties', () => {
      const rootDir = process.cwd();
      const compPath = join(rootDir, 'src/components/floating-back-to-top.tsx');
      expect(existsSync(compPath)).toBe(true);

      const compSource = readFileSync(compPath, 'utf8');
      expect(compSource).toContain('export function FloatingBackToTop');
      expect(compSource).toContain('hasStickyBar');
      expect(compSource).toContain('window.scrollTo');
      expect(compSource).toContain("behavior: 'smooth'");
      expect(compSource).toContain('title="กลับสู่ด้านบนสุด"');
      expect(compSource).toContain('aria-label="กลับสู่ด้านบนสุด"');
      expect(compSource).toContain('<line x1="12" y1="19" x2="12" y2="5" />');
      expect(compSource).toContain('<polyline points="5 12 12 5 19 12" />');
      expect(compSource).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('verifies stylesheet rules for standard and sticky-bar offset Back-to-Top button', () => {
      const rootDir = process.cwd();
      const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

      expect(globalsCss).toContain('.floating-back-to-top {');
      expect(globalsCss).toContain('.floating-back-to-top.has-sticky-bar {');
      expect(globalsCss).toContain('.floating-back-to-top-icon {');
      expect(globalsCss).toMatch(/\.floating-back-to-top\.has-sticky-bar\s*\{[^}]*bottom:\s*6rem;/);
      expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*\.floating-back-to-top\.has-sticky-bar\s*\{[^}]*bottom:\s*5\.25rem;/);
      expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('verifies integration across all four target buyer flow pages', () => {
      const rootDir = process.cwd();

      // 1. Event Detail Page (/events/[id])
      const eventDetailSource = readFileSync(
        join(rootDir, 'src/app/events/[id]/page.tsx'),
        'utf8',
      );
      expect(eventDetailSource).toContain('FloatingBackToTop');
      expect(eventDetailSource).toContain('hasStickyBar');
      expect(eventDetailSource).toContain('event-detail-back-to-top-btn');

      // 2. Event Checkout Flow (/events/[id]/checkout)
      const checkoutSource = readFileSync(
        join(rootDir, 'src/components/event-checkout-flow.tsx'),
        'utf8',
      );
      expect(checkoutSource).toContain('FloatingBackToTop');
      expect(checkoutSource).toContain('hasStickyBar');
      expect(checkoutSource).toContain('checkout-back-to-top-btn');

      // 3. Order Payment View (/orders/[id]/payment)
      const paymentSource = readFileSync(
        join(rootDir, 'src/components/order-payment-view.tsx'),
        'utf8',
      );
      expect(paymentSource).toContain('FloatingBackToTop');
      expect(paymentSource).toContain('hasStickyBar');
      expect(paymentSource).toContain('payment-back-to-top-btn');

      // 4. Guest Order Lookup View (/my-tickets)
      const lookupSource = readFileSync(
        join(rootDir, 'src/components/guest-order-lookup-view.tsx'),
        'utf8',
      );
      expect(lookupSource).toContain('FloatingBackToTop');
      expect(lookupSource).toContain('lookup-back-to-top-btn');
    });
  });
});
