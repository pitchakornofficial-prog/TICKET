import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  readActor: vi.fn(),
  verifyScope: vi.fn(),
  recordAdmissionScan: vi.fn(),
  syncOfflineAdmissionScans: vi.fn(),
}));

vi.mock('@/server/auth', () => ({ getAuth: mocks.getAuth, readActor: mocks.readActor }));
vi.mock('@/server/scanner-scope', () => ({ verifyScannerSessionEventScope: mocks.verifyScope }));
vi.mock('@/server/admission', () => ({
  recordAdmissionScan: mocks.recordAdmissionScan,
  syncOfflineAdmissionScans: mocks.syncOfflineAdmissionScans,
}));

import { POST as scanPost } from '../../src/app/api/scanner/admissions/scan/route';
import { POST as offlineSyncPost } from '../../src/app/api/scanner/events/[id]/offline-sync/route';

function requestWithStream(url: string, byteLength: number, headers: Record<string, string> = {}): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`{"scans":[],"pad":"${'x'.repeat(byteLength)}"}`));
      controller.close();
    },
  });
  return new Request(url, {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:3000', 'content-type': 'application/json', ...headers },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('scanner route CSRF and body limits', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_URL', 'http://127.0.0.1:3000');
    mocks.getAuth.mockReset().mockReturnValue({
      api: { getSession: vi.fn().mockResolvedValue({ user: { id: 'scanner-1', role: 'scanner', name: 'Scanner' } }) },
      options: { database: {}, secret: 'test-secret-with-at-least-32-characters' },
    });
    mocks.readActor.mockReset().mockResolvedValue({ id: 'scanner-1', role: 'scanner', name: 'Scanner' });
    mocks.verifyScope.mockReset().mockResolvedValue({ allowed: true });
    mocks.recordAdmissionScan.mockReset();
    mocks.syncOfflineAdmissionScans.mockReset();
  });

  it('rejects cross-site POSTs before session or database access on both endpoints', async () => {
    const scan = await scanPost(requestWithStream(
      'http://127.0.0.1:3000/api/scanner/admissions/scan',
      0,
      { origin: 'https://attacker.invalid', 'sec-fetch-site': 'cross-site' },
    ));
    const sync = await offlineSyncPost(
      requestWithStream('http://127.0.0.1:3000/api/scanner/events/event-1/offline-sync', 0, {
        origin: 'https://attacker.invalid',
        'sec-fetch-site': 'cross-site',
      }),
      { params: Promise.resolve({ id: 'event-1' }) },
    );

    expect(scan.status).toBe(403);
    expect(sync.status).toBe(403);
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.readActor).not.toHaveBeenCalled();
  });

  it('returns 413 for oversized scan and offline-sync streams without Content-Length', async () => {
    const scan = await scanPost(requestWithStream(
      'http://127.0.0.1:3000/api/scanner/admissions/scan',
      16 * 1024,
    ));
    const sync = await offlineSyncPost(
      requestWithStream('http://127.0.0.1:3000/api/scanner/events/event-1/offline-sync', 512 * 1024),
      { params: Promise.resolve({ id: 'event-1' }) },
    );

    expect(scan.status).toBe(413);
    expect(sync.status).toBe(413);
    expect(mocks.recordAdmissionScan).not.toHaveBeenCalled();
    expect(mocks.syncOfflineAdmissionScans).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
