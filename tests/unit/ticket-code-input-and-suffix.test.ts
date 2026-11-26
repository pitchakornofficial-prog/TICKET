import { describe, expect, it } from 'vitest';
import {
  buildSegmentedTicketQuery,
  formatTicketCodeInput,
  isTicketSuffixShortcut,
  parseOrderAndSuffixPattern,
  parsePastedTicketSegments,
} from '@/lib/ticket-code-input';
import {
  getOfflineDatasetKey,
  performOfflineAdmissionScan,
} from '@/lib/offline-admission';
import { createOfflineAssignmentToken } from '@/server/offline-assignment-token';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe('ticket-code-input helpers', () => {
  it('preserves full QR payloads from 2D barcode scanners', () => {
    const qr = 'TKT-QR-550e8400-e29b-41d4-a716-446655440000';
    expect(formatTicketCodeInput(qr)).toBe(qr);
  });

  it('keeps 1-8 char inputs unprefixed and uppercase for suffix shortcut', () => {
    expect(formatTicketCodeInput('9c4e12b0')).toBe('9C4E12B0');
    expect(isTicketSuffixShortcut('9c4e12b0')).toBe(true);
    expect(isTicketSuffixShortcut('9c4e12b')).toBe(false);
    expect(isTicketSuffixShortcut('TK-8F3A-01-9C4E12B0')).toBe(false);
  });

  it('auto-prefixes TK- and auto-inserts dashes for full manual entry', () => {
    expect(formatTicketCodeInput('8f3a019c4e12b0')).toBe('TK-8F3A-01-9C4E12B0');
    expect(formatTicketCodeInput('tk8f3a019c4e12b0')).toBe('TK-8F3A-01-9C4E12B0');
    expect(formatTicketCodeInput('TK', 'TK-')).toBe('TK');
  });

  it('builds segmented queries and parses pasted ticket codes', () => {
    expect(buildSegmentedTicketQuery({ orderPart: '', indexPart: '', suffixPart: '9c4e12b0' })).toBe('9C4E12B0');
    expect(buildSegmentedTicketQuery({ orderPart: '8f3a', indexPart: '', suffixPart: '9c4e12b0' })).toBe('TK-8F3A-%-9C4E12B0');
    expect(buildSegmentedTicketQuery({ orderPart: '8f3a', indexPart: '01', suffixPart: '9c4e12b0' })).toBe('TK-8F3A-01-9C4E12B0');
    expect(parseOrderAndSuffixPattern('TK-8F3A-%-9C4E12B0')).toEqual({ orderPart: '8F3A', suffixPart: '9C4E12B0' });
    expect(parsePastedTicketSegments('TK-8F3A-01-9C4E12B0')).toEqual({
      orderPart: '8F3A',
      indexPart: '01',
      suffixPart: '9C4E12B0',
    });
    expect(parsePastedTicketSegments('TKT-QR-abc')).toEqual({ rawQrPayload: 'TKT-QR-abc' });
  });
});

describe('offline admission 8-char suffix & order+suffix shortcut', () => {
  it('admits a unique ticket by 8-char suffix, rejects ambiguous duplicates, and disambiguates with orderPart', () => {
    const storage = createMemoryStorage();
    const eventId = 'evt-suffix-1';
    const sessionId = 'sess-suffix-1';
    const scannerId = 'scan-primary-1';
    const assignmentToken = createOfflineAssignmentToken({
      eventId,
      scannerId,
      assignmentEpoch: 1,
    });

    const windowStart = new Date(Date.now() - 3600_000).toISOString();
    const windowEnd = new Date(Date.now() + 3600_000).toISOString();

    const dataset = {
      version: 1,
      event: { id: eventId, title: 'Test Concert' },
      sessions: [
        {
          id: sessionId,
          startTime: windowStart,
          endTime: windowEnd,
        },
      ],
      primaryScanner: {
        scannerId,
        scannerName: 'Primary',
        assignmentEpoch: 1,
        assignmentToken,
      },
      tickets: [
        {
          id: 't1',
          ticketCode: 'TK-8F3A-01-9C4E12B0',
          qrHash: 'hash-1',
          sessionId,
          ticketTypeId: 'tt-1',
          ticketTypeName: 'VIP',
          ticketPrice: 1000,
          status: 'valid',
          admissionStatus: 'outside',
          isRefunded: false,
          admissionWindow: { startTime: windowStart, endTime: windowEnd },
        },
        {
          id: 't2',
          ticketCode: 'TK-1111-01-AABBCCDD',
          qrHash: 'hash-2',
          sessionId,
          ticketTypeId: 'tt-2',
          ticketTypeName: 'GA',
          ticketPrice: 500,
          status: 'valid',
          admissionStatus: 'outside',
          isRefunded: false,
          admissionWindow: { startTime: windowStart, endTime: windowEnd },
        },
        {
          id: 't3',
          ticketCode: 'TK-2222-01-AABBCCDD',
          qrHash: 'hash-3',
          sessionId,
          ticketTypeId: 'tt-2',
          ticketTypeName: 'GA',
          ticketPrice: 500,
          status: 'valid',
          admissionStatus: 'outside',
          isRefunded: false,
          admissionWindow: { startTime: windowStart, endTime: windowEnd },
        },
      ],
    };

    storage.setItem(getOfflineDatasetKey(eventId), JSON.stringify(dataset));

    const okRes = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId,
        scannerName: 'Primary',
        isPrimary: true,
        qrPayloadOrCode: '9c4e12b0',
        action: 'entry',
      },
      storage,
    );
    expect(okRes.success).toBe(true);
    expect(okRes.ticket?.ticketCode).toBe('TK-8F3A-01-9C4E12B0');

    const ambigRes = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId,
        scannerName: 'Primary',
        isPrimary: true,
        qrPayloadOrCode: 'aabbccdd',
        action: 'entry',
      },
      storage,
    );
    expect(ambigRes.success).toBe(false);
    expect(ambigRes.reason).toBe('AMBIGUOUS_TICKET_SUFFIX');

    const disambigRes = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId,
        scannerName: 'Primary',
        isPrimary: true,
        qrPayloadOrCode: 'TK-2222-%-AABBCCDD',
        action: 'entry',
      },
      storage,
    );
    expect(disambigRes.success).toBe(true);
    expect(disambigRes.ticket?.ticketCode).toBe('TK-2222-01-AABBCCDD');
  });
});
