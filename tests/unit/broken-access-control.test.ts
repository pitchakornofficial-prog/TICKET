import { describe, expect, it, vi } from 'vitest';
import { GET as getAdmissionStats } from '../../src/app/api/scanner/admissions/stats/route';
import {
  GET as getAmendments,
  POST as postAmendments,
} from '../../src/app/api/organizer/events/[id]/sessions/[sessionId]/amendments/route';
import { GET as getOfflineStatus } from '../../src/app/api/organizer/events/[id]/primary-scanner/offline-status/route';
import type { Pool } from 'pg';

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

let mockActor = {
  id: 'org-attacker-id',
  role: 'organizer',
  name: 'Attacker Organizer',
};

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => {
        if (!mockActor.id) return null;
        return {
          session: { id: 'sess-test', userId: mockActor.id, expiresAt: new Date(Date.now() + 3600000) },
          user: { id: mockActor.id, name: mockActor.name, email: 'test@ticket.invalid', role: mockActor.role },
        };
      },
    },
    options: {
      database: {
        query: async (queryText: string, params: unknown[]) => {
          if (queryText.includes('FROM events WHERE id =')) {
            if (params[0] === 'victim-event') {
              return { rowCount: 1, rows: [{ organizerId: 'victim-organizer-id' }] };
            }
            if (params[0] === 'attacker-event') {
              return { rowCount: 1, rows: [{ organizerId: 'org-attacker-id' }] };
            }
            return { rowCount: 0, rows: [] };
          }
          if (queryText.includes('FROM event_offline_controls')) {
            return {
              rowCount: 1,
              rows: [{
                eventId: params[0],
                offlineStatus: 'active',
                haltReason: null,
                haltDetails: null,
                haltedAt: null,
                haltedBy: null,
                resumedAt: null,
                resumedBy: null,
                updatedAt: new Date('2026-11-01T10:00:00Z'),
              }],
            };
          }
          if (queryText.includes('FROM primary_scanner_handovers')) {
            return { rowCount: 0, rows: [] };
          }
          if (queryText.includes('CREATE TABLE')) {
            return { rowCount: 0, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        },
      } as unknown as Pool,
    },
  }),
  readActor: async () => (mockActor.id ? mockActor : null),
}));

vi.mock('@/server/database', () => ({
  inTransaction: async <T>(_pool: unknown, fn: (client: unknown) => Promise<T>) => fn(_pool),
  getDatabasePool: () => ({
    query: async (queryText: string, params: unknown[]) => {
      // 1. Session verification query
      if (queryText.includes('FROM event_sessions s') && queryText.includes('JOIN events e')) {
        if (params[0] === 'victim-session') {
          return {
            rowCount: 1,
            rows: [{ eventId: 'victim-event', organizerId: 'victim-organizer-id' }],
          };
        }
        if (params[0] === 'attacker-session') {
          return {
            rowCount: 1,
            rows: [{ eventId: 'attacker-event', organizerId: 'org-attacker-id' }],
          };
        }
        return { rowCount: 0, rows: [] };
      }

      // 2. Events organizer lookup
      if (queryText.includes('FROM events WHERE id =')) {
        if (params[0] === 'victim-event') {
          return { rowCount: 1, rows: [{ organizerId: 'victim-organizer-id' }] };
        }
        if (params[0] === 'attacker-event') {
          return { rowCount: 1, rows: [{ organizerId: 'org-attacker-id' }] };
        }
        return { rowCount: 0, rows: [] };
      }

      // 3. Scanner assignment query
      if (queryText.includes('FROM event_scanners WHERE')) {
        const [eventId, scannerId] = params;
        if (eventId === 'victim-event' && scannerId === 'assigned-scanner-id') {
          return { rowCount: 1, rows: [{}] };
        }
        return { rowCount: 0, rows: [] };
      }

      // 4. Amendments query
      if (queryText.includes('FROM session_amendments')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'amend-1',
            sessionId: params[0],
            eventId: 'victim-event',
            eventTitle: 'คอนเสิร์ตเหยื่อ',
            organizerId: 'victim-organizer-id',
            organizerName: 'Victim Org',
            organizerEmail: 'victim@ticket.invalid',
            ticketTypes: [],
            status: 'pending',
            currentStartTime: new Date(),
            currentEndTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          }],
        };
      }

      // 5. Admissions stats queries
      if (queryText.includes('FROM ticket_admissions') || queryText.includes('COUNT(')) {
        return {
          rowCount: 1,
          rows: [{ totalEntries: '42', totalExits: '10', insideCount: '32' }],
        };
      }
      if (queryText.includes('FROM ticket_admission_logs')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'log-1',
            ticketId: 't-1',
            ticketCode: 'TK-SECRET-01',
            action: 'entry',
            timestamp: new Date(),
            scannerName: 'Staff Gate A',
          }],
        };
      }

      if (queryText.includes('CREATE TABLE')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    connect: async () => ({
      query: async () => ({ rowCount: 0, rows: [] }),
      release: () => {},
    }),
  }),
}));

