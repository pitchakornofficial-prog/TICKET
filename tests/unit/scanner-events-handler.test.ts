import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/app/api/scanner/events/route';

const { eventA, eventB, sessionToken, mockState } = vi.hoisted(() => {
  return {
    eventA: 'event-aaa-111',
    eventB: 'event-bbb-222',
    sessionToken: 'valid-scanner-session-token',
    mockState: {
      mockQuery: vi.fn(),
    },
  };
});

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    options: {
      database: {
        query: (...args: unknown[]) => mockState.mockQuery(...args),
      },
      secret: 'better-auth-secret-test-32-chars-long!',
    },
    api: {
      getSession: vi.fn().mockResolvedValue({
        session: { id: 'sess-1' },
        user: { id: 'scanner-1', name: 'Scanner 1', email: 'scanner@ticket.invalid', role: 'scanner' },
      }),
    },
  }),
}));

vi.mock('@/server/events', () => ({
  listEventsForScanner: vi.fn().mockResolvedValue([
    { id: 'event-aaa-111', title: 'Concert A' },
    { id: 'event-bbb-222', title: 'Concert B' },
  ]),
}));

describe('Issue #3: GET /api/scanner/events Scope Fail-Closed Verification', () => {
  beforeEach(() => {
    mockState.mockQuery = vi.fn();
  });

  it('คืนเฉพาะงาน A เมื่ออ่าน scope จากฐานข้อมูลสำเร็จ (ไม่ส่ง scope cookie)', async () => {
    // DB returns eventA scope for this session
    mockState.mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT "eventId" FROM scanner_session_scopes')) {
        expect(params).toEqual([sessionToken]);
        return Promise.resolve({
          rowCount: 1,
          rows: [{ eventId: eventA }],
        });
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    });

    const req = new Request('http://localhost:3000/api/scanner/events', {
      method: 'GET',
      headers: {
        cookie: `ticket.session_token=${sessionToken}.sig`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(1);
    expect(data.events[0].id).toBe(eventA);
  });

  it('ปฏิเสธคำขอด้วย HTTP 500 เมื่อ query scope ผิดพลาด (ไม่หลุดไปคืนรายการงาน A/B ทั้งหมด)', async () => {
    // DB query fails
    mockState.mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT "eventId" FROM scanner_session_scopes')) {
        return Promise.reject(new Error('PostgreSQL connection timeout or crashed'));
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    });

    const req = new Request('http://localhost:3000/api/scanner/events', {
      method: 'GET',
      headers: {
        cookie: `ticket.session_token=${sessionToken}.sig`,
      },
    });

    const res = await GET(req);
    // MUST NOT return HTTP 200 with both events
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('เกิดข้อผิดพลาดในการตรวจสอบขอบเขตงานคอนเสิร์ต');
  });

  it('ปฏิเสธคำขอด้วย HTTP 500 เมื่อไม่พบตาราง scope (PostgreSQL error 42P01) โดยไม่หลุดไปคืนรายการงาน A/B ทั้งหมด', async () => {
    // DB returns 42P01 (undefined_table)
    const err42P01 = Object.assign(new Error('relation "scanner_session_scopes" does not exist'), { code: '42P01' });

    mockState.mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT "eventId" FROM scanner_session_scopes')) {
        return Promise.reject(err42P01);
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    });

    const req = new Request('http://localhost:3000/api/scanner/events', {
      method: 'GET',
      headers: {
        cookie: `ticket.session_token=${sessionToken}.sig`,
      },
    });

    const res = await GET(req);
    // MUST NOT return HTTP 200 with both events
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('เกิดข้อผิดพลาดในการตรวจสอบขอบเขตงานคอนเสิร์ต');
  });

  it('ปฏิเสธคำขอด้วย HTTP 403 เมื่อ cookie scope มีลายเซ็นไม่ถูกต้องหรือถูกดัดแปลง', async () => {
    mockState.mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });

    const req = new Request('http://localhost:3000/api/scanner/events', {
      method: 'GET',
      headers: {
        cookie: `ticket.session_token=${sessionToken}.sig; scanner_event_scope=${eventB}.forged-signature`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.message).toContain('ไม่อนุญาต: ลายเซ็นขอบเขตงานคอนเสิร์ตไม่ถูกต้องหรือถูกดัดแปลง');
  });

  it('คืนทั้งงาน A/B เมื่อเซสชันเป็นแบบไม่มีขอบเขตจริง (unscoped: DB คืน 0 แถว และไม่มี cookie)', async () => {
    // DB confirms rowCount 0 (no scope recorded)
    mockState.mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT "eventId" FROM scanner_session_scopes')) {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    });

    const req = new Request('http://localhost:3000/api/scanner/events', {
      method: 'GET',
      headers: {
        cookie: `ticket.session_token=${sessionToken}.sig`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(2);
    expect(data.events.map((e: { id: string }) => e.id)).toEqual([eventA, eventB]);
  });
});
