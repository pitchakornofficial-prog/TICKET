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
});