describe('Issue #5: Broken Access Control & Multi-tenant Isolation', () => {
  describe('1. Admissions Stats Route (/api/scanner/admissions/stats)', () => {
    it('blocks unauthenticated requests with 401 Unauthorized', async () => {
      mockActor = { id: '', role: '', name: '' };
      const req = new Request('http://localhost:3000/api/scanner/admissions/stats?sessionId=victim-session');
      const res = await getAdmissionStats(req);
      expect(res.status).toBe(401);
    });

    it('blocks buyers from accessing admission stats with 403 Forbidden', async () => {
      mockActor = { id: 'buyer-user-id', role: 'buyer', name: 'Buyer User' };
      const req = new Request('http://localhost:3000/api/scanner/admissions/stats?sessionId=victim-session');
      const res = await getAdmissionStats(req);
      expect(res.status).toBe(403);
    });

    it('blocks Organizer A from viewing admission stats of Organizer B with 403 Forbidden', async () => {
      mockActor = { id: 'org-attacker-id', role: 'organizer', name: 'Attacker Organizer' };
      const req = new Request('http://localhost:3000/api/scanner/admissions/stats?sessionId=victim-session');
      const res = await getAdmissionStats(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('คุณไม่มีสิทธิ์เข้าถึงสถิติการสแกนของงานคอนเสิร์ตนี้');
    });

    it('blocks unassigned Scanner from viewing admission stats with 403 Forbidden', async () => {
      mockActor = { id: 'unassigned-scanner-id', role: 'scanner', name: 'Unassigned Scanner' };
      const req = new Request('http://localhost:3000/api/scanner/admissions/stats?sessionId=victim-session');
      const res = await getAdmissionStats(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('คุณไม่ได้รับมอบหมายให้ปฏิบัติหน้าที่ในงานคอนเสิร์ตนี้');
    });

    it('allows Organizer to view admission stats for their own event session', async () => {
      mockActor = { id: 'org-attacker-id', role: 'organizer', name: 'Attacker Organizer' };
      const req = new Request('http://localhost:3000/api/scanner/admissions/stats?sessionId=attacker-session');
      const res = await getAdmissionStats(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stats).toBeDefined();
    });

    it('allows assigned Scanner to view admission stats for their event session', async () => {
      mockActor = { id: 'assigned-scanner-id', role: 'scanner', name: 'Assigned Scanner' };
      const req = new Request('http://localhost:3000/api/scanner/admissions/stats?sessionId=victim-session');
      const res = await getAdmissionStats(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stats).toBeDefined();
    });

    it('allows Owner to view admission stats for any event session', async () => {
      mockActor = { id: 'owner-id', role: 'owner', name: 'Owner' };
      const req = new Request('http://localhost:3000/api/scanner/admissions/stats?sessionId=victim-session');
      const res = await getAdmissionStats(req);
      expect(res.status).toBe(200);
    });
  });

  describe('2. Session Amendments Route (/api/organizer/events/[id]/sessions/[sessionId]/amendments)', () => {
    it('rejects if sessionId does not belong to the event in the URL with 400 Bad Request', async () => {
      mockActor = { id: 'victim-organizer-id', role: 'organizer', name: 'Victim Organizer' };
      // victim-session belongs to victim-event, but URL specifies attacker-event
      const req = new Request('http://localhost:3000/api/organizer/events/attacker-event/sessions/victim-session/amendments');
      const res = await getAmendments(req, {
        params: Promise.resolve({ id: 'attacker-event', sessionId: 'victim-session' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('รอบการแสดงนี้ไม่ได้อยู่ภายใต้คอนเสิร์ตที่ระบุใน URL');
    });

    it('blocks Organizer A from GET amendments of Organizer B with 403 Forbidden', async () => {
      mockActor = { id: 'org-attacker-id', role: 'organizer', name: 'Attacker Organizer' };
      const req = new Request('http://localhost:3000/api/organizer/events/victim-event/sessions/victim-session/amendments');
      const res = await getAmendments(req, {
        params: Promise.resolve({ id: 'victim-event', sessionId: 'victim-session' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('Forbidden: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้');
    });

    it('blocks Organizer A from POST amendment for Organizer B with 403 Forbidden', async () => {
      mockActor = { id: 'org-attacker-id', role: 'organizer', name: 'Attacker Organizer' };
      const req = new Request('http://localhost:3000/api/organizer/events/victim-event/sessions/victim-session/amendments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketTypes: [{ name: 'VIP', price: 1000, quota: 10 }] }),
      });
      const res = await postAmendments(req, {
        params: Promise.resolve({ id: 'victim-event', sessionId: 'victim-session' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('Forbidden: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้');
    });

    it('allows Organizer to GET amendments of their own event session', async () => {
      mockActor = { id: 'victim-organizer-id', role: 'organizer', name: 'Victim Organizer' };
      const req = new Request('http://localhost:3000/api/organizer/events/victim-event/sessions/victim-session/amendments');
      const res = await getAmendments(req, {
        params: Promise.resolve({ id: 'victim-event', sessionId: 'victim-session' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.amendments).toBeDefined();
    });

    it('allows Owner to GET amendments of any event session', async () => {
      mockActor = { id: 'owner-id', role: 'owner', name: 'Owner' };
      const req = new Request('http://localhost:3000/api/organizer/events/victim-event/sessions/victim-session/amendments');
      const res = await getAmendments(req, {
        params: Promise.resolve({ id: 'victim-event', sessionId: 'victim-session' }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('3. Primary Scanner Offline Status (/api/organizer/events/[id]/primary-scanner/offline-status)', () => {
    it('blocks unauthenticated requests with 401', async () => {
      mockActor = { id: '', role: '', name: '' };
      const req = new Request('http://localhost:3000/api/organizer/events/victim-event/primary-scanner/offline-status');
      const res = await getOfflineStatus(req, {
        params: Promise.resolve({ id: 'victim-event' }),
      });
      expect(res.status).toBe(401);
    });

    it('blocks buyers from accessing offline-status with 403 Forbidden', async () => {
      mockActor = { id: 'buyer-user-id', role: 'buyer', name: 'Buyer User' };
      const req = new Request('http://localhost:3000/api/organizer/events/victim-event/primary-scanner/offline-status');
      const res = await getOfflineStatus(req, {
        params: Promise.resolve({ id: 'victim-event' }),
      });
      expect(res.status).toBe(403);
    });

    it('blocks Organizer A from viewing offline-status of Organizer B with 403 Forbidden', async () => {
      mockActor = { id: 'org-attacker-id', role: 'organizer', name: 'Attacker Organizer' };
      const req = new Request('http://localhost:3000/api/organizer/events/victim-event/primary-scanner/offline-status');
      const res = await getOfflineStatus(req, {
        params: Promise.resolve({ id: 'victim-event' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('Forbidden: คุณไม่มีสิทธิ์ดูสถานะเครื่องหลักของคอนเสิร์ตนี้');
    });

    it('allows Organizer to view offline-status of their own event', async () => {
      mockActor = { id: 'org-attacker-id', role: 'organizer', name: 'Attacker Organizer' };
      const req = new Request('http://localhost:3000/api/organizer/events/attacker-event/primary-scanner/offline-status');
      const res = await getOfflineStatus(req, {
        params: Promise.resolve({ id: 'attacker-event' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.control).toBeDefined();
    });

    it('allows Owner to view offline-status of any event', async () => {
      mockActor = { id: 'owner-id', role: 'owner', name: 'Owner' };
      const req = new Request('http://localhost:3000/api/organizer/events/victim-event/primary-scanner/offline-status');
      const res = await getOfflineStatus(req, {
        params: Promise.resolve({ id: 'victim-event' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.control).toBeDefined();
    });
  });
});
