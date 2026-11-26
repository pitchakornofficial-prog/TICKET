import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockPool = { query: vi.fn() };

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: { getSession: mockGetSession },
    options: { database: mockPool, secret: 'test-secret-key' },
  }),
}));

vi.mock('@/server/origin', () => ({
  assertSameOrigin: () => null,
}));

const mockEnsureOrganizerPrimaryScanner = vi.fn();
const mockBindOrganizerPrimaryDevice = vi.fn();

vi.mock('@/server/events', () => ({
  ORGANIZER_PRIMARY_SCANNER_PREFIX: 'organizer-primary-',
  ensureEventSchema: vi.fn().mockResolvedValue(undefined),
  ensureOrganizerPrimaryScanner: (...args: unknown[]) => mockEnsureOrganizerPrimaryScanner(...args),
  bindOrganizerPrimaryDevice: (...args: unknown[]) => mockBindOrganizerPrimaryDevice(...args),
}));

const mockIssueScannerAccessTokenForOrganizer = vi.fn();

vi.mock('@/server/scanner-access', () => ({
  issueScannerAccessTokenForOrganizer: (...args: unknown[]) => mockIssueScannerAccessTokenForOrganizer(...args),
  revokeScannerAccessTokens: vi.fn().mockResolvedValue(0),
}));

const mockVerifyScannerSessionEventScope = vi.fn();

vi.mock('@/server/scanner-scope', () => ({
  verifyScannerSessionEventScope: (...args: unknown[]) => mockVerifyScannerSessionEventScope(...args),
}));

const mockGetOfflineDataset = vi.fn();

vi.mock('@/server/primary-scanner', () => ({
  getOfflineDataset: (...args: unknown[]) => mockGetOfflineDataset(...args),
}));

const mockSyncOfflineAdmissionScans = vi.fn();

vi.mock('@/server/admission', () => ({
  syncOfflineAdmissionScans: (...args: unknown[]) => mockSyncOfflineAdmissionScans(...args),
}));

import { POST as issueTokenPost } from '../../src/app/api/organizer/events/[id]/scanners/[scannerId]/access-token/route';
import { GET as getOfflineDatasetRoute } from '../../src/app/api/scanner/events/[id]/offline-dataset/route';
import { POST as postOfflineSyncRoute } from '../../src/app/api/scanner/events/[id]/offline-sync/route';

