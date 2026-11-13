import { describe, expect, it } from 'vitest';
import { getEventSalesStatus, isSessionEnded } from '@/lib/sales-window';

describe('Event sales window evaluation helper', () => {
  const now = new Date('2026-11-12T12:00:00.000Z');

  it('marks event as not started when salesStartTime is in the future', () => {
    const status = getEventSalesStatus(
      {
        salesStartTime: '2026-11-30T14:08:00.000Z',
        salesEndTime: '2026-12-31T14:08:00.000Z',
        sessions: [{ endTime: '2027-01-31T14:09:00.000Z' }],
      },
      now,
    );
    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe('not_started');
    expect(status.message).toBe('ยังไม่ถึงเวลาเปิดจำหน่ายบัตร');
  });

  it('marks event as ended when salesEndTime has passed', () => {
    const status = getEventSalesStatus(
      {
        salesStartTime: '2026-11-04T16:28:49.107Z',
        salesEndTime: '2026-11-07T16:29:49.107Z',
        sessions: [{ endTime: '2026-11-08T17:29:49.107Z' }],
      },
      now,
    );
    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe('ended');
    expect(status.message).toBe('หมดเวลาการจำหน่ายบัตรแล้ว');
  });

  it('marks event as ended when all sessions have already ended', () => {
    const status = getEventSalesStatus(
      {
        salesStartTime: null,
        salesEndTime: null,
        sessions: [{ endTime: '2026-11-08T17:29:49.107Z' }],
      },
      now,
    );
    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe('sessions_ended');
    expect(isSessionEnded({ endTime: '2026-11-08T17:29:49.107Z' }, now)).toBe(true);
  });

  it('marks event as open when within sales window and at least one session has not ended', () => {
    const status = getEventSalesStatus(
      {
        salesStartTime: '2026-11-10T00:00:00.000Z',
        salesEndTime: '2026-11-20T00:00:00.000Z',
        sessions: [
          { endTime: '2026-11-11T00:00:00.000Z' },
          { endTime: '2026-11-25T00:00:00.000Z' },
        ],
      },
      now,
    );
    expect(status.isOpen).toBe(true);
    expect(status.reason).toBe('open');
    expect(status.message).toBeNull();
  });
});
