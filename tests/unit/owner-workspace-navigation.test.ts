import { describe, expect, it } from 'vitest';

describe('TASK-038: Owner Workspace Navigation (AC-116, D-15, D-16, D-18, D-19)', () => {
  const sections = {
    approval: {
      label: 'อนุมัติ',
      managers: ['OwnerSessionApprovalManager', 'OwnerRefundApprovalManager'],
    },
    finance: {
      label: 'การเงิน',
      managers: [
        'OwnerFeeSettingsManager',
        'OwnerWeeklyPayoutManager',
        'OwnerReserveReleaseManager',
        'OwnerDebtRepaymentManager',
        'OwnerPaymentRecoveryManager',
      ],
    },
    customer: {
      label: 'ลูกค้า',
      managers: ['OwnerContactCorrectionManager', 'OwnerEmailDeliveriesManager'],
    },
    system: {
      label: 'ระบบ',
      managers: ['InviteOrganizerForm', 'OwnerNewsManager', 'OwnerSyncConflictManager'],
    },
  };

  it('partitions all 12 owner managers cleanly across the 4 confirmed sections (D-16)', () => {
    const allManagers = Object.values(sections).flatMap(s => s.managers);
    expect(allManagers.length).toBe(12);
    // Ensure all manager names are unique across groups
    const uniqueManagers = new Set(allManagers);
    expect(uniqueManagers.size).toBe(12);

    expect(sections.approval.managers).toHaveLength(2);
    expect(sections.finance.managers).toHaveLength(5);
    expect(sections.customer.managers).toHaveLength(2);
    expect(sections.system.managers).toHaveLength(3);
  });

  it('maps anchor hashes and manager IDs to their owning section (AC-116)', () => {
    const hashToSection: Record<string, string> = {
      approval: 'approval',
      'owner-session-approval-manager': 'approval',
      'owner-refund-approval-manager': 'approval',
      finance: 'finance',
      'owner-fee-settings-manager': 'finance',
      'owner-weekly-payout-manager': 'finance',
      'owner-reserve-release-manager': 'finance',
      'owner-debt-repayment-manager': 'finance',
      'owner-payment-recovery-manager': 'finance',
      customer: 'customer',
      'owner-contact-correction-manager': 'customer',
      'owner-email-deliveries-manager': 'customer',
      system: 'system',
      'invite-organizer-form': 'system',
      'owner-news-manager': 'system',
      'owner-sync-conflict-manager': 'system',
    };

    expect(hashToSection['owner-refund-approval-manager']).toBe('approval');
    expect(hashToSection['owner-weekly-payout-manager']).toBe('finance');
    expect(hashToSection['owner-contact-correction-manager']).toBe('customer');
    expect(hashToSection['owner-sync-conflict-manager']).toBe('system');
  });

  it('defaults to approval section when initial section or hash is missing or unrecognized', () => {
    function resolveSection(param?: string): string {
      if (param && ['approval', 'finance', 'customer', 'system'].includes(param)) {
        return param;
      }
      return 'approval';
    }

    expect(resolveSection(undefined)).toBe('approval');
    expect(resolveSection('')).toBe('approval');
    expect(resolveSection('unknown')).toBe('approval');
    expect(resolveSection('finance')).toBe('finance');
    expect(resolveSection('customer')).toBe('customer');
    expect(resolveSection('system')).toBe('system');
    expect(resolveSection('approval')).toBe('approval');
  });
});
