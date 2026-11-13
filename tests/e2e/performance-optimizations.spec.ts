import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { browserModules } from '../../scripts/benchmarks/browser.mjs';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { testClientIp } from '../support/client-context';

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(info) });
});

test('real Next media HTTP resizes public uploads and denies anonymous private variants', async ({ page, request }) => {
  test.setTimeout(60000);
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/owner');
  const poster = await sharp({ create: { width: 1600, height: 2200, channels: 3, background: '#2266cc' } }).jpeg().toBuffer();
  const upload = async (visibility: string) => {
    const response = await page.request.post('/api/upload', { multipart: {
      visibility, file: { name: 'local-benchmark.jpg', mimeType: 'image/jpeg', buffer: poster },
    } });
    expect(response.status(), await response.text()).toBe(201);
    return response.json() as Promise<{ url: string }>;
  };
  const publicImage = await upload('public');
  for (const format of ['avif', 'webp']) {
    const res = await request.get(`${publicImage.url}?w=360&fm=${format}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe(`image/${format}`);
    const bytes = await res.body();
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(360);
    expect(bytes.length).toBeLessThan(poster.length);
    const warm = await request.get(`${publicImage.url}?w=360&fm=${format}`);
    expect(await warm.body()).toEqual(bytes);
  }
  const privateImage = await upload('private');
  const denied = await request.get(`${privateImage.url}?w=360&fm=avif`);
  expect(denied.status()).toBe(403);
  const ownerRead = await page.request.get(privateImage.url);
  expect(ownerRead.status()).toBe(200);
  expect(ownerRead.headers()['cache-control']).toContain('private');
});

test('native IndexedDB preserves replacement snapshots, reload state and pending entry/exit logs', async ({ page }) => {
  await page.goto('/login');
  await page.addScriptTag({ content: browserModules() });
  const initial = await page.evaluate<{
    entry: { success: boolean }; duplicate: { reason: string }; pending: number; replacementDenied: boolean;
    legacy: { entry: boolean; totalTickets: number; pending: number; reason: string; halted: boolean; oldSnapshot: null; oldPending: null };
  }>(`(async () => {
    const now = Date.now();
    sessionStorage.setItem('native-idb-fixed-time', String(now));
    const dataset = {
      event: { id: 'e2e-native-idb', title: 'Native browser regression', location: 'Local', status: 'approved' },
      primaryScanner: null, isCurrentScannerPrimary: true, sessions: [], admissionLogs: [],
      lastSuccessfulSync: new Date(now).toISOString(), syncTimestamp: new Date(now).toISOString(), totalTickets: 1,
      tickets: [{ id: 't1', ticketCode: 'T1', qrHash: window.__hash.hashOfflineQrPayload('e2e-native-idb', 'QR1'),
        ticketTypeId: 'tt1', ticketTypeName: 'Standing', sessionId: 'session1', status: 'valid',
        admissionStatus: 'outside', isRefunded: false,
        admissionWindow: { startTime: new Date(now - 3600000).toISOString(), endTime: new Date(now + 3600000).toISOString() } }]
    };
    await window.__offline.saveOfflineDatasetAsync(dataset.event.id, dataset);
    await window.__offline.saveOfflineDatasetAsync(dataset.event.id, dataset);
    const input = { eventId: dataset.event.id, sessionId: 'session1', scannerId: 'scanner', scannerName: 'Scanner', isPrimary: true, action: 'entry', qrPayloadOrCode: 'QR1', now: new Date(now) };
    const oldDateNow = Date.now, oldRandom = Math.random;
    let entry;
    try {
      Date.now = () => now; Math.random = () => .9;
      entry = await window.__offline.performOfflineAdmissionScanAsync(input);
    } finally { Date.now = oldDateNow; Math.random = oldRandom; }
    const duplicate = await window.__offline.performOfflineAdmissionScanAsync(input);
    let replacementDenied = false;
    try { await window.__offline.saveOfflineDatasetAsync(dataset.event.id, dataset); }
    catch (err) { replacementDenied = err.message.includes('ซิงก์'); }
    const legacyId = 'e2e-legacy-migration';
    const legacy = { ...dataset, event: { ...dataset.event, id: legacyId }, tickets: [{ ...dataset.tickets[0], qrHash: window.__hash.hashOfflineQrPayload(legacyId, 'QR1') }] };
    localStorage.setItem(window.__legacyOffline.getOfflineDatasetKey(legacyId), JSON.stringify(legacy));
    const legacyEntry = window.__legacyOffline.performOfflineAdmissionScan({ ...input, eventId: legacyId });
    const [migratedMeta, migratedPending] = await Promise.all([
      window.__offline.getOfflineDatasetMetaAsync(legacyId), window.__offline.getOfflinePendingScansAsync(legacyId),
    ]);
    const migratedDuplicate = await window.__offline.performOfflineAdmissionScanAsync({ ...input, eventId: legacyId });
    return { entry, duplicate, replacementDenied, pending: (await window.__offline.getOfflinePendingScansAsync(dataset.event.id)).length,
      legacy: { entry: legacyEntry.success, totalTickets: migratedMeta.totalTickets, pending: migratedPending.length, reason: migratedDuplicate.reason, halted: Boolean(migratedMeta.isOfflineHalted),
        oldSnapshot: localStorage.getItem(window.__legacyOffline.getOfflineDatasetKey(legacyId)),
        oldPending: localStorage.getItem(window.__legacyOffline.getOfflinePendingScansKey(legacyId)) } };
  })()`);
  expect(initial.entry.success).toBe(true);
  expect(initial.duplicate.reason).toBe('ALREADY_INSIDE');
  expect(initial.pending).toBe(1);
  expect(initial.replacementDenied).toBe(true);
  expect(initial.legacy).toEqual({ entry: true, totalTickets: 1, pending: 1, reason: 'ALREADY_INSIDE', halted: false, oldSnapshot: null, oldPending: null });
  await page.reload();
  await page.addScriptTag({ content: browserModules() });
  const resumed = await page.evaluate<{
    duplicate: { reason: string }; exit: { success: boolean }; reentry: { success: boolean }; pending: number; actions: string[]; afterExit: string[]; sequence: number[]; sameTimes: boolean;
  }>(`(async () => {
    const now = Number(sessionStorage.getItem('native-idb-fixed-time'));
    const input = { eventId: 'e2e-native-idb', sessionId: 'session1', scannerId: 'scanner', scannerName: 'Scanner', isPrimary: true, action: 'entry', qrPayloadOrCode: 'QR1', now: new Date(now) };
    const duplicate = await window.__offline.performOfflineAdmissionScanAsync(input);
    const oldDateNow = Date.now, oldRandom = Math.random;
    let exit, reentry, afterExit;
    try {
      Date.now = () => now; Math.random = () => .8;
      exit = await window.__offline.performOfflineAdmissionScanAsync({ ...input, action: 'exit' });
      afterExit = (await window.__offline.getOfflinePendingScansAsync(input.eventId)).map(scan => scan.action);
      Math.random = () => .7;
      reentry = await window.__offline.performOfflineAdmissionScanAsync(input);
    } finally { Date.now = oldDateNow; Math.random = oldRandom; }
    const pending = await window.__offline.getOfflinePendingScansAsync(input.eventId);
    return { duplicate, exit, reentry, afterExit, pending: pending.length, actions: pending.map(scan => scan.action), sequence: pending.map(scan => scan.localSequence), sameTimes: new Set(pending.map(scan => scan.scannedAt)).size === 1 };
  })()`);
  expect(resumed.duplicate.reason).toBe('ALREADY_INSIDE');
  expect(resumed.exit.success).toBe(true);
  expect(resumed.reentry.success).toBe(true);
  expect(resumed.pending).toBe(3);
  expect(resumed.sameTimes).toBe(true);
  expect(resumed.afterExit).toEqual(['entry', 'exit']);
  expect(resumed.actions).toEqual(['entry', 'exit', 'entry']);
  expect(resumed.sequence).toEqual([1, 2, 3]);
  await page.reload();
  await page.addScriptTag({ content: browserModules() });
  const afterReload = await page.evaluate<{ actions: string[]; sequence: number[] }>(`(async () => {
    const scans = await window.__offline.getOfflinePendingScansAsync('e2e-native-idb');
    return { actions: scans.map(scan => scan.action), sequence: scans.map(scan => scan.localSequence) };
  })()`);
  expect(afterReload.actions).toEqual(['entry', 'exit', 'entry']);
  expect(afterReload.sequence).toEqual([1, 2, 3]);
});

test('a terminal poll result remains stopped after visibility changes', async ({ page }) => {
  await page.goto('/login');
  await page.addScriptTag({ content: browserModules() });
  const observed = await page.evaluate(`(async () => {
    let calls = 0;
    const stop = window.__poll.startAdaptivePoller({ step: async () => { calls++; return { stop: true }; } });
    await new Promise(resolve => setTimeout(resolve, 0));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(resolve => setTimeout(resolve, 0));
    stop();
    return calls;
  })()`);
  expect(observed).toBe(1);
});