describe('Primary Scanner QR/Link, Device Binding & Organizer Offline Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyScannerSessionEventScope.mockResolvedValue({ allowed: true });
  });

  it('auto-provisions primary scanner and issues QR/access token for organizer-primary-* ID', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'org-1', role: 'organizer', name: 'Organizer One' },
    });
    mockEnsureOrganizerPrimaryScanner.mockResolvedValue({
      scannerId: 'real-primary-uuid',
      name: 'เครื่องหลักของผู้จัด (Organizer Primary Device)',
      email: 'primary+ev-1@scanner.ticket.local',
    });
    mockIssueScannerAccessTokenForOrganizer.mockResolvedValue({
      id: 'SAT-1',
      rawToken: 'tok-123',
      accessUrl: '/scanner/access?token=tok-123',
      expiresAt: '2026-11-28T00:00:00.000Z',
    });

    const req = new Request('http://127.0.0.1:3000/api/organizer/events/ev-1/scanners/organizer-primary-ev-1/access-token', {
      method: 'POST',
    });
    const res = await issueTokenPost(req, {
      params: Promise.resolve({ id: 'ev-1', scannerId: 'organizer-primary-ev-1' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.scannerId).toBe('real-primary-uuid');
    expect(body.accessUrl).toBe('/scanner/access?token=tok-123');
    expect(mockEnsureOrganizerPrimaryScanner).toHaveBeenCalledWith(mockPool, 'org-1', 'ev-1');
    expect(mockIssueScannerAccessTokenForOrganizer).toHaveBeenCalledWith(
      mockPool,
      'org-1',
      'ev-1',
      'real-primary-uuid',
    );
  });

  it('binds organizer device and sets scanner_device_id cookie when downloading offline dataset', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'org-1', role: 'organizer', name: 'Organizer One' },
    });
    mockBindOrganizerPrimaryDevice.mockResolvedValue({
      status: 'ok',
      scannerId: 'real-primary-uuid',
    });
    mockGetOfflineDataset.mockResolvedValue({
      event: { id: 'ev-1', title: 'Concert', location: 'Hall', status: 'published' },
      primaryScanner: null,
      isCurrentScannerPrimary: true,
      sessions: [],
      tickets: [],
      admissionLogs: [],
      lastSuccessfulSync: '2026-11-26T14:00:00.000Z',
      syncTimestamp: '2026-11-26T14:00:00.000Z',
      totalTickets: 0,
      isOfflineHalted: false,
      offlineStatus: 'active',
    });

    const req = new Request('http://127.0.0.1:3000/api/scanner/events/ev-1/offline-dataset');
    const res = await getOfflineDatasetRoute(req, {
      params: Promise.resolve({ id: 'ev-1' }),
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('scanner_device_id=');
    expect(mockBindOrganizerPrimaryDevice).toHaveBeenCalledTimes(1);
    expect(mockGetOfflineDataset).toHaveBeenCalledWith(
      mockPool,
      { id: 'org-1', role: 'organizer' },
      'ev-1',
    );
  });

  it('returns 409 when organizer downloads offline dataset on a different device while primary is already bound', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'org-1', role: 'organizer', name: 'Organizer One' },
    });
    mockBindOrganizerPrimaryDevice.mockResolvedValue({
      status: 'bound_other_device',
      scannerId: 'real-primary-uuid',
    });

    const req = new Request('http://127.0.0.1:3000/api/scanner/events/ev-1/offline-dataset', {
      headers: { cookie: 'scanner_device_id=device-b' },
    });
    const res = await getOfflineDatasetRoute(req, {
      params: Promise.resolve({ id: 'ev-1' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toContain('รีเซ็ตการผูกเครื่อง');
    expect(mockGetOfflineDataset).not.toHaveBeenCalled();
  });

  it('allows organizer on bound primary device to sync offline admission scans and blocks unbound/owner', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'org-1', role: 'organizer', name: 'Organizer One' },
    });
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          scannerId: 'real-primary-uuid',
          scannerName: 'Primary Device',
          boundDeviceId: 'device-1',
        },
      ],
    });
    mockSyncOfflineAdmissionScans.mockResolvedValue({
      syncedCount: 1,
      conflictsCount: 0,
      securityRejectionsCount: 0,
      acknowledgedIds: ['scan-1'],
      conflicts: [],
      securityRejections: [],
      authorizationLost: false,
    });

    const orgReq = new Request('http://127.0.0.1:3000/api/scanner/events/ev-1/offline-sync', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'scanner_device_id=device-1',
      },
      body: JSON.stringify({ scans: [{ id: 'scan-1' }] }),
    });
    const orgRes = await postOfflineSyncRoute(orgReq, {
      params: Promise.resolve({ id: 'ev-1' }),
    });

    expect(orgRes.status).toBe(200);
    expect(mockSyncOfflineAdmissionScans).toHaveBeenCalledWith(
      mockPool,
      { id: 'real-primary-uuid', role: 'scanner', name: 'Primary Device' },
      'ev-1',
      { scans: [{ id: 'scan-1' }] },
    );

    mockGetSession.mockResolvedValueOnce({
      user: { id: 'owner-1', role: 'owner', name: 'Owner' },
    });
    const ownerReq = new Request('http://127.0.0.1:3000/api/scanner/events/ev-1/offline-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scans: [] }),
    });
    const ownerRes = await postOfflineSyncRoute(ownerReq, {
      params: Promise.resolve({ id: 'ev-1' }),
    });
    expect(ownerRes.status).toBe(403);
  });

  it('filters organizer scanner manager to approved concerts only and uses non-squished QR reissue & grid layout', () => {
    const managerSrc = readFileSync(
      join(process.cwd(), 'src', 'components', 'organizer-scanner-manager.tsx'),
      'utf8',
    );
    const cssSrc = readFileSync(
      join(process.cwd(), 'src', 'app', 'back-office', 'back-office.css'),
      'utf8',
    );

    expect(managerSrc).toContain("ev.status === 'approved'");
    expect(managerSrc).toContain('ยังไม่มีคอนเสิร์ตที่ได้รับอนุมัติ');
    expect(managerSrc).toContain('scanner-qr-reissue-box');
    expect(cssSrc).toContain('.scanner-qr-reissue-box');
    expect(cssSrc).toContain('grid-template-columns: minmax(0, 1fr) auto;');
  });
});
