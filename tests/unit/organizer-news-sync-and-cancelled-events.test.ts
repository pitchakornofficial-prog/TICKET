import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  createOrganizerNews,
  approveNewsItem,
  rejectNewsItem,
} from '../../src/server/news';
import { getEventSalesStatus } from '../../src/lib/sales-window';

describe('Organizer News Database Sync and Approval Workflow', () => {
  it('creates an organizer news item with draft or pending status', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((query: string) => {
        if (query.includes('CREATE TABLE IF NOT EXISTS news') || query.includes('ALTER TABLE news')) {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        if (query.includes('INSERT INTO news')) {
          return Promise.resolve({
            rows: [{
              id: 'news-test-123',
              title: 'ประกาศรอบการแสดงใหม่',
              content: 'รายละเอียดรอบการแสดงเพิ่มเติมสำหรับคอนเสิร์ตใหญ่',
              summary: 'รายละเอียดรอบการแสดงเพิ่มเติม...',
              category: 'ประชาสัมพันธ์คอนเสิร์ต',
              relatedConcert: 'UBU Music Fest 2026',
              relatedEventId: null,
              status: 'pending',
              coverUrl: null,
              rejectionReason: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              authorId: 'user-org-1',
            }],
            rowCount: 1,
          });
        }
        if (query.includes('SELECT name FROM auth_user')) {
          return Promise.resolve({
            rows: [{ name: 'ผู้จัดงานทดสอบ' }],
            rowCount: 1,
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      release: vi.fn(),
    };

    const mockPool = {
      query: mockClient.query,
    } as unknown as Pool;

    const result = await createOrganizerNews(mockPool, {
      title: 'ประกาศรอบการแสดงใหม่',
      content: 'รายละเอียดรอบการแสดงเพิ่มเติมสำหรับคอนเสิร์ตใหญ่',
      category: 'ประชาสัมพันธ์คอนเสิร์ต',
      relatedConcert: 'UBU Music Fest 2026',
      status: 'pending',
      authorId: 'user-org-1',
    });

    expect(result.id).toBe('news-test-123');
    expect(result.status).toBe('pending');
    expect(result.title).toBe('ประกาศรอบการแสดงใหม่');
    expect(result.authorName).toBe('ผู้จัดงานทดสอบ');
  });

  it('approves a pending news item and transitions it to published', async () => {
    const mockPool = {
      query: vi.fn().mockImplementation((query: string) => {
        if (query.includes('UPDATE news')) {
          return Promise.resolve({
            rows: [{
              id: 'news-test-123',
              title: 'ประกาศรอบการแสดงใหม่',
              content: 'เนื้อหา',
              summary: 'สรุป',
              category: 'ประชาสัมพันธ์คอนเสิร์ต',
              relatedConcert: 'UBU Music Fest 2026',
              relatedEventId: null,
              status: 'published',
              coverUrl: null,
              rejectionReason: null,
              publishedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              authorId: 'user-org-1',
            }],
            rowCount: 1,
          });
        }
        if (query.includes('SELECT name FROM auth_user')) {
          return Promise.resolve({
            rows: [{ name: 'ผู้ดูแลระบบ' }],
            rowCount: 1,
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
    } as unknown as Pool;

    const approved = await approveNewsItem(mockPool, 'news-test-123');
    expect(approved).not.toBeNull();
    expect(approved?.status).toBe('published');
    expect(approved?.rejectionReason).toBeNull();
  });

  it('rejects a pending news item with reason and transitions to rejected', async () => {
    const mockPool = {
      query: vi.fn().mockImplementation((query: string, values?: unknown[]) => {
        if (query.includes('UPDATE news')) {
          return Promise.resolve({
            rows: [{
              id: 'news-test-123',
              title: 'ประกาศรอบการแสดงใหม่',
              content: 'เนื้อหา',
              summary: 'สรุป',
              category: 'ประชาสัมพันธ์คอนเสิร์ต',
              relatedConcert: 'UBU Music Fest 2026',
              relatedEventId: null,
              status: 'rejected',
              coverUrl: null,
              rejectionReason: values?.[1] || 'เนื้อหามีคำผิด',
              publishedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              authorId: 'user-org-1',
            }],
            rowCount: 1,
          });
        }
        if (query.includes('SELECT name FROM auth_user')) {
          return Promise.resolve({
            rows: [{ name: 'ผู้ดูแลระบบ' }],
            rowCount: 1,
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
    } as unknown as Pool;

    const rejected = await rejectNewsItem(mockPool, 'news-test-123', 'เนื้อหามีคำผิด');
    expect(rejected).not.toBeNull();
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.rejectionReason).toBe('เนื้อหามีคำผิด');
  });
});

describe('Cancelled Event Status Evaluation', () => {
  it('returns cancelled status when event status is cancelled', () => {
    const status = getEventSalesStatus({
      status: 'cancelled',
      salesStartTime: new Date(Date.now() - 3600000).toISOString(),
      salesEndTime: new Date(Date.now() + 3600000).toISOString(),
    });

    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe('cancelled');
    expect(status.message).toContain('ยกเลิกการแสดง');
  });
});
