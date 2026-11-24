// Payout Bank Accounts Synchronization between Settings and Finance (D-206)

export interface PayoutBankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  isPrimary: boolean;
  qrCodeUrl?: string;
  createdAt?: string;
  updatedAt?: string;
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
  const primary = accounts.find((a) => a.isPrimary);
  return primary || accounts[0] || DEFAULT_PAYOUT_ACCOUNTS[0];
}

// ==========================================
// Async Database-Backed API Synchronization
// ==========================================

export async function loadSharedPayoutAccounts(organizerId?: string): Promise<PayoutBankAccount[]> {
  if (typeof window === 'undefined') {
    return loadPayoutAccounts();
  }

  try {
    const query = organizerId ? `?organizerId=${encodeURIComponent(organizerId)}` : '';
    const res = await fetch(`/api/organizer/payout-accounts${query}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      return loadPayoutAccounts();
    }

    const data = await res.json();
    if (Array.isArray(data?.accounts) && data.accounts.length > 0) {
      savePayoutAccounts(data.accounts);
      return data.accounts;
    }
    return loadPayoutAccounts();
  } catch {
    return loadPayoutAccounts();
  }
}

export async function createSharedPayoutAccount(
  account: Partial<PayoutBankAccount>,
): Promise<PayoutBankAccount> {
  const res = await fetch('/api/organizer/payout-accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'ไม่สามารถเพิ่มบัญชีรับเงินได้');
  }

  // Refresh local cache
  await loadSharedPayoutAccounts();
  return data.account;
}

export async function updateSharedPayoutAccount(
  account: Partial<PayoutBankAccount> & { id: string },
): Promise<PayoutBankAccount> {
  const res = await fetch('/api/organizer/payout-accounts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'ไม่สามารถแก้ไขบัญชีรับเงินได้');
  }

  // Refresh local cache
  await loadSharedPayoutAccounts();
  return data.account;
}

export async function deleteSharedPayoutAccount(id: string): Promise<void> {
  const res = await fetch(`/api/organizer/payout-accounts?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'ไม่สามารถลบบัญชีรับเงินได้');
  }

  // Refresh local cache
  await loadSharedPayoutAccounts();
}

export async function setPrimarySharedPayoutAccount(id: string): Promise<PayoutBankAccount> {
  return updateSharedPayoutAccount({ id, isPrimary: true });
}
