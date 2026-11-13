import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer Contact Owner Workspace (D-85, D-207, D-208, D-209)', () => {
  const rootDir = process.cwd();

  it('wires OrganizerContactView and contact tab into OrganizerWorkspaceView', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('OrganizerContactView');
    expect(workspaceContent).toContain("activeSection === 'contact'");
    expect(workspaceContent).toContain('organizer-nav-contact');
    expect(workspaceContent).toContain('ติดต่อเจ้าของ');
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('renders official contact channels with hotline, email, line, operating hours, and office address synced from central state (D-208)', () => {
    const contactContent = readFileSync(
      join(rootDir, 'src/components/organizer-contact-view.tsx'),
      'utf8',
    );
    expect(contactContent).toContain('สายด่วนผู้จัดงาน');
    expect(contactContent).toContain('อีเมลฝ่ายประสานงานผู้จัด');
    expect(contactContent).toContain('LINE Official Account');
    expect(contactContent).toContain('เวลาทำการของฝ่ายปฏิบัติการ');
    expect(contactContent).toContain('ที่อยู่สำนักงานใหญ่ (Headquarters)');
    expect(contactContent).toContain('loadSharedOwnerContactInfo');
    expect(contactContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('removes direct message form (D-209) and buggy floating back to top button (D-207)', () => {
    const contactContent = readFileSync(
      join(rootDir, 'src/components/organizer-contact-view.tsx'),
      'utf8',
    );
    // Removed direct message form (D-209)
    expect(contactContent).not.toContain('contact-topic-select');
    expect(contactContent).not.toContain('contact-concert-select');
    expect(contactContent).not.toContain('contact-subject-input');
    expect(contactContent).not.toContain('contact-message-textarea');
    expect(contactContent).not.toContain('contact-submit-btn');
    expect(contactContent).not.toContain('ส่งข้อความตรงถึงเจ้าของระบบ');

    // Removed floating back to top button (D-207)
    expect(contactContent).not.toContain('settings-floating-top-btn');
    expect(contactContent).not.toContain('showScrollTop');
    expect(contactContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('includes styling rules for organizer contact owner workspace in globals.css', () => {
    const cssContent = (`${readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    )}\n${readFileSync(join(rootDir, 'src/app/globals.css').replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
    expect(cssContent).toContain('.organizer-contact-page');
    expect(cssContent).toContain('.contact-page-container');
    expect(cssContent).toContain('.contact-content-grid');
    expect(cssContent).toContain('.channel-item');
    expect(cssContent).toContain('.contact-centered-grid');
  });
});
