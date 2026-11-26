import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  createNotification,
  listNotificationsForActor,
  markNotificationRead,
  markAllNotificationsRead,
  toggleNotificationSaved,
  deleteNotification,
  formatTimeAgo,
} from '../../src/server/notifications';

describe('Real Database Notifications System Unit Tests', () => {
  it('formats time ago strings in clean Thai without emojis (Rule D-14)', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    expect(formatTimeAgo(new Date('2026-11-25T11:59:30Z'), now)).toBe('เมื่อสักครู่');
    expect(formatTimeAgo(new Date('2026-11-25T11:45:00Z'), now)).toBe('15 นาทีที่แล้ว');
    expect(formatTimeAgo(new Date('2026-11-25T08:00:00Z'), now)).toBe('4 ชั่วโมงที่แล้ว');
    expect(formatTimeAgo(new Date('2026-11-24T10:00:00Z'), now)).toBe('เมื่อวานนี้');
    expect(formatTimeAgo(new Date('2026-11-20T10:00:00Z'), now)).toBe('5 วันที่แล้ว');

    // Rule D-14: Zero emojis
    expect(formatTimeAgo(new Date(), now)).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('creates notification and issues query to database', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'NTF-12345678',
          userId: 'usr-1',
          role: 'owner',
          title: 'คำสั่งซื้อใหม่',
          summary: 'ได้รับชำระเงินแล้ว',
          content: 'ได้รับชำระเงินแล้ว',
          category: 'finance',
          referenceId: 'ORD-1',
          isRead: false,
          isSaved: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const mockPool = { query: mockQuery } as unknown as Pool;

    const res = await createNotification(mockPool, {
      userId: 'usr-1',
      role: 'owner',
      title: 'คำสั่งซื้อใหม่',
      summary: 'ได้รับชำระเงินแล้ว',
      category: 'finance',
      referenceId: 'ORD-1',
    });

    expect(res.id).toBe('NTF-12345678');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO admin_notifications');
  });

  it('lists notifications filtered by actor and tab with unread counts', async () => {
    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve({
          rows: [{ totalCount: '10', unreadCount: '3', savedCount: '2' }],
        });
      }
      return Promise.resolve({
        rows: [
          {
            id: 'NTF-001',
            userId: 'usr-1',
            role: 'owner',
            title: 'ออกบัตรโควตาตรงสำเร็จ',
            summary: 'ออกบัตร 5 ใบ',
            content: 'รายละเอียด',
            category: 'concert',
            referenceId: 'ORD-DIR-1',
            isRead: false,
            isSaved: true,
            createdAt: new Date(Date.now() - 600000).toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      });
    });

    // Mock client for ensureNotificationSchema
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    const mockPool = {
      query: mockQuery,
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    const actor = { userId: 'usr-1', email: 'owner@test.invalid', role: 'owner' as const };
    const result = await listNotificationsForActor(mockPool, actor, { tab: 'unread' });

    expect(result.unreadCount).toBe(3);
    expect(result.savedCount).toBe(2);
    expect(result.totalCount).toBe(10);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].timeAgo).toMatch(/^(9|10) นาทีที่แล้ว$/);
    expect(result.notifications[0].formattedDate).toBeDefined();
  });

  it('handles mark read, toggle saved, and delete operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rowCount: 1 });
    const mockPool = {
      query: mockQuery,
    } as unknown as Pool;

    const actor = { userId: 'usr-1', email: 'owner@test.invalid', role: 'owner' as const };

    const readRes = await markNotificationRead(mockPool, actor, 'NTF-001', true);
    expect(readRes).toBe(true);

    const markAllRes = await markAllNotificationsRead(mockPool, actor);
    expect(markAllRes).toBe(1);

    const saveRes = await toggleNotificationSaved(mockPool, actor, 'NTF-001', true);
    expect(saveRes).toBe(true);

    const deleteRes = await deleteNotification(mockPool, actor, 'NTF-001');
    expect(deleteRes).toBe(true);
  });
});
