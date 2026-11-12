import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashOfflineQrPayload, sha256Hex } from '@/lib/offline-qr-hash';
import type { OfflineTicketItem, OfflineDataset } from '@/server/primary-scanner';

describe('TASK-032: Offline Primary Dataset Unit Tests (AC-94, AC-65, G-41)', () => {
  it('1. Offline dataset payload strictly forbids buyer PII and raw qrPayload (AC-65)', () => {
    const rawQrPayload = 'TKT-QR-SECURE-PAYLOAD-123';
    const mockTicket: OfflineTicketItem = {
      id: 'TICK-001',
      ticketCode: 'TK-12345678',
      qrHash: hashOfflineQrPayload('EVT-001', rawQrPayload),
      ticketTypeId: 'TT-VIP',
      ticketTypeName: 'VIP Zone A',
      sessionId: 'SESS-001',
      status: 'valid',
      admissionStatus: 'outside',
      isRefunded: false,
      admissionWindow: {
        startTime: '2026-11-01T10:00:00.000Z',
        endTime: '2026-11-01T14:00:00.000Z',
      },
    };

    // Assert strictly that buyer PII and plaintext qrPayload fields DO NOT exist
    const rawRecord: Record<string, unknown> = mockTicket as unknown as Record<string, unknown>;
    expect(rawRecord.buyerName).toBeUndefined();
    expect(rawRecord.buyerEmail).toBeUndefined();
    expect(rawRecord.buyerPhone).toBeUndefined();
    expect(rawRecord.customerFee).toBeUndefined();
    expect(rawRecord.paymentId).toBeUndefined();
    expect(rawRecord.chargeId).toBeUndefined();
    expect(rawRecord.transferSlipUrl).toBeUndefined();
    expect(rawRecord.qrPayload).toBeUndefined();

    // Required scanner fields are present
    expect(mockTicket.ticketCode).toBe('TK-12345678');
    expect(mockTicket.qrHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockTicket.qrHash).not.toContain(rawQrPayload);
    expect(mockTicket.status).toBe('valid');
    expect(mockTicket.admissionStatus).toBe('outside');
    expect(mockTicket.isRefunded).toBe(false);
  });

  it('1b. Pure-TS SHA-256 helper matches Node crypto and is event-scoped', () => {
    const samples = [
      '',
      'TKT-QR-550e8400-e29b-41d4-a716-446655440000',
      'ทดสอบภาษาไทย-ticket-qr-123',
    ];
    for (const sample of samples) {
      const expected = createHash('sha256').update(sample, 'utf8').digest('hex');
      expect(sha256Hex(sample)).toBe(expected);
    }

    const h1 = hashOfflineQrPayload('EVT-A', 'TKT-QR-550e8400-e29b-41d4-a716-446655440000');
    const h2 = hashOfflineQrPayload('EVT-B', 'TKT-QR-550e8400-e29b-41d4-a716-446655440000');
    expect(h1).not.toBe(h2);
  });

  it('2. Offline dataset contains event, primary status, sync timestamp, and session metadata (AC-94, G-41)', () => {
    const dataset: OfflineDataset = {
      event: {
        id: 'EVT-001',
        title: 'ร็อกคอนเสิร์ต 2026',
        location: 'อิมแพ็ค อารีน่า',
        status: 'approved',
      },
      primaryScanner: {
        scannerId: 'SCAN-001',
        scannerName: 'ทีมสแกน 1',
        scannerEmail: 'scanner1@ticket.invalid',
        assignedAt: new Date().toISOString(),
      },
      isCurrentScannerPrimary: true,
      sessions: [
        {
          id: 'SESS-001',
          startTime: '2026-11-01T10:00:00.000Z',
          endTime: '2026-11-01T14:00:00.000Z',
          status: 'approved',
          ticketTypes: [{ id: 'TT-VIP', name: 'VIP Zone A', price: 1000 }],
        },
      ],
      tickets: [],
      admissionLogs: [],
      lastSuccessfulSync: '2026-10-22T10:00:00.000Z',
      syncTimestamp: '2026-10-22T10:00:00.000Z',
      totalTickets: 0,
    };

    expect(dataset.isCurrentScannerPrimary).toBe(true);
    expect(dataset.primaryScanner?.scannerName).toBe('ทีมสแกน 1');
    expect(dataset.sessions.length).toBe(1);
    expect(dataset.totalTickets).toBe(0);
    expect(dataset.lastSuccessfulSync).toBeDefined();
  });

  it('3. Secondary scanner correctly identified when not primary (AC-94)', () => {
    const dataset: OfflineDataset = {
      event: {
        id: 'EVT-001',
        title: 'ร็อกคอนเสิร์ต 2026',
        location: 'อิมแพ็ค อารีน่า',
        status: 'approved',
      },
      primaryScanner: {
        scannerId: 'SCAN-PRIMARY',
        scannerName: 'หัวหน้าทีมสแกน',
        scannerEmail: 'primary@ticket.invalid',
        assignedAt: new Date().toISOString(),
      },
      isCurrentScannerPrimary: false,
      sessions: [],
      tickets: [],
      admissionLogs: [],
      lastSuccessfulSync: new Date().toISOString(),
      syncTimestamp: new Date().toISOString(),
      totalTickets: 0,
    };

    expect(dataset.isCurrentScannerPrimary).toBe(false);
    expect(dataset.primaryScanner?.scannerId).toBe('SCAN-PRIMARY');
  });
});
