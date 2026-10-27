import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer Contact Owner Workspace (D-85)', () => {
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

  it('renders official contact channels with hotline, email, line, and operating hours', () => {
    const contactContent = readFileSync(
      join(rootDir, 'src/components/organizer-contact-view.tsx'),
      'utf8',
    );
    expect(contactContent).toContain('สายด่วนผู้จัดงาน');
    expect(contactContent).toContain('organizer-support@ticket.co.th');
    expect(contactContent).toContain('@ticket-organizer');
    expect(contactContent).toContain('เวลาทำการของฝ่ายปฏิบัติการ');
    expect(contactContent).toContain('02-123-4567');
    expect(contactContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('provides a direct message form with category dropdown, concert selector, and submit action', () => {
    const contactContent = readFileSync(
      join(rootDir, 'src/components/organizer-contact-view.tsx'),
      'utf8',
    );
    expect(contactContent).toContain('contact-topic-select');
    expect(contactContent).toContain('contact-concert-select');
    expect(contactContent).toContain('contact-subject-input');
    expect(contactContent).toContain('contact-message-textarea');
    expect(contactContent).toContain('contact-submit-btn');
    expect(contactContent).toContain('ส่งข้อความถึงเจ้าของระบบ');
    expect(contactContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('includes styling rules for organizer contact owner workspace in globals.css', () => {
    const cssContent = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(cssContent).toContain('.organizer-contact-page');
    expect(cssContent).toContain('.contact-page-container');
    expect(cssContent).toContain('.contact-content-grid');
    expect(cssContent).toContain('.channel-item');
    expect(cssContent).toContain('.contact-submit-btn');
  });
});
