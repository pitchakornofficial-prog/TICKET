import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import {
  ensureOrganizerFinanceSchema,
  getOrganizerPayoutAccounts,
  createOrganizerPayoutAccount,
  deleteOrganizerPayoutAccount,
  getOrganizerProfile,
} from '../../src/server/organizer-finance.ts';
import {
  loadPayoutAccounts,
  getPrimaryPayoutAccount,
  DEFAULT_PAYOUT_ACCOUNTS,
} from '../../src/lib/organizer-payout-sync.ts';

describe('Organizer Finance & Payout Accounts Database Synchronization', () => {
  const rootDir = process.cwd();

  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  let mockPool: unknown;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && (sql.includes('CREATE TABLE') || sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    mockPool = {
      connect: vi.fn().mockImplementation(async () => mockClient),
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };
  });

  describe('Server DB Operations (organizer-finance.ts)', () => {
    it('creates organizer_payout_accounts and organizer_profiles tables in ensureOrganizerFinanceSchema', async () => {
      await ensureOrganizerFinanceSchema(mockPool as Pool);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS organizer_payout_accounts'),
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS organizer_profiles'),
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('returns existing payout accounts ordered by isPrimary desc, createdAt asc', async () => {
      const existingDate = new Date('2026-11-20T10:00:00Z');
      (mockPool as { query: ReturnType<typeof vi.fn> }).query.mockResolvedValueOnce({
        rows: [
          {
            id: 'acc-1',
            accountName: 'บจก. คอนเสิร์ตหลัก',
            accountNumber: '111-2-33333-4',
            bankName: 'ธนาคารกสิกรไทย (KBANK)',
            isPrimary: true,
            qrCodeUrl: null,
            createdAt: existingDate,
            updatedAt: existingDate,
          },
          {
            id: 'acc-2',
            accountName: 'บจก. คอนเสิร์ตสำรอง',
            accountNumber: '555-6-77777-8',
            bankName: 'ธนาคารไทยพาณิชย์ (SCB)',
            isPrimary: false,
            qrCodeUrl: 'https://example.com/qr.png',
            createdAt: existingDate,
            updatedAt: existingDate,
          },
        ],
        rowCount: 2,
      });

      const accounts = await getOrganizerPayoutAccounts(mockPool as Pool, 'org-123');
      expect(accounts).toHaveLength(2);
      expect(accounts[0].isPrimary).toBe(true);
      expect(accounts[0].accountName).toBe('บจก. คอนเสิร์ตหลัก');
      expect(accounts[1].isPrimary).toBe(false);
      expect(accounts[1].qrCodeUrl).toBe('https://example.com/qr.png');
    });

    it('auto-migrates bank account from existing events when organizer has no accounts in table', async () => {
      const poolQueryMock = (mockPool as { query: ReturnType<typeof vi.fn> }).query;
      // 1. organizer_payout_accounts returns empty
      poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 2. events query returns an event with bank account
      poolQueryMock.mockResolvedValueOnce({
        rows: [
          {
            payoutBankName: 'ธนาคารกรุงเทพ (BBL)',
            payoutAccountNumber: '999-8-77777-6',
            payoutAccountName: 'บจก. ผู้จัดจากคอนเสิร์ต',
          },
        ],
        rowCount: 1,
      });
      // 3. insert returning new account
      const now = new Date();
      poolQueryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'acc-auto-1',
            accountName: 'บจก. ผู้จัดจากคอนเสิร์ต',
            accountNumber: '999-8-77777-6',
            bankName: 'ธนาคารกรุงเทพ (BBL)',
            isPrimary: true,
            qrCodeUrl: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        rowCount: 1,
      });

      const accounts = await getOrganizerPayoutAccounts(mockPool as Pool, 'org-123');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].accountNumber).toBe('999-8-77777-6');
      expect(accounts[0].bankName).toBe('ธนาคารกรุงเทพ (BBL)');
      expect(accounts[0].isPrimary).toBe(true);
    });

    it('creates a new payout account and manages isPrimary flag properly', async () => {
      const now = new Date();
      mockClient.query.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('count(*)')) {
          return { rows: [{ count: '1' }], rowCount: 1 };
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO organizer_payout_accounts')) {
          return {
            rows: [
              {
                id: 'acc-new-1',
                accountName: 'บัญชีใหม่',
                accountNumber: '333-4-55555-6',
                bankName: 'ธนาคารกรุงไทย (KTB)',
                isPrimary: true,
                qrCodeUrl: null,
                createdAt: now,
                updatedAt: now,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      const account = await createOrganizerPayoutAccount(mockPool as Pool, 'org-123', {
        accountName: 'บัญชีใหม่',
        accountNumber: '333-4-55555-6',
        bankName: 'ธนาคารกรุงไทย (KTB)',
        isPrimary: true,
      });

      expect(account.id).toBe('acc-new-1');
      expect(account.accountName).toBe('บัญชีใหม่');
      expect(account.isPrimary).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE organizer_payout_accounts SET "isPrimary" = false, "updatedAt" = now() WHERE "organizerId" = $1',
        ['org-123'],
      );
    });

    it('rejects deletion when only 1 account exists to protect payout integrity', async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('count(*)')) {
          return { rows: [{ count: '1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      await expect(
        deleteOrganizerPayoutAccount(mockPool as Pool, 'org-123', 'acc-1'),
      ).rejects.toThrow('ต้องมีบัญชีรับเงินอย่างน้อย 1 บัญชีในระบบสำหรับรับเงินยอดขาย');
    });

    it('deletes account and promotes next account to primary if primary account was deleted', async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('count(*)')) {
          return { rows: [{ count: '2' }], rowCount: 1 };
        }
        if (typeof sql === 'string' && sql.includes('SELECT "isPrimary" FROM organizer_payout_accounts')) {
          return { rows: [{ isPrimary: true }], rowCount: 1 };
        }
        if (typeof sql === 'string' && sql.includes('UPDATE organizer_payout_accounts')) {
          return { rows: [{ id: 'acc-2' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const res = await deleteOrganizerPayoutAccount(mockPool as Pool, 'org-123', 'acc-1');
      expect(res.success).toBe(true);
      expect(res.nextPrimaryId).toBe('acc-2');
    });

    it('reads and updates organizer profile in database', async () => {
      const now = new Date();
      const poolQueryMock = (mockPool as { query: ReturnType<typeof vi.fn> }).query;
      // 1. auth_user query
      poolQueryMock.mockResolvedValueOnce({
        rows: [{ name: 'สโมสรนักศึกษา ม.อุบลฯ', email: 'organizer.freshy@ubu.ac.th' }],
      });
      // 2. organizer_profiles query
      poolQueryMock.mockResolvedValueOnce({
        rows: [
          {
            primaryPhone: '081-111-2222',
            backupContactName: 'ผู้ช่วยการเงิน',
            backupPhone: '089-333-4444',
            updatedAt: now,
          },
        ],
      });

      const profile = await getOrganizerProfile(mockPool as Pool, 'org-123');
      expect(profile.organizerName).toBe('สโมสรนักศึกษา ม.อุบลฯ');
      expect(profile.organizerEmail).toBe('organizer.freshy@ubu.ac.th');
      expect(profile.primaryPhone).toBe('081-111-2222');
      expect(profile.backupContactName).toBe('ผู้ช่วยการเงิน');
    });
  });

  describe('Client Payout Sync Helper (organizer-payout-sync.ts)', () => {
    it('maintains backwards-compatible loadPayoutAccounts and getPrimaryPayoutAccount', () => {
      const initial = loadPayoutAccounts();
      expect(Array.isArray(initial)).toBe(true);
      expect(initial.length).toBeGreaterThanOrEqual(1);

      const primary = getPrimaryPayoutAccount(initial);
      expect(primary).toBeDefined();
      expect(primary.isPrimary).toBe(true);
      expect(primary.bankName).toBe(DEFAULT_PAYOUT_ACCOUNTS[0].bankName);
    });
  });

  describe('Frontend Views Database Sync Verification', () => {
    it('verifies Organizer Settings View syncs payout accounts and profile with database', () => {
      const src = readFileSync(
        join(rootDir, 'src/components/organizer-settings-view.tsx'),
        'utf8',
      );
      expect(src).toContain('loadSharedPayoutAccounts');
      expect(src).toContain('createSharedPayoutAccount');
      expect(src).toContain('updateSharedPayoutAccount');
      expect(src).toContain('deleteSharedPayoutAccount');
      expect(src).toContain('setPrimarySharedPayoutAccount');
      expect(src).toContain('/api/organizer/profile');
    });

    it('verifies Organizer Finance View syncs primary payout account and concert payout details with database', () => {
      const src = readFileSync(
        join(rootDir, 'src/components/organizer-finance-view.tsx'),
        'utf8',
      );
      expect(src).toContain('loadSharedPayoutAccounts');
      expect(src).toContain('/api/organizer/finance/summaries');
      expect(src).toContain('finance-concert-payout-box');
      expect(src).toContain('บัญชีธนาคารสำหรับรับเงินของคอนเสิร์ตนี้:');
      expect(src).toContain('ซิงก์กับฐานข้อมูลจริง');
    });

    it('verifies Organizer Events Manager loads real payout accounts for concert assignment', () => {
      const src = readFileSync(
        join(rootDir, 'src/components/organizer-events-manager.tsx'),
        'utf8',
      );
      expect(src).toContain('loadSharedPayoutAccounts');
      expect(src).toContain('payout-account-select-grid');
    });
  });

  describe('Rule D-14: Zero Emojis Compliance', () => {
    it('ensures zero emojis in all newly added and modified files', () => {
      const filesToCheck = [
        'src/server/organizer-finance.ts',
        'src/app/api/organizer/payout-accounts/route.ts',
        'src/app/api/organizer/profile/route.ts',
        'src/lib/organizer-payout-sync.ts',
        'src/components/organizer-settings-view.tsx',
        'src/components/organizer-finance-view.tsx',
        'src/components/organizer-events-manager.tsx',
      ];

      const emojiRegex =
        /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

      for (const file of filesToCheck) {
        const content = readFileSync(join(rootDir, file), 'utf8');
        const match = content.match(emojiRegex);
        expect(match, `Emoji found in ${file}: ${match?.[0]}`).toBeNull();
      }
    });
  });
});
