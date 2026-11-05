import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadPayoutAccounts,
  getPrimaryPayoutAccount,
} from '../../src/lib/organizer-payout-sync';
import {
  loadOwnerContactInfo,
} from '../../src/lib/owner-contact-sync';

describe('D-204 to D-209: Settings, Finance, and Contact Refinements & Real-Time Synchronization', () => {
  const rootDir = process.cwd();

  it('verifies D-204: Settings form inputs expand to full width (width: 100%, no max-width: 560px constraint)', () => {
    const css = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(css).toMatch(/\.settings-form\s*\{[^}]*width:\s*100%/);
    expect(css).not.toMatch(/\.settings-form\s*\{[^}]*max-width:\s*560px/);
  });

  it('verifies D-205: Removes jump toolbar and "ไปที่การ์ด:" from Organizer Settings View', () => {
    const settingsSrc = readFileSync(
      join(rootDir, 'src/components/organizer-settings-view.tsx'),
      'utf8',
    );
    expect(settingsSrc).not.toContain('settings-jump-toolbar');
    expect(settingsSrc).not.toContain('ไปที่การ์ด:');
    expect(settingsSrc).not.toContain('handleScrollToSection');
  });

  it('verifies D-206: Real-time Payout Account synchronization between Settings and Finance View', () => {
    // 1. Check helper functions in organizer-payout-sync.ts
    const initialAccounts = loadPayoutAccounts();
    expect(initialAccounts.length).toBeGreaterThanOrEqual(1);
    const primary = getPrimaryPayoutAccount(initialAccounts);
    expect(primary.isPrimary).toBe(true);
    expect(primary.bankName).toContain('กสิกรไทย');

    // 2. Settings View imports and utilizes sync
    const settingsSrc = readFileSync(
      join(rootDir, 'src/components/organizer-settings-view.tsx'),
      'utf8',
    );
    expect(settingsSrc).toContain('loadPayoutAccounts');
    expect(settingsSrc).toContain('savePayoutAccounts');
    expect(settingsSrc).toContain('EVENT_PAYOUT_ACCOUNTS_CHANGED');

    // 3. Finance View displays synced Payout Account Card
    const financeSrc = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    expect(financeSrc).toContain('loadPayoutAccounts');
    expect(financeSrc).toContain('getPrimaryPayoutAccount');
    expect(financeSrc).toContain('finance-payout-account-card');
    expect(financeSrc).toContain('บัญชีธนาคารสำหรับรับเงิน (Payout Accounts)');
    expect(financeSrc).toContain('จัดการบัญชีในหน้าตั้งค่า →');
    expect(financeSrc).toContain('primaryPayoutAccount.accountNumber');
    expect(financeSrc).toContain('primaryPayoutAccount.accountName');
  });

  it('verifies D-207: Removes buggy floating back to top button from Organizer Contact View', () => {
    const contactSrc = readFileSync(
      join(rootDir, 'src/components/organizer-contact-view.tsx'),
      'utf8',
    );
    expect(contactSrc).not.toContain('settings-floating-top-btn');
    expect(contactSrc).not.toContain('showScrollTop');
  });

  it('verifies D-208: Admin/Owner contact information manager and dynamic reflection in organizer view', () => {
    // 1. Helper library tests
    const defaultInfo = loadOwnerContactInfo();
    expect(defaultInfo.hotline).toContain('02-123-4567');
    expect(defaultInfo.email).toBe('organizer-support@ticket.co.th');
    expect(defaultInfo.lineId).toBe('@ticket-organizer');
    expect(defaultInfo.operatingHours).toContain('09:00 - 18:00');
    expect(defaultInfo.address).toContain('สุขุมวิท');

    // 2. Owner Workspace View incorporates OwnerContactInfoManager
    const ownerWorkspaceSrc = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    expect(ownerWorkspaceSrc).toContain('OwnerContactInfoManager');
    expect(ownerWorkspaceSrc).toContain("'owner-contact-info-manager': 'system'");
    expect(ownerWorkspaceSrc).toContain('href="#owner-contact-info-manager"');

    // 3. OwnerContactInfoManager component structure
    const managerSrc = readFileSync(
      join(rootDir, 'src/components/owner-contact-info-manager.tsx'),
      'utf8',
    );
    expect(managerSrc).toContain('จัดการข้อมูลติดต่อเจ้าของระบบ');
    expect(managerSrc).toContain('owner-contact-hotline');
    expect(managerSrc).toContain('owner-contact-email');
    expect(managerSrc).toContain('owner-contact-line');
    expect(managerSrc).toContain('owner-contact-hours');
    expect(managerSrc).toContain('owner-contact-address');
    expect(managerSrc).toContain('saveOwnerContactInfo');
    expect(managerSrc).toContain('resetOwnerContactInfo');

    // 4. OrganizerContactView reflects owner contact info dynamically
    const contactSrc = readFileSync(
      join(rootDir, 'src/components/organizer-contact-view.tsx'),
      'utf8',
    );
    expect(contactSrc).toContain('loadOwnerContactInfo');
    expect(contactSrc).toContain('EVENT_OWNER_CONTACT_CHANGED');
    expect(contactSrc).toContain('contactInfo.hotline');
    expect(contactSrc).toContain('contactInfo.email');
    expect(contactSrc).toContain('contactInfo.lineId');
    expect(contactSrc).toContain('contactInfo.operatingHours');
    expect(contactSrc).toContain('contactInfo.address');
  });

  it('verifies D-209: Removes direct message form and centers official contact channels', () => {
    const contactSrc = readFileSync(
      join(rootDir, 'src/components/organizer-contact-view.tsx'),
      'utf8',
    );
    expect(contactSrc).not.toContain('contact-form-column');
    expect(contactSrc).not.toContain('contact-direct-form');
    expect(contactSrc).not.toContain('ส่งข้อความตรงถึงเจ้าของระบบ');
    expect(contactSrc).toContain('contact-centered-grid');

    const css = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(css).toMatch(/\.contact-centered-grid\s*\{[^}]*max-width:\s*820px/);
  });

  it('ensures 100% Zero Emojis (D-14) compliance across all touched files', () => {
    const files = [
      'src/lib/organizer-payout-sync.ts',
      'src/lib/owner-contact-sync.ts',
      'src/components/organizer-settings-view.tsx',
      'src/components/organizer-finance-view.tsx',
      'src/components/organizer-contact-view.tsx',
      'src/components/owner-workspace-view.tsx',
      'src/components/owner-contact-info-manager.tsx',
      'src/app/globals.css',
      'docs/requirement.md',
    ];

    for (const relPath of files) {
      const content = readFileSync(join(rootDir, relPath), 'utf8');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
