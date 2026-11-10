import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateConcertCsvSnapshot } from '../../src/lib/concert-csv-snapshot';

describe('D-225 to D-228: Concert Management Hub, Dedicated Analytics, Admin Override & Focus Mode', () => {
  const rootDir = process.cwd();

  it('verifies D-225: Concert Management Hub & 3 Status Filter Tabs in OwnerSessionApprovalManager', () => {
    const componentContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    expect(componentContent).toContain('ศูนย์จัดการและอนุมัติคอนเสิร์ต (Concert Management Hub)');
    expect(componentContent).toContain("statusTab === 'pending'");
    expect(componentContent).toContain("statusTab === 'approved'");
    expect(componentContent).toContain("statusTab === 'rejected'");
    expect(componentContent).toContain('รออนุมัติ');
    expect(componentContent).toContain('อนุมัติแล้ว');
    expect(componentContent).toContain('อื่น ๆ');
    expect(componentContent).toContain('customFeeRate');
    expect(componentContent).toContain('customCustomerFeeRate');
    expect(componentContent).toContain('customUbuPrivilegeFeeRate');
    expect(componentContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies D-226: Dedicated Concert Performance Analytics View with 4 KPI Cards', () => {
    const componentContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    expect(componentContent).toContain('dedicated-concert-analytics-view');
    expect(componentContent).toContain('data-testid="dedicated-concert-analytics"');
    expect(componentContent).toContain('รายได้รวมจากการขายบัตร');
    expect(componentContent).toContain('รายได้สุทธิหลังหักค่าบริการ');
    expect(componentContent).toContain('ยอดจำหน่ายบัตรจริง');
    expect(componentContent).toContain('สิทธิ์พิเศษ โค้ดส่วนลด และคืนบัตร');
    expect(componentContent).toContain('enterprise-analytics-table');
    expect(componentContent).toContain('กลับสู่หน้าจัดการคอนเสิร์ต');
  });

  it('verifies D-227: Admin Override & Audit Trail with RFC 4180 CSV Snapshot', () => {
    const componentContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    expect(componentContent).toContain('audit-trail-history-box');
    expect(componentContent).toContain('editingEvent');
    expect(componentContent).toContain('handleSaveAdminEdit');
    expect(componentContent).toContain('generateConcertCsvSnapshot');
    expect(componentContent).toContain('triggerCsvDownload');

    // Test CSV Snapshot Generation
    const mockConcert = {
      id: 'c-123',
      title: 'UBU Sound Festival "Special Edition"',
      location: 'Main Auditorium, Ubon',
      status: 'approved',
      organizerName: 'Student Council',
      organizerEmail: 'council@ubu.ac.th',
      totalQuota: 1000,
      minPrice: 500,
      maxPrice: 1500,
      organizerFeeRate: 3.0,
      customerFeeRate: 0.0,
      ubuPrivilegeMode: true,
      ageRestriction: 'all_ages',
      refundPolicy: 'standard',
    };

    const csv = generateConcertCsvSnapshot(mockConcert);
    expect(csv).toContain('CONCERT METADATA SNAPSHOT');
    expect(csv).toContain('"Concert ID","c-123"');
    // Verifies RFC 4180 double-quote escaping
    expect(csv).toContain('"Concert Title","UBU Sound Festival ""Special Edition"""');
    expect(csv).toContain('"Location / Venue","Main Auditorium, Ubon"');
  });

  it('verifies D-228: Navigation Focus Mode with Coming-Soon tab pill and banner', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    // D-240 unstyled structural text nav: no coming-soon pill
    expect(workspaceContent).not.toContain('subnav-coming-soon-pill');
    expect(workspaceContent).toContain('owner-subnav-tab');
    expect(workspaceContent).toContain('owner-focus-mode-banner');
    expect(workspaceContent).toContain('เมนูนี้อยู่ระหว่างการปรับปรุงทีละหน้า');
    expect(workspaceContent).toContain('ไปยังหน้าจัดการคอนเสิร์ต');
  });

  it('verifies D-14: Zero Emojis compliance across all modified components', () => {
    const filesToCheck = [
      'src/components/owner-session-approval-manager.tsx',
      'src/components/owner-workspace-view.tsx',
      'src/lib/concert-csv-snapshot.ts',
      'src/app/globals.css',
    ];

    for (const file of filesToCheck) {
      const content = readFileSync(join(rootDir, file), 'utf8');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
