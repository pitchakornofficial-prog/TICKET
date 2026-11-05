// Payout Bank Accounts Synchronization between Settings and Finance (D-206)

export interface PayoutBankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  isPrimary: boolean;
  qrCodeUrl?: string;
}

export const DEFAULT_PAYOUT_ACCOUNTS: PayoutBankAccount[] = [
  {
    id: 'acc-1',
    accountName: 'บจก. สมชาย คอนเสิร์ต โปรดักชั่น',
    accountNumber: '123-4-56789-0',
    bankName: 'ธนาคารกสิกรไทย (KBANK)',
    isPrimary: true,
  },
];

export const STORAGE_KEY_PAYOUT_ACCOUNTS = 'ticket_organizer_payout_accounts';
export const EVENT_PAYOUT_ACCOUNTS_CHANGED = 'ticket:payout-accounts-changed';

export function loadPayoutAccounts(): PayoutBankAccount[] {
  if (typeof window === 'undefined') {
    return DEFAULT_PAYOUT_ACCOUNTS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAYOUT_ACCOUNTS);
    if (!raw) {
      return DEFAULT_PAYOUT_ACCOUNTS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_PAYOUT_ACCOUNTS;
  } catch {
    return DEFAULT_PAYOUT_ACCOUNTS;
  }
}

export function savePayoutAccounts(accounts: PayoutBankAccount[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PAYOUT_ACCOUNTS, JSON.stringify(accounts));
    window.dispatchEvent(new CustomEvent(EVENT_PAYOUT_ACCOUNTS_CHANGED, { detail: accounts }));
  } catch (error) {
    console.warn('Failed to save payout accounts to storage', error);
  }
}

export function getPrimaryPayoutAccount(accounts: PayoutBankAccount[] = loadPayoutAccounts()): PayoutBankAccount {
  const primary = accounts.find(a => a.isPrimary);
  return primary || accounts[0] || DEFAULT_PAYOUT_ACCOUNTS[0];
}
