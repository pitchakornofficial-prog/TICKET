import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { adminOverrideConcertFull, type AdminOverrideConcertInput } from '../../src/server/events';
import type { Pool } from 'pg';

describe('Admin Override All-in-One Concert Editing & Double Confirmation', () => {
  const rootDir = process.cwd();

  it('enforces role check: rejects non-owner users', async () => {
    const mockPool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    } as unknown as Pool;

    // mock client to return non-owner role
    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText.includes('SELECT role FROM auth_user')) {
          return Promise.resolve({ rowCount: 1, rows: [{ role: 'organizer' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    };
    (mockPool.connect as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

    const input: AdminOverrideConcertInput = {
      title: 'Hacked Concert',
    };

    await expect(
      adminOverrideConcertFull(mockPool, 'ev-123', 'user-organizer', input),
    ).rejects.toThrow('ไม่อนุญาต: เฉพาะเจ้าของระบบ (Owner)');

    expect(mockClient.release).toHaveBeenCalled();
  });

  it('buyer protection: prevents reducing zone quota below currently held/sold tickets', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText.includes('SELECT role FROM auth_user')) {
          return Promise.resolve({ rowCount: 1, rows: [{ role: 'owner' }] });
        }
        if (queryText === 'BEGIN' || queryText === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (queryText.includes('SELECT id, status, "organizerId" FROM events')) {
          return Promise.resolve({ rowCount: 1, rows: [{ id: 'ev-123', status: 'approved', organizerId: 'org-1' }] });
        }
        if (queryText.includes('SELECT GREATEST(0, COALESCE')) {
          // Held / sold count is 25
          return Promise.resolve({ rowCount: 1, rows: [{ heldQuota: 25 }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText.includes('SELECT role FROM auth_user')) {
          return Promise.resolve({ rowCount: 1, rows: [{ role: 'owner' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
    } as unknown as Pool;

    const input: AdminOverrideConcertInput = {
      title: 'Updated Concert',
      sessions: [
        {
          id: 'sess-1',
          startTime: '2026-12-01T19:00:00Z',
          endTime: '2026-12-01T22:00:00Z',
          ticketTypes: [
            {
              id: 'tt-1',
              name: 'VIP Zone',
              price: 2500,
              quota: 20, // Less than 25 held tickets!
            },
          ],
        },
      ],
    };

    await expect(
      adminOverrideConcertFull(mockPool, 'ev-123', 'user-owner', input),
    ).rejects.toThrow('น้อยกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้ว (25 ใบ) ไม่สามารถลดโควตาได้');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('buyer protection: prevents deleting a zone that already has sold tickets', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText.includes('SELECT role FROM auth_user')) {
          return Promise.resolve({ rowCount: 1, rows: [{ role: 'owner' }] });
        }
        if (queryText === 'BEGIN' || queryText === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (queryText.includes('SELECT id, status, "organizerId" FROM events')) {
          return Promise.resolve({ rowCount: 1, rows: [{ id: 'ev-123', status: 'approved', organizerId: 'org-1' }] });
        }
        if (queryText.includes('SELECT GREATEST(0, COALESCE')) {
          return Promise.resolve({ rowCount: 1, rows: [{ heldQuota: 5 }] });
        }
        if (queryText.includes('SELECT id, name FROM ticket_types WHERE "sessionId" = $1')) {
          // Existing zones were tt-1 and tt-deleted
          return Promise.resolve({
            rowCount: 2,
            rows: [
              { id: 'tt-1', name: 'Zone A' },
              { id: 'tt-deleted', name: 'Zone Sold Out' },
            ],
          });
        }
        if (queryText.includes('SELECT COUNT(*)::int AS cnt FROM tickets WHERE "ticketTypeId" = $1')) {
          // Zone tt-deleted has 15 sold tickets
          return Promise.resolve({ rowCount: 1, rows: [{ cnt: 15 }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText.includes('SELECT role FROM auth_user')) {
          return Promise.resolve({ rowCount: 1, rows: [{ role: 'owner' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
    } as unknown as Pool;

    // Only retaining tt-1, omitting tt-deleted
    const input: AdminOverrideConcertInput = {
      title: 'Updated Concert',
      sessions: [
        {
          id: 'sess-1',
          startTime: '2026-12-01T19:00:00Z',
          endTime: '2026-12-01T22:00:00Z',
          ticketTypes: [
            {
              id: 'tt-1',
              name: 'Zone A',
              price: 1500,
              quota: 100,
            },
          ],
        },
      ],
    };

    await expect(
      adminOverrideConcertFull(mockPool, 'ev-123', 'user-owner', input),
    ).rejects.toThrow('ไม่สามารถลบโซน "Zone Sold Out" ได้เนื่องจากมีผู้ซื้อบัตรไปแล้ว (15 ใบ)');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('verifies owner override route endpoint file structure and assertions', () => {
    const routePath = path.resolve(rootDir, 'src/app/api/owner/events/[id]/override/route.ts');
    const content = fs.readFileSync(routePath, 'utf8');

    expect(content).toContain("export const runtime = 'nodejs'");
    expect(content).toContain('export async function PUT');
    expect(content).toContain('assertSameOrigin(request)');
    expect(content).toContain("session?.user.role !== 'owner'");
    expect(content).toContain('adminOverrideConcertFull');
  });

  it('verifies OwnerSessionApprovalManager frontend has complete 7 reordered sections matching creation wizard', () => {
    const compPath = path.resolve(rootDir, 'src/components/owner-session-approval-manager.tsx');
    const content = fs.readFileSync(compPath, 'utf8');

    // Section 1: Event Info & Artists
    expect(content).toContain('1. ข้อมูลงาน & ศิลปิน');
    expect(content).toContain('edit-concert-title');
    expect(content).toContain('edit-concert-artists');

    // Section 2: Location & Maps
    expect(content).toContain('2. สถานที่ & แผนที่');
    expect(content).toContain('edit-concert-location');
    expect(content).toContain('edit-concert-maps');

    // Section 3: Schedule & Guidelines
    expect(content).toContain('3. กำหนดการ & กติกา');
    expect(content).toContain('edit-limit-per-order');
    expect(content).toContain('edit-age-restriction');
    expect(content).toContain('edit-refund-policy');
    expect(content).toContain('edit-entry-guidelines');

    // Section 4: Sessions & Zones Builder
    expect(content).toContain('4. รอบ & โซนบัตร');
    expect(content).toContain('handleAddSession');
    expect(content).toContain('handleRemoveSession');

    // Section 5: Visual Assets (Poster & Cover Banner only, no seating map)
    expect(content).toContain('5. รูปภาพ & สื่อ');
    expect(content).toContain('รูปโปสเตอร์หลัก (Poster)');
    expect(content).toContain('แบนเนอร์หน้าปก (Cover Banner)');
    expect(content).not.toContain('แผนผังที่นั่ง / ผังคอนเสิร์ต');
    expect(content).toContain('handleUploadImage');

    // Section 6: Fees & UBU Privileges (no payout bank fields)
    expect(content).toContain('6. ส่วนแบ่งค่าบริการระบบ');
    expect(content).toContain('edit-org-fee');
    expect(content).toContain('edit-cust-fee');
    expect(content).toContain('edit-ubu-mode');
    expect(content).not.toContain('edit-payout-bank');
    expect(content).not.toContain('edit-payout-num');
    expect(content).not.toContain('edit-payout-name');

    // Section 7: Audit Trail
    expect(content).toContain('7. ประวัติการแก้ไข (Audit Trail)');

    // Modal Footer with CSV Export button
    expect(content).toContain('ดาวน์โหลด CSV ข้อมูลปัจจุบัน');

    // Double Confirmation Modal ("ถามฉันอีกทีเพื่อความมั่นใจ")
    expect(content).toContain('showConfirmModal');
    expect(content).toContain('handlePrepareSubmitEdit');
    expect(content).toContain('handleFinalConfirmOverride');
    expect(content).toContain('ถามอีกครั้งเพื่อความมั่นใจ');
    expect(content).toContain('confirm-diff-list');
  });

  it('enforces strict D-14 zero emojis across new/modified files', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const files = [
      path.resolve(rootDir, 'src/server/events.ts'),
      path.resolve(rootDir, 'src/app/api/owner/events/[id]/override/route.ts'),
      path.resolve(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      path.resolve(rootDir, 'src/app/back-office/back-office.css'),
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).not.toMatch(emojiRegex);
    }
  });
});
