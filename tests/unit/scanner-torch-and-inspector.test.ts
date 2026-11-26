import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Scanner and Inspector Flashlight (Torch) Functionality', () => {
  const rootDir = process.cwd();
  const iconsFile = readFileSync(join(rootDir, 'src/components/icons.tsx'), 'utf8');
  const terminalFile = readFileSync(join(rootDir, 'src/components/scanner-admission-terminal.tsx'), 'utf8');
  const inspectorFile = readFileSync(join(rootDir, 'src/components/ticket-inspector-view.tsx'), 'utf8');
  const backOfficeCss = readFileSync(join(rootDir, 'src/app/back-office/back-office.css'), 'utf8');
  const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

  it('exports FlashlightIcon in icons.tsx', () => {
    expect(iconsFile).toContain('export function FlashlightIcon(');
  });

  it('implements torch control in scanner admission terminal with toolbar and floating buttons', () => {
    // 1. Flashlight icon imported
    expect(terminalFile).toContain('FlashlightIcon');

    // 2. State & toggle handler
    expect(terminalFile).toContain('torchActive');
    expect(terminalFile).toContain('handleToggleTorch');
    expect(terminalFile).toContain("torch: nextTorch");

    // 3. Toolbar toggle button
    expect(terminalFile).toContain('data-testid="toggle-torch-btn"');
    expect(terminalFile).toContain('torch-toggle-btn');

    // 4. Floating viewfinder button
    expect(terminalFile).toContain('data-testid="viewfinder-floating-torch-btn"');
    expect(terminalFile).toContain('viewfinder-floating-torch-btn');
  });

  it('implements torch control in ticket inspector view with toolbar and floating buttons', () => {
    // 1. Flashlight icon imported
    expect(inspectorFile).toContain('FlashlightIcon');

    // 2. State & toggle handler
    expect(inspectorFile).toContain('torchActive');
    expect(inspectorFile).toContain('handleToggleTorch');
    expect(inspectorFile).toContain("torch: nextTorch");

    // 3. Toolbar button
    expect(inspectorFile).toContain('data-testid="inspector-toggle-torch-btn"');

    // 4. Floating video frame button
    expect(inspectorFile).toContain('data-testid="inspector-floating-torch-btn"');
  });

  it('includes proper CSS styling for flashlight buttons in back-office and globals CSS', () => {
    // Toolbar torch button active styles in back-office.css
    expect(backOfficeCss).toMatch(/\.camera-icon-toggle-btn\.torch-toggle-btn\.active\s*\{/);

    // Viewfinder floating torch button styles in globals.css
    expect(globalsCss).toMatch(/\.viewfinder-floating-torch-btn\s*\{/);
    expect(globalsCss).toMatch(/\.viewfinder-floating-torch-btn\.active\s*\{/);
  });

  it('maintains strict zero emojis (Rule D-14) in all modified scanner and inspector files', () => {
    const files = [
      iconsFile,
      terminalFile,
      inspectorFile,
    ];

    for (const content of files) {
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
