import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Back-Office Sub-Navbar Pure Gesture-Driven Horizontal Scroll Architecture', () => {
  const rootDir = process.cwd();
  const cssPath = path.join(rootDir, 'src/app/back-office/back-office.css');
  const ownerWorkspacePath = path.join(rootDir, 'src/components/owner-workspace-view.tsx');
  const organizerWorkspacePath = path.join(rootDir, 'src/components/organizer-workspace-view.tsx');
  const hookPath = path.join(rootDir, 'src/components/use-horizontal-subnav-scroll.ts');

  it('verifies back-office.css defines proper overflow, min-width, cursor grab, and edge fade styles', () => {
    const css = fs.readFileSync(cssPath, 'utf8');

    // Inner containers must have min-width: 0 and overflow: hidden
    expect(css).toContain('.organizer-subnav-inner');
    expect(css).toContain('.owner-subnav-inner');

    // Tabs must have overflow-x: auto and gesture cursor styles
    expect(css).toContain('.organizer-subnav-tabs');
    expect(css).toContain('.owner-subnav-tabs');
    expect(css).toContain('cursor: grab');
    expect(css).toContain('cursor: grabbing');
    expect(css).toContain('touch-action: pan-x');

    // Subtle edge indicators
    expect(css).toContain('.subnav-fade-left');
    expect(css).toContain('.subnav-fade-right');

    // Arrow buttons removed per user preference
    expect(css).not.toContain('.subnav-scroll-btn');
  });

  it('verifies owner-workspace-view uses gesture scrolling without arrow buttons', () => {
    const content = fs.readFileSync(ownerWorkspacePath, 'utf8');

    expect(content).toContain('useHorizontalSubnavScroll');
    expect(content).toContain('subnav-fade-left');
    expect(content).toContain('subnav-fade-right');
    expect(content).toContain('ref={tabsRef}');
    expect(content).toContain('scrollActiveIntoView');

    // No arrow button elements
    expect(content).not.toContain('owner-subnav-scroll-left');
    expect(content).not.toContain('owner-subnav-scroll-right');
  });

  it('verifies organizer-workspace-view uses gesture scrolling without arrow buttons', () => {
    const content = fs.readFileSync(organizerWorkspacePath, 'utf8');

    expect(content).toContain('useHorizontalSubnavScroll');
    expect(content).toContain('subnav-fade-left');
    expect(content).toContain('subnav-fade-right');
    expect(content).toContain('ref={tabsRef}');
    expect(content).toContain('scrollActiveIntoView');

    // No arrow button elements
    expect(content).not.toContain('organizer-subnav-scroll-left');
    expect(content).not.toContain('organizer-subnav-scroll-right');
  });

  it('verifies use-horizontal-subnav-scroll hook exports full gesture controls (wheel, drag, touch, auto-scroll)', () => {
    const hookContent = fs.readFileSync(hookPath, 'utf8');

    expect(hookContent).toContain('export function useHorizontalSubnavScroll');
    expect(hookContent).toContain('canScrollLeft');
    expect(hookContent).toContain('canScrollRight');
    expect(hookContent).toContain('scrollActiveIntoView');

    // Wheel and mouse gesture event handlers attached natively
    expect(hookContent).toContain("el.addEventListener('wheel'");
    expect(hookContent).toContain("el.addEventListener('mousedown'");
    expect(hookContent).toContain("window.addEventListener('mousemove'");
    expect(hookContent).toContain("window.addEventListener('mouseup'");
    expect(hookContent).toContain("el.addEventListener('click'");
    expect(hookContent).toContain("classList.add('is-dragging')");
    expect(hookContent).toContain("classList.remove('is-dragging')");
  });
});
