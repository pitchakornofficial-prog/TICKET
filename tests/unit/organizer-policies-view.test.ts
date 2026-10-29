import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Organizer Policies & Agreements View (D-111)', () => {
  const rootDir = process.cwd();

  it('wires OrganizerPoliciesView into OrganizerWorkspaceView for policies section', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/organizer-workspace-view.tsx'),
      'utf8',
    );
    expect(workspaceContent).toContain('OrganizerPoliciesView');
    expect(workspaceContent).toContain("activeSection === 'policies'");
    expect(workspaceContent).toContain('organizer-nav-policies');
    expect(workspaceContent).toContain('ข้อตกลง');
    expect(workspaceContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('defines OrganizerPoliciesView with header, window.print button, and zero emojis', () => {
    const policiesContent = readFileSync(
      join(rootDir, 'src/components/organizer-policies-view.tsx'),
      'utf8',
    );
    expect(policiesContent).toContain('policies-management-container');
    expect(policiesContent).toContain('policies-management-header');
    expect(policiesContent).toContain('ข้อตกลงและเงื่อนไขการให้บริการสำหรับผู้จัดงาน');
    expect(policiesContent).toContain('policies-print-btn');
    expect(policiesContent).toContain('window.print()');
    expect(policiesContent).toContain('PrinterIcon');
    expect(policiesContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('provides category filter tabs and real-time search in OrganizerPoliciesView', () => {
    const policiesContent = readFileSync(
      join(rootDir, 'src/components/organizer-policies-view.tsx'),
      'utf8',
    );
    expect(policiesContent).toContain('policies-category-tabs');
    expect(policiesContent).toContain('policies-category-tab');
    expect(policiesContent).toContain('policies-tab-count');
    expect(policiesContent).toContain('policy-tab-all');
    expect(policiesContent).toContain('policy-tab-finance');
    expect(policiesContent).toContain('policy-tab-amendment');
    expect(policiesContent).toContain('policy-tab-scanning');
    expect(policiesContent).toContain('policy-tab-legal');
    expect(policiesContent).toContain('policies-search-input');
    expect(policiesContent).toContain('policies-search-clear-btn');
  });

  it('contains all 4 core business rule categories with key takeaways and full terms', () => {
    const policiesContent = readFileSync(
      join(rootDir, 'src/components/organizer-policies-view.tsx'),
      'utf8',
    );

    // 1. Finance category
    expect(policiesContent).toContain('การเงิน ค่าธรรมเนียม และรอบจ่ายเงิน');
    expect(policiesContent).toContain('หักค่าบริการแพลตฟอร์ม 3%');
    expect(policiesContent).toContain('5% สำหรับราคาบัตรทั่วไป');
    expect(policiesContent).toContain('ทุกวันจันทร์สัปดาห์ถัดไป');
    expect(policiesContent).toContain('ภาระหนี้สินคงค้าง');

    // 2. Amendment & Cancellation category
    expect(policiesContent).toContain('การแก้ไขราคา รอบการแสดง และการยกเลิกงาน');
    expect(policiesContent).toContain('ยื่นขอปรับเปลี่ยนเวลาการแสดง');
    expect(policiesContent).toContain('14 วัน');
    expect(policiesContent).toContain('คืนเงินให้ผู้ซื้อ 100%');

    // 3. Scanner & Doors category
    expect(policiesContent).toContain('ระบบสแกนเนอร์และการควบคุมประตู');
    expect(policiesContent).toContain('ผูกใช้งานได้เพียง 1 อุปกรณ์เท่านั้น');
    expect(policiesContent).toContain('เครื่องหลักโหมดออฟไลน์ได้เพียง 1 เครื่องต่อคอนเสิร์ต');
    expect(policiesContent).toContain('Re-entry');

    // 4. Legal & PDPA category
    expect(policiesContent).toContain('ความรับผิดชอบทางกฎหมายและข้อมูลส่วนบุคคล');
    expect(policiesContent).toContain('PDPA');
    expect(policiesContent).toContain('Ticket Quota Integrity');
    expect(policiesContent).toContain('ระงับสิทธิ์และการดำเนินคดี');

    // Structure elements
    expect(policiesContent).toContain('policy-editorial-card');
    expect(policiesContent).toContain('policy-takeaways-box');
    expect(policiesContent).toContain('สรุปสาระสำคัญ (Key Takeaways)');
    expect(policiesContent).toContain('ข้อกำหนดและเงื่อนไขฉบับเต็ม');
    expect(policiesContent).toContain('policy-empty-state');
  });

  it('supports D-112 expandable/collapsible full terms and expand/collapse all controls', () => {
    const policiesContent = readFileSync(
      join(rootDir, 'src/components/organizer-policies-view.tsx'),
      'utf8',
    );
    expect(policiesContent).toContain('policies-toolbar-actions');
    expect(policiesContent).toContain('policies-expand-all-btn');
    expect(policiesContent).toContain('policies-collapse-all-btn');
    expect(policiesContent).toContain('ขยายข้อกำหนดทั้งหมด');
    expect(policiesContent).toContain('พับข้อกำหนดทั้งหมด');
    expect(policiesContent).toContain('policy-toggle-terms-btn');
    expect(policiesContent).toContain('ChevronDownIcon');
    expect(policiesContent).toContain('ChevronUpIcon');
  });

  it('includes proper CSS styling and @media print rules in globals.css', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(cssContent).toContain('.policies-management-container');
    expect(cssContent).toContain('.policies-print-btn');
    expect(cssContent).toContain('.policy-editorial-card');
    expect(cssContent).toContain('.policy-takeaways-box');
    expect(cssContent).toContain('.policy-toggle-terms-btn');
    expect(cssContent).toContain('.policy-terms-block.is-collapsed');
    expect(cssContent).toContain('.policy-terms-block.is-expanded');
    expect(cssContent).toContain('@media print');
    expect(cssContent).toContain('.policies-print-btn');
  });
});
