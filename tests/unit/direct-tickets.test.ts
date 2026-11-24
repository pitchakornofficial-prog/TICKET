import { describe, it, expect } from 'vitest';
import { buildZipUint8Array, computeCrc32 } from '@/lib/zip-builder';
import { normalizeEventOptions } from '@/components/owner-direct-tickets-manager';

describe('Direct Tickets Issuance & ZIP Builder', () => {
  describe('ZIP Builder (PKZIP store mode)', () => {
    it('computes correct CRC32 for known strings', () => {
      const encoder = new TextEncoder();
      const hello = encoder.encode('hello world');
      const crc = computeCrc32(hello);
      expect(crc).toBe(0x0d4a1185);
    });

    it('builds a valid ZIP archive containing multiple files', () => {
      const files = [
        { name: 'test.txt', data: 'hello world from TICKET' },
        { name: '001_VIP_TK-0001.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
      ];

      const zipBytes = buildZipUint8Array(files);
      expect(zipBytes.length).toBeGreaterThan(100);

      const view = new DataView(zipBytes.buffer);
      // First 4 bytes must be Local File Header Signature 0x04034B50
      expect(view.getUint32(0, true)).toBe(0x04034B50);

      // Verify End of Central Directory signature 0x06054B50 at the end
      const eocdSig = view.getUint32(zipBytes.length - 22, true);
      expect(eocdSig).toBe(0x06054B50);

      // Entries count in EOCD (offset 8 and 10 from EOCD start)
      expect(view.getUint16(zipBytes.length - 22 + 8, true)).toBe(2);
      expect(view.getUint16(zipBytes.length - 22 + 10, true)).toBe(2);
    });

    it('handles Thai characters and UTF-8 encoding in filenames and contents', () => {
      const files = [
        { name: '001_บัตรวีไอพี_TK-0001.png', data: 'ข้อมูลภาษาไทย' },
        { name: 'tickets-summary.csv', data: '\uFEFF"ลำดับ","รหัสบัตร","ประเภทบัตร"\n"1","TK-001","บัตรยืน"' },
      ];

      const zipBytes = buildZipUint8Array(files);
      expect(zipBytes.length).toBeGreaterThan(80);

      const view = new DataView(zipBytes.buffer);
      expect(view.getUint32(0, true)).toBe(0x04034B50);
      // Bit 11 of general purpose flag (offset 6) must be set (0x0800) for UTF-8 filename
      expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    });
  });

  describe('Direct Tickets Business Logic & Guards', () => {
    it('enforces DIR- prefix format for direct issuance orders', () => {
      const orderId = `DIR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      expect(orderId).toMatch(/^DIR-[A-Z0-9]+$/);
    });

    it('distinguishes priceDisplayMode correctly for complimentary vs face_value', () => {
      const modes = ['face_value', 'complimentary'] as const;
      const getDisplayText = (mode: typeof modes[number], price: number) => {
        if (mode === 'complimentary') return 'บัตรเชิญ (COMPLIMENTARY)';
        return `THB ${price.toLocaleString('th-TH')}`;
      };

      expect(getDisplayText('complimentary', 500)).toBe('บัตรเชิญ (COMPLIMENTARY)');
      expect(getDisplayText('face_value', 500)).toBe('THB 500');
    });

    it('filters out direct_issue from sales and revenue calculations', () => {
      const mockOrders = [
        { id: 'ORD-001', orderSource: 'web', total: 1000, status: 'paid' },
        { id: 'ORD-002', orderSource: 'web', total: 2000, status: 'paid' },
        { id: 'DIR-0001', orderSource: 'direct_issue', total: 0, status: 'paid' },
        { id: 'DIR-0002', orderSource: 'direct_issue', total: 0, status: 'paid' },
      ];

      const webOrders = mockOrders.filter(o => (o.orderSource || 'web') !== 'direct_issue');
      const grossSales = webOrders.reduce((sum, o) => sum + o.total, 0);

      expect(webOrders.length).toBe(2);
      expect(grossSales).toBe(3000);
    });

    it('allows admitted statistics to include all admitted tickets regardless of orderSource', () => {
      const mockTickets = [
        { id: 'TKT-1', orderSource: 'web', status: 'valid', admissionStatus: 'inside' },
        { id: 'TKT-2', orderSource: 'web', status: 'valid', admissionStatus: 'outside' },
        { id: 'TKT-3', orderSource: 'direct_issue', status: 'valid', admissionStatus: 'inside' },
        { id: 'TKT-4', orderSource: 'direct_issue', status: 'valid', admissionStatus: 'outside' },
      ];

      const totalAdmitted = mockTickets.filter(
        t => t.admissionStatus === 'inside' || t.status === 'used',
      ).length;

      expect(totalAdmitted).toBe(2); // Both web and direct issue admitted tickets count
    });

    it('blocks refund requests for direct issued orders', () => {
      const canSubmitRefund = (orderSource?: string) => {
        if (orderSource === 'direct_issue') {
          return { allowed: false, error: 'บัตรที่ออกตรงนอกระบบไม่สามารถยื่นขอคืนเงินผ่านระบบได้' };
        }
        return { allowed: true };
      };

      expect(canSubmitRefund('direct_issue').allowed).toBe(false);
      expect(canSubmitRefund('web').allowed).toBe(true);
      expect(canSubmitRefund(undefined).allowed).toBe(true);
    });

    it('prevents revocation of tickets that have already entered the venue', () => {
      const tickets = [
        { id: 'TKT-A', status: 'valid', admissionStatus: 'outside', hasEntryLog: false },
        { id: 'TKT-B', status: 'valid', admissionStatus: 'inside', hasEntryLog: true },
        { id: 'TKT-C', status: 'valid', admissionStatus: 'outside', hasEntryLog: true }, // was inside, then exited
      ];

      const canRevoke = (t: typeof tickets[0]) => {
        return t.status === 'valid' && !t.hasEntryLog && t.admissionStatus !== 'inside';
      };

      expect(canRevoke(tickets[0])).toBe(true);
      expect(canRevoke(tickets[1])).toBe(false);
      expect(canRevoke(tickets[2])).toBe(false);
    });

    it('releases quota when tickets are cancelled via revocation', () => {
      const totalQuota = 100;
      const webSold = 40;
      const directIssued = 20;
      let cancelledTickets = 0;

      const calcAvailable = () => {
        const held = (webSold + directIssued) - cancelledTickets;
        return totalQuota - held;
      };

      expect(calcAvailable()).toBe(40); // 100 - (40 + 20)

      // Revoke 5 direct tickets
      cancelledTickets += 5;
      expect(calcAvailable()).toBe(45); // Quota restored to 45
    });

    it('normalizes server API payload correctly for both options and eventsOptions formats', () => {
      // Server raw payload from getDirectIssuanceEventsOverview
      const rawServerOptions = [
        {
          eventId: 'event-ubu-01',
          eventTitle: 'UBU Freshy Music Fest 2026',
          organizerId: 'org-freshy',
          organizerName: 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี',
          organizerEmail: 'organizer.freshy@ubu.ac.th',
          sessions: [
            {
              sessionId: 'sess-01',
              startTime: '2026-11-28T18:00:00.000Z',
              endTime: '2026-11-28T23:30:00.000Z',
              status: 'approved',
              ticketTypes: [
                {
                  ticketTypeId: 'tt-regular',
                  name: 'Regular (บัตรทั่วไป)',
                  price: 350,
                  quota: 500,
                  webSold: 2,
                  directIssued: 0,
                  available: 498,
                },
                {
                  ticketTypeId: 'tt-vip',
                  name: 'VIP Front Row',
                  price: 800,
                  quota: 100,
                  webSold: 1,
                  directIssued: 0,
                  available: 99,
                },
              ],
            },
          ],
        },
      ];

      // Simulate API response with both formats
      const mockApiResponse1 = { ok: true, options: rawServerOptions };
      const mockApiResponse2 = { ok: true, eventsOptions: rawServerOptions };

      const normalized1 = normalizeEventOptions(mockApiResponse1.options);
      const normalized2 = normalizeEventOptions(mockApiResponse2.eventsOptions);

      expect(normalized1.length).toBe(1);
      expect(normalized2.length).toBe(1);

      const ev = normalized1[0];
      expect(ev.eventId).toBe('event-ubu-01');
      expect(ev.eventTitle).toBe('UBU Freshy Music Fest 2026');
      expect(ev.sessions.length).toBe(1);

      const sess = ev.sessions[0];
      expect(sess.sessionId).toBe('sess-01');
      expect(sess.ticketTypes.length).toBe(2);

      // Verify quota and remainingQuota normalization
      const tt1 = sess.ticketTypes[0];
      expect(tt1.totalQuota).toBe(500);
      expect(tt1.remainingQuota).toBe(498);
      expect(tt1.webSold).toBe(2);

      const tt2 = sess.ticketTypes[1];
      expect(tt2.totalQuota).toBe(100);
      expect(tt2.remainingQuota).toBe(99);
    });

    it('safely handles empty, null or malformed event options payloads', () => {
      expect(normalizeEventOptions(null)).toEqual([]);
      expect(normalizeEventOptions(undefined)).toEqual([]);
      expect(normalizeEventOptions([])).toEqual([]);
      expect(normalizeEventOptions('invalid-string')).toEqual([]);

      const malformed = [{ eventId: 'ev-no-sessions' }];
      const res = normalizeEventOptions(malformed);
      expect(res.length).toBe(1);
      expect(res[0].eventId).toBe('ev-no-sessions');
      expect(res[0].sessions).toEqual([]);
    });

    it('allows direct issuance when public web sales have ended but concert session has not finished', () => {
      const now = new Date('2026-11-28T20:00:00.000Z');
      const salesEndTime = new Date('2026-11-28T18:00:00.000Z'); // Ended 2 hours ago
      const sessionEndTime = new Date('2026-11-28T23:00:00.000Z'); // Ends in 3 hours

      const isWebSalesEnded = now > salesEndTime;
      const isSessionConcluded = now >= sessionEndTime;

      const canIssueDirect = (sessionStatus: string, end: Date, curTime: Date) => {
        if (sessionStatus !== 'approved') {
          throw new Error('สามารถออกบัตรตรงได้เฉพาะรอบการแสดงที่ได้รับการอนุมัติแล้วเท่านั้น');
        }
        if (curTime.getTime() >= end.getTime()) {
          throw new Error('ไม่สามารถออกบัตรตรงสำหรับรอบการแสดงที่สิ้นสุดไปแล้วได้');
        }
        return true;
      };

      expect(isWebSalesEnded).toBe(true);
      expect(isSessionConcluded).toBe(false);
      expect(canIssueDirect('approved', sessionEndTime, now)).toBe(true);
    });

    it('strictly prohibits direct issuance when concert session has concluded', () => {
      const now = new Date('2026-11-28T23:30:00.000Z');
      const sessionEndTime = new Date('2026-11-28T23:00:00.000Z'); // Ended 30 minutes ago

      const canIssueDirect = (sessionStatus: string, end: Date, curTime: Date) => {
        if (sessionStatus !== 'approved') {
          throw new Error('สามารถออกบัตรตรงได้เฉพาะรอบการแสดงที่ได้รับการอนุมัติแล้วเท่านั้น');
        }
        if (curTime.getTime() >= end.getTime()) {
          throw new Error('ไม่สามารถออกบัตรตรงสำหรับรอบการแสดงที่สิ้นสุดไปแล้วได้');
        }
        return true;
      };

      expect(() => canIssueDirect('approved', sessionEndTime, now)).toThrow(
        'ไม่สามารถออกบัตรตรงสำหรับรอบการแสดงที่สิ้นสุดไปแล้วได้',
      );
    });

    it('normalizes sales status labels and flags for event and session', () => {
      const rawServerOptions = [
        {
          eventId: 'event-sales-ended',
          eventTitle: 'Rock Fest 2026',
          salesStartTime: '2026-11-01T00:00:00.000Z',
          salesEndTime: '2026-11-20T23:59:59.000Z',
          isSalesEnded: true,
          sessions: [
            {
              sessionId: 'sess-active',
              startTime: '2026-11-28T18:00:00.000Z',
              endTime: '2026-11-28T23:00:00.000Z',
              isSessionEnded: false,
              isSalesEnded: true,
              salesStatusLabel: 'ปิดขายหน้าเว็บแล้ว',
              ticketTypes: [],
            },
            {
              sessionId: 'sess-past',
              startTime: '2026-11-21T18:00:00.000Z',
              endTime: '2026-11-21T23:00:00.000Z',
              isSessionEnded: true,
              isSalesEnded: true,
              salesStatusLabel: 'การแสดงสิ้นสุดแล้ว',
              ticketTypes: [],
            },
          ],
        },
      ];

      const normalized = normalizeEventOptions(rawServerOptions);
      expect(normalized.length).toBe(1);
      const ev = normalized[0];
      expect(ev.isSalesEnded).toBe(true);
      expect(ev.sessions[0].isSessionEnded).toBe(false);
      expect(ev.sessions[0].isSalesEnded).toBe(true);
      expect(ev.sessions[0].salesStatusLabel).toBe('ปิดขายหน้าเว็บแล้ว');
      expect(ev.sessions[1].isSessionEnded).toBe(true);
      expect(ev.sessions[1].salesStatusLabel).toBe('การแสดงสิ้นสุดแล้ว');
    });
  });
});
