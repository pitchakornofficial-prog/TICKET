import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  approveSessionAmendment,
  submitSessionAmendment,
  submitSessionForApproval,
  updateEventDraft,
} from '../../src/server/events';
import { POST as eventPostHandler } from '../../src/app/api/events/[id]/route';

const mockGetSession = vi.fn();
const mockPool = {
  query: vi.fn(),
  connect: vi.fn(),
};

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: mockGetSession,
    },
    options: {
      database: mockPool,
    },
  }),
}));

vi.mock('@/server/origin', () => ({
  assertSameOrigin: () => null,
}));

function createQueryPool(
  handler: (sql: string, params?: unknown[]) => { rows: unknown[]; rowCount: number },
): Pool {
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      return handler(sql, params);
    },
    release: () => {},
  };

  return {
    query: async (sql: string, params?: unknown[]) => handler(sql, params),
    connect: async () => client,
  } as unknown as Pool;
}

describe('Event status lock & session amendment cross-tenant IDOR protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects updateEventDraft by organizer when event status is approved or pending_approval', async () => {
    for (const status of ['approved', 'pending_approval']) {
      const pool = createQueryPool(sql => {
        if (sql.includes('SELECT "organizerId", status FROM events WHERE id = $1')) {
          return { rows: [{ organizerId: 'org-1', status }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      await expect(
        updateEventDraft(pool, 'evt-1', 'org-1', {
          ubuPrivilegeMode: true,
          limitPerOrder: 99,
          payoutAccountNumber: '999-9-99999-9',
        }),
      ).rejects.toThrow('ไม่อนุญาต: ไม่สามารถแก้ไขข้อมูลหลักของงานหลังจากส่งขออนุมัติหรืออนุมัติแล้ว');
    }
  });

  it('rejects negative or invalid price/quota/studentPrice in updateEventDraft', async () => {
    const pool = createQueryPool(sql => {
      if (sql.includes('SELECT "organizerId", status FROM events WHERE id = $1')) {
        return { rows: [{ organizerId: 'org-1', status: 'draft' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const baseSession = {
      startTime: '2026-12-01T19:00:00.000Z',
      endTime: '2026-12-01T22:00:00.000Z',
    };

    await expect(
      updateEventDraft(pool, 'evt-1', 'org-1', {}, [
        { ...baseSession, ticketTypes: [{ name: 'VIP', price: -100, quota: 10 }] },
      ]),
    ).rejects.toThrow('ราคาบัตรต้องไม่ติดลบ');

    await expect(
      updateEventDraft(pool, 'evt-1', 'org-1', {}, [
        { ...baseSession, ticketTypes: [{ name: 'VIP', price: 100, quota: -1 }] },
      ]),
    ).rejects.toThrow('จำนวนบัตรต้องไม่ติดลบ');

    await expect(
      updateEventDraft(pool, 'evt-1', 'org-1', {}, [
        { ...baseSession, ticketTypes: [{ name: 'VIP', price: 100, quota: 1.5 }] },
      ]),
    ).rejects.toThrow('จำนวนบัตรต้องไม่ติดลบ');

    await expect(
      updateEventDraft(pool, 'evt-1', 'org-1', {}, [
        {
          ...baseSession,
          ticketTypes: [{ name: 'VIP', price: 500, quota: 10, isStudentPrivilege: true, studentPrice: -50 }],
        },
      ]),
    ).rejects.toThrow('ราคาบัตรนักศึกษาต้องไม่ติดลบ');
  });

  it('rejects submitSessionForApproval when session is already approved', async () => {
    const pool = createQueryPool(sql => {
      if (sql.includes('FROM event_sessions s')) {
        return {
          rows: [{ id: 'sess-1', eventId: 'evt-1', status: 'approved', organizerId: 'org-1' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(submitSessionForApproval(pool, 'sess-1', 'org-1')).rejects.toThrow(
      'ส่งขออนุมัติได้เฉพาะรอบที่อยู่ในสถานะฉบับร่างหรือถูกปฏิเสธเท่านั้น',
    );
  });

  it('rejects POST /api/events/[id]?action=submit-event when event is already approved', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'org-1', role: 'organizer' },
    });

    const queries: string[] = [];
    mockPool.query.mockImplementation(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('SELECT * FROM events WHERE id = $1')) {
        return {
          rows: [{ id: 'evt-1', organizerId: 'org-1', status: 'approved' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const req = new Request('http://127.0.0.1:3000/api/events/evt-1?action=submit-event', {
      method: 'POST',
    });
    const res = await eventPostHandler(req, { params: Promise.resolve({ id: 'evt-1' }) });
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(400);
    expect(body.message).toContain('ส่งขออนุมัติได้เฉพาะงานที่อยู่ในสถานะฉบับร่างหรือถูกปฏิเสธเท่านั้น');
    expect(queries.some(q => q.includes("SET status = 'pending_approval'"))).toBe(false);
  });

  it('blocks cross-session/cross-tenant ticketType IDOR in submitSessionAmendment', async () => {
    const pool = createQueryPool((sql, params) => {
      if (sql.includes('FROM event_sessions s')) {
        return {
          rows: [{ id: 'sess-attacker', eventId: 'evt-attacker', status: 'approved', organizerId: 'org-attacker' }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT id FROM ticket_types WHERE id = $1 AND "sessionId" = $2')) {
        // Victim ticket type belongs to sess-victim, not sess-attacker
        expect(params).toEqual(['tt-victim', 'sess-attacker']);
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(
      submitSessionAmendment(pool, {
        sessionId: 'sess-attacker',
        organizerId: 'org-attacker',
        ticketTypes: [{ id: 'tt-victim', name: 'Hijacked VIP', price: 1, quota: 500 }],
      }),
    ).rejects.toThrow('ไม่พบประเภทบัตร "Hijacked VIP" ในรอบการแสดงนี้');
  });

  it('blocks cross-session/cross-tenant ticketType IDOR in approveSessionAmendment', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = createQueryPool((sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('SELECT role FROM auth_user')) {
        return { rows: [{ role: 'owner' }], rowCount: 1 };
      }
      if (sql.includes('FROM session_amendments') && sql.includes('FOR UPDATE')) {
        return {
          rows: [
            {
              id: 'amd-1',
              sessionId: 'sess-attacker',
              eventId: 'evt-attacker',
              startTime: null,
              endTime: null,
              admissionStartTime: null,
              admissionEndTime: null,
              ticketTypes: [{ id: 'tt-victim', name: 'Hijacked VIP', price: 1, quota: 500 }],
              status: 'pending',
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT id, quota FROM ticket_types WHERE id = $1 AND "sessionId" = $2 FOR UPDATE')) {
        expect(params).toEqual(['tt-victim', 'sess-attacker']);
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(
      approveSessionAmendment(pool, {
        amendmentId: 'amd-1',
        ownerId: 'owner-1',
      }),
    ).rejects.toThrow('ไม่พบประเภทบัตร "Hijacked VIP" ในรอบการแสดงที่ขอแก้ไข');

    expect(executedQueries.some(q => q.sql.includes('UPDATE ticket_types'))).toBe(false);
  });
});
