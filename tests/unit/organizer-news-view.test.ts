import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer News Management & Live Preview Modal (D-81)', () => {
  const rootDir = process.cwd();

  it('wires OrganizerNewsView into OrganizerWorkspaceView for news section', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('OrganizerNewsView');
    expect(workspaceContent).toContain("activeSection === 'news'");
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('defines OrganizerNewsView with status tabs, horizontal editorial cards, and zero emojis', () => {
    const compContent = readFileSync(
      join(rootDir, 'src/components/organizer-news-view.tsx'),
      'utf8',
    );
    expect(compContent).toContain('news-status-tabs');
    expect(compContent).toContain('news-editorial-card');
    expect(compContent).toContain('news-card-badges-row');
    expect(compContent).toContain('news-card-actions-col');
    expect(compContent).toContain('btn-preview');
    expect(compContent).toContain('btn-edit');
    expect(compContent).toContain('btn-submit');
    expect(compContent).toContain('btn-delete');
    expect(compContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements Editor Modal Popup (แบบ 2) with 16:9 cover dropzone, fields, and action buttons', () => {
    const compContent = readFileSync(
      join(rootDir, 'src/components/organizer-news-view.tsx'),
      'utf8',
    );
    expect(compContent).toContain('news-editor-modal-backdrop');
    expect(compContent).toContain('news-editor-modal-card');
    expect(compContent).toContain('editor-modal-title');
    expect(compContent).toContain('cover-dropzone-box');
    expect(compContent).toContain('modal-news-title-input');
    expect(compContent).toContain('modal-news-category-select');
    expect(compContent).toContain('modal-news-concert-select');
    expect(compContent).toContain('modal-news-content-textarea');
    expect(compContent).toContain('btn-form-preview');
    expect(compContent).toContain('btn-form-draft');
    expect(compContent).toContain('btn-form-submit');
    expect(compContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('provides an interactive Live Preview Modal mimicking public /news/[id] articles', () => {
    const compContent = readFileSync(
      join(rootDir, 'src/components/organizer-news-view.tsx'),
      'utf8',
    );
    expect(compContent).toContain('news-preview-modal-backdrop');
    expect(compContent).toContain('news-preview-modal-card');
    expect(compContent).toContain('preview-article-title');
    expect(compContent).toContain('preview-article-content');
    expect(compContent).toContain('preview-modal-footer-close-btn');
    expect(compContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements 16:9 dashed dropzone and smart blurred backdrop preview (D-82)', () => {
    const compContent = readFileSync(
      join(rootDir, 'src/components/organizer-news-view.tsx'),
      'utf8',
    );
    expect(compContent).toContain('dropzone-ratio-indicator');
    expect(compContent).toContain('สัดส่วน 16:9 แนวนอน');
    expect(compContent).toContain('cover-preview-blur-bg');
    expect(compContent).toContain('cover-preview-main-img');
    expect(compContent).toContain('preview-article-blur-bg');
    expect(compContent).toContain('preview-article-main-img');
    expect(compContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements clean no-thumbnail layout for management list and black TICKET logo fallback in preview (D-83, D-84)', () => {
    const compContent = readFileSync(
      join(rootDir, 'src/components/organizer-news-view.tsx'),
      'utf8',
    );
    // News editorial cards do not contain thumbnails in the management list (D-84)
    expect(compContent).not.toContain('news-thumbnail-canvas');
    expect(compContent).not.toContain('news-editorial-placeholder');
    expect(compContent).toContain('news-editorial-card');
    expect(compContent).toContain('news-card-body');
    expect(compContent).toContain('news-card-actions-col');

    // Live preview modal still provides black TICKET logo fallback (D-83) and 16:9 blurred backdrop (D-82)
    expect(compContent).toContain('placeholder-logo-lockup');
    expect(compContent).toContain('placeholder-logo-text');
    expect(compContent).toContain('preview-article-cover-placeholder');
    expect(compContent).toContain('preview-article-blur-bg');
    expect(compContent).toContain('preview-article-main-img');
    expect(compContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('includes styling rules for organizer news management, 16:9 blurred backdrop and black logo fallback in globals.css (D-81, D-82, D-83, D-84)', () => {
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.organizer-news-page');
    expect(cssContent).toContain('.news-editorial-card');
    expect(cssContent).toContain('.news-editor-modal-card');
    expect(cssContent).toContain('.news-preview-modal-card');
    expect(cssContent).toContain('.cover-dropzone-box');
    expect(cssContent).toContain('aspect-ratio: 16 / 9');
    expect(cssContent).toContain('.cover-preview-blur-bg');
    expect(cssContent).toContain('.cover-preview-main-img');
    expect(cssContent).toContain('.preview-article-blur-bg');
    expect(cssContent).toContain('.preview-article-main-img');
    expect(cssContent).toContain('.placeholder-logo-lockup');
    expect(cssContent).toContain('.placeholder-logo-text');
  });
});
