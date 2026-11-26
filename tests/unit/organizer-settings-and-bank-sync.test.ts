import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('Organizer Settings Real Security, QR Upload & Admin Bank Sync', () => {
  const rootDir = process.cwd();

  it('removes mock defaults and wires real password change, QR upload, and modern UI in OrganizerSettingsView', () => {
    const settingsSrc = readFileSync(
      join(rootDir, 'src/components/organizer-settings-view.tsx'),
      'utf8',
    );

    expect(settingsSrc).not.toContain('สมชาย ผู้จัดงาน');
    expect(settingsSrc).not.toContain('วิภาดา การเงิน');
    expect(settingsSrc).not.toContain('URL.createObjectURL');
    expect(settingsSrc).not.toMatch(/\balert\(/);

    expect(settingsSrc).toContain('/api/auth/change-password');
    expect(settingsSrc).toContain('revokeOtherSessions');
    expect(settingsSrc).toContain("fetch('/api/upload'");
    expect(settingsSrc).toContain('#section-profile');
    expect(settingsSrc).toContain('#section-security');
    expect(settingsSrc).toContain('#section-payout');
    expect(settingsSrc).toContain('คัดลอกเลขบัญชี');
    expect(settingsSrc).toContain('ซิงก์เป็นบัญชีรับเงินปลายทางในหน้าการเงินแอดมินแล้ว');
    expect(settingsSrc).not.toContain('primary-button');
    expect(settingsSrc).not.toContain('variant="primary"');
    expect(settingsSrc).toContain('settings-outline-btn-primary');
    expect(settingsSrc).toContain('settings-outline-btn-sm');
    expect(settingsSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('syncs organizer payout account updates to events and displays live account + QR in OwnerFinanceHub', () => {
    const financeServerSrc = readFileSync(
      join(rootDir, 'src/server/organizer-finance.ts'),
      'utf8',
    );
    const reportsSrc = readFileSync(
      join(rootDir, 'src/server/reports.ts'),
      'utf8',
    );
    const ownerHubSrc = readFileSync(
      join(rootDir, 'src/components/owner-finance-hub.tsx'),
      'utf8',
    );

    expect(financeServerSrc).toContain('syncPayoutAccountChangesToEvents');
    expect(reportsSrc).toContain('FROM organizer_payout_accounts');
    expect(reportsSrc).toContain('payoutQrCodeUrl');
    expect(ownerHubSrc).toContain('payoutQrCodeUrl');
    expect(ownerHubSrc).toContain('ดู QR รับเงิน');
    expect(ownerHubSrc).toContain('ซิงก์จากบัญชีผู้จัดงานแล้ว');
  });

  it('keeps OrganizerFinanceView (#finance) synced with PostgreSQL payout accounts and avoids infinite refresh loops', () => {
    const financeViewSrc = readFileSync(
      join(rootDir, 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    const payoutSyncSrc = readFileSync(
      join(rootDir, 'src/lib/organizer-payout-sync.ts'),
      'utf8',
    );

    expect(payoutSyncSrc).toContain('prev !== serialized');
    expect(payoutSyncSrc).toContain("options?.emitEvent !== false");
    expect(financeViewSrc).toContain('savePayoutAccounts(accs, { emitEvent: false })');
    expect(financeViewSrc).not.toContain('savePayoutAccounts(accs);');
    expect(financeViewSrc).toContain('EVENT_PAYOUT_ACCOUNTS_CHANGED');
    expect(financeViewSrc).toContain('void loadEvents()');
    expect(financeViewSrc).toContain('primaryPayoutAccount.qrCodeUrl');
    expect(financeViewSrc).toContain('ดู QR รับเงิน');
    expect(financeViewSrc).toContain('ซิงก์กับบัญชีหลักแล้ว');
  });
});
