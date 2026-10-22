import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { recordAdmissionScan } from '../../src/server/admission';

describe('Admission scan unit logic (TASK-020, AC-08, AC-39, AC-49, AC-95, AC-100, AC-101, AC-65)', () => {
  it('rejects unpermitted roles from recording admission', async () => {
    const mockPool = {} as unknown as Pool;
    const res = await recordAdmissionScan(mockPool, {
      scannerId: 'user-buyer-1',
      scannerName: 'Buyer User',
      scannerRole: 'buyer',
      sessionId: 'sess-1',
      qrPayloadOrCode: 'TK-12345',
      action: 'entry',
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('rejected');
    expect(res.reason).toBe('UNAUTHORIZED_ROLE');
  });

  it('rejects scan when current time is outside the session admission window (AC-100)', async () => {
    const mockPool = {
      query: async (queryText: string) => {
        if (queryText.includes('CREATE TABLE')) return { rows: [] };
        if (queryText.includes('SELECT s.id')) {
          return {
            rowCount: 1,
            rows: [
              {
                id: 'sess-1',
                eventId: 'ev-1',
                organizerId: 'org-1',
                eventTitle: 'คอนเสิร์ตรอบเปิดตัว',
                startTime: new Date('2026-12-31T18:00:00Z'),
                endTime: new Date('2026-12-31T22:00:00Z'),
                admissionStartTime: new Date('2026-12-31T16:00:00Z'),
                admissionEndTime: new Date('2026-12-31T20:00:00Z'),
                sessionStatus: 'approved',
              },
            ],
          };
        }
        if (queryText.includes('SELECT 1 FROM event_scanners')) {
          return { rowCount: 1, rows: [{}] };
        }
        return { rowCount: 0, rows: [] };
      },
    } as unknown as Pool;

    // Too early: 15:00 (window starts at 16:00)
    const earlyRes = await recordAdmissionScan(mockPool, {
      scannerId: 'scanner-1',
      scannerName: 'ทีมสแกนหนึ่ง',
      scannerRole: 'scanner',
      sessionId: 'sess-1',
      qrPayloadOrCode: 'TK-12345',
      action: 'entry',
      now: new Date('2026-12-31T15:00:00Z'),
    });

    expect(earlyRes.success).toBe(false);
    expect(earlyRes.reason).toBe('OUTSIDE_ADMISSION_WINDOW');
    expect(earlyRes.message).toContain('ยังไม่ถึงช่วงเวลาเปิดรับเข้างาน');

    // Too late: 21:00 (window closes at 20:00)
    const lateRes = await recordAdmissionScan(mockPool, {
      scannerId: 'scanner-1',
      scannerName: 'ทีมสแกนหนึ่ง',
      scannerRole: 'scanner',
      sessionId: 'sess-1',
      qrPayloadOrCode: 'TK-12345',
      action: 'entry',
      now: new Date('2026-12-31T21:00:00Z'),
    });

    expect(lateRes.success).toBe(false);
    expect(lateRes.reason).toBe('OUTSIDE_ADMISSION_WINDOW');
    expect(lateRes.message).toContain('พ้นช่วงเวลาเปิดรับเข้างานแล้ว');
  });

  it('rejects scanner trying to scan an event they are not assigned to (AC-08)', async () => {
    const mockPool = {
      query: async (queryText: string) => {
        if (queryText.includes('CREATE TABLE')) return { rows: [] };
        if (queryText.includes('SELECT s.id')) {
          return {
            rowCount: 1,
            rows: [
              {
                id: 'sess-1',
                eventId: 'ev-event-B',
                organizerId: 'org-B',
                eventTitle: 'งานคอนเสิร์ต B',
                startTime: new Date('2026-12-31T18:00:00Z'),
                endTime: new Date('2026-12-31T22:00:00Z'),
                admissionStartTime: null,
                admissionEndTime: null,
                sessionStatus: 'approved',
              },
            ],
          };
        }
        if (queryText.includes('SELECT 1 FROM event_scanners')) {
          // Scanner is not assigned to ev-event-B
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
    } as unknown as Pool;

    const res = await recordAdmissionScan(mockPool, {
      scannerId: 'scanner-team-A',
      scannerName: 'ทีมสแกน A',
      scannerRole: 'scanner',
      sessionId: 'sess-1',
      qrPayloadOrCode: 'TK-12345',
      action: 'entry',
      now: new Date('2026-12-31T19:00:00Z'),
    });

    expect(res.success).toBe(false);
    expect(res.reason).toBe('UNAUTHORIZED_EVENT');
    expect(res.message).toContain('ไม่มีสิทธิ์สแกนบัตรในคอนเสิร์ตนี้');
  });

  it('ensures scan result payload is strictly stripped of buyer PII (AC-65)', async () => {
    const mockClient = {
      query: async (queryText: string) => {
        if (queryText === 'BEGIN' || queryText === 'COMMIT' || queryText === 'ROLLBACK') return { rows: [] };
        if (queryText.includes('SELECT t.id')) {
          return {
            rowCount: 1,
            rows: [
              {
                id: 't-123',
                orderId: 'ord-123',
                eventId: 'ev-1',
                sessionId: 'sess-1',
                ticketTypeId: 'tt-1',
                ticketCode: 'TK-SECRET-01',
                qrPayload: 'QR-SECRET-01',
                status: 'valid',
                admissionStatus: 'outside',
                ticketTypeName: 'VIP Zone A',
                ticketPrice: 3500,
                eventTitle: 'มหกรรมคอนเสิร์ตใหญ่',
                sessionStartTime: new Date('2026-12-31T18:00:00Z'),
                sessionEndTime: new Date('2026-12-31T22:00:00Z'),
                // Even if database query returned buyer fields accidentally, summary must not expose them
                buyerName: 'นายผู้ซื้อ ตัวจริง',
                buyerEmail: 'real-buyer@secret.invalid',
                buyerPhone: '0899999999',
              },
            ],
          };
        }
        return { rowCount: 1, rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      query: async (queryText: string) => {
        if (queryText.includes('CREATE TABLE')) return { rows: [] };
        if (queryText.includes('SELECT s.id')) {
          return {
            rowCount: 1,
            rows: [
              {
                id: 'sess-1',
                eventId: 'ev-1',
                organizerId: 'org-1',
                eventTitle: 'มหกรรมคอนเสิร์ตใหญ่',
                startTime: new Date('2026-12-31T18:00:00Z'),
                endTime: new Date('2026-12-31T22:00:00Z'),
                admissionStartTime: null,
                admissionEndTime: null,
                sessionStatus: 'approved',
              },
            ],
          };
        }
        if (queryText.includes('SELECT 1 FROM event_scanners')) {
          return { rowCount: 1, rows: [{}] };
        }
        return { rowCount: 0, rows: [] };
      },
      connect: async () => mockClient,
    } as unknown as Pool;

    const res = await recordAdmissionScan(mockPool, {
      scannerId: 'scanner-1',
      scannerName: 'สแกนเนอร์',
      scannerRole: 'scanner',
      sessionId: 'sess-1',
      qrPayloadOrCode: 'TK-SECRET-01',
      action: 'entry',
      now: new Date('2026-12-31T19:00:00Z'),
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('success');
    expect(res.ticket).toBeDefined();

    // Verify AC-65: NO BUYER PII in ticket summary or result object
    const ticketJson = JSON.stringify(res.ticket);
    expect(ticketJson).not.toContain('buyerName');
    expect(ticketJson).not.toContain('buyerEmail');
    expect(ticketJson).not.toContain('buyerPhone');
    expect(ticketJson).not.toContain('นายผู้ซื้อ');
    expect(ticketJson).not.toContain('real-buyer@secret.invalid');
    expect(ticketJson).not.toContain('0899999999');
  });
});
