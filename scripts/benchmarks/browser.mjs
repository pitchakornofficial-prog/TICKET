import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import ts from 'typescript';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { arch, platform, cpus } from 'node:os';

export const baselineRef = 'f623c17';
export function benchmarkEnvironment() {
  const files = ['src/server/reports.ts', 'src/server/events.ts', 'src/lib/adaptive-polling.ts',
    'src/lib/offline-admission.ts', 'src/app/api/media/[...key]/route.ts', 'src/components/responsive-image.tsx',
    'src/components/home-concert-catalog.tsx', 'src/app/page.tsx', 'src/components/navbar-search.tsx',
    'src/components/owner-finance-hub.tsx', 'src/components/organizer-finance-view.tsx',
    'src/components/organizer-overview-view.tsx', 'src/components/organizer-money-report-view.tsx',
    'src/components/queue-waiting-room.tsx', 'src/components/order-payment-view.tsx',
    'src/components/scanner-admission-terminal.tsx', 'package.json'];
  return {
    platform: platform(), arch: arch(), cpu: cpus()[0]?.model, sharp: sharp.versions.sharp,
    baselineCommit: execFileSync('git', ['rev-parse', baselineRef], { encoding: 'utf8' }).trim(),
    afterHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    afterWorkingTreeSourceSha256: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])),
  };
}
export function baselineSource(file) {
  return execFileSync('git', ['show', `${baselineRef}:${file}`], { encoding: 'utf8' });
}
function browserModule(source, name) {
  const js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  return `window.${name}=(()=>{const exports={};const require=()=>window.__hash;${js}\nreturn exports;})();`;
}
export function browserModules() {
  return [
    browserModule(readFileSync('src/lib/offline-qr-hash.ts', 'utf8'), '__hash'),
    browserModule(baselineSource('src/lib/offline-admission.ts'), '__legacyOffline'),
    browserModule(readFileSync('src/lib/offline-admission.ts', 'utf8'), '__offline'),
    browserModule(readFileSync('src/lib/adaptive-polling.ts', 'utf8'), '__poll'),
  ].join('\n');
}
export function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
}

/** Real loopback HTTP, actual route/storage driver, actual Chromium IndexedDB. */
export async function browserBenchmarks(mediaGET, storage) {
  let pollRun = { inflight: 0, maxInflight: 0, requests: 0 };
  let responseDelay = 0;
  let pollStatus = 200;
  const server = createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/poll')) {
        const run = pollRun;
        run.requests++;
        run.inflight++;
        run.maxInflight = Math.max(run.maxInflight, run.inflight);
        await new Promise(resolve => setTimeout(resolve, responseDelay));
        run.inflight--;
        res.writeHead(pollStatus, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end('{}');
        return;
      }
      if (req.url.startsWith('/api/media/')) {
        const url = new URL(req.url, 'http://127.0.0.1');
        const key = url.pathname.slice('/api/media/'.length).split('/');
        const response = await mediaGET(new Request(url), { params: Promise.resolve({ key }) });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>Local optimization benchmark</title>');
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(origin);
    await page.addScriptTag({ content: browserModules() });
    const offline = await page.evaluate(async () => {
      const now = Date.now();
      const dataset = {
        event: { id: 'bench', title: 'Benchmark only', location: 'Local', status: 'approved' },
        primaryScanner: null, isCurrentScannerPrimary: true, sessions: [], admissionLogs: [],
        lastSuccessfulSync: new Date(now).toISOString(), syncTimestamp: new Date(now).toISOString(),
        totalTickets: 5000,
        tickets: Array.from({ length: 5000 }, (_, i) => ({
          id: `t${i}`, ticketCode: `C${i}`, qrHash: window.__hash.hashOfflineQrPayload('bench', `QR${i}`),
          ticketTypeId: 'tt', ticketTypeName: 'Standing', sessionId: 'session', status: 'valid',
          admissionStatus: 'outside', isRefunded: false,
          admissionWindow: { startTime: new Date(now - 3600000).toISOString(), endTime: new Date(now + 3600000).toISOString() },
        })),
      };
      window.__dataset = dataset;
      window.__input = { eventId: 'bench', sessionId: 'session', scannerId: 'scanner', scannerName: 'Bench', isPrimary: true, action: 'entry', qrPayloadOrCode: 'QR4999' };
      localStorage.setItem(window.__legacyOffline.getOfflineDatasetKey('bench'), JSON.stringify(dataset));
      const before = [];
      for (let i = 0; i < 35; i++) {
        const start = performance.now();
        const result = window.__legacyOffline.performOfflineAdmissionScan({ ...window.__input, action: i % 2 ? 'exit' : 'entry' });
        if (!result.success) throw Error(`Legacy scan failed: ${result.reason}`);
        if (i >= 5) before.push(performance.now() - start);
      }
      localStorage.clear();
      const startSave = performance.now();
      await window.__offline.saveOfflineDatasetAsync('bench', dataset);
      const saveMs = performance.now() - startSave;
      const after = [];
      for (let i = 0; i < 35; i++) {
        const start = performance.now();
        const result = await window.__offline.performOfflineAdmissionScanAsync({ ...window.__input, action: i % 2 ? 'exit' : 'entry' });
        if (!result.success) throw Error(`IndexedDB scan failed: ${result.reason}`);
        if (i >= 5) after.push(performance.now() - start);
      }
      // Replace an existing dataset; a cursor must never delete freshly inserted rows.
      let pendingRefreshDenied = false;
      try { await window.__offline.saveOfflineDatasetAsync('bench', dataset); } catch { pendingRefreshDenied = true; }
      if (!pendingRefreshDenied) throw Error('Snapshot replaced unsynced ticket states');
      const replacementData = { ...dataset, event: { ...dataset.event, id: 'replacement' }, tickets: dataset.tickets.map(t => ({ ...t, qrHash: window.__hash.hashOfflineQrPayload('replacement', t.ticketCode) })) };
      await window.__offline.saveOfflineDatasetAsync('replacement', replacementData);
      await window.__offline.saveOfflineDatasetAsync('replacement', replacementData);
      const replacement = await window.__offline.performOfflineAdmissionScanAsync({ ...window.__input, eventId: 'replacement', qrPayloadOrCode: 'C4999' });
      if (!replacement.success) throw Error(`Replacement lost ticket: ${replacement.reason}`);
      return { before, after, saveMs, pending: (await window.__offline.getOfflinePendingScansAsync('bench')).length };
    });
    await page.reload();
    await page.addScriptTag({ content: browserModules() });
    const persisted = await page.evaluate(async () => ({
      pending: (await window.__offline.getOfflinePendingScansAsync('bench')).length,
      meta: await window.__offline.getOfflineDatasetMetaAsync('bench'),
    }));
    if (persisted.pending !== offline.pending || persisted.meta.totalTickets !== 5000) throw Error('IndexedDB reload persistence failed');

    // Atomicity: force a transaction abort after the ticket update has been enqueued.
    const atomicity = await page.evaluate(async () => {
      const input = { eventId: 'bench', sessionId: 'session', scannerId: 'scanner', scannerName: 'Bench', isPrimary: true, action: 'exit', qrPayloadOrCode: 'QR4999' };
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const req = original.apply(this, args);
        if (this.name === 'tickets') this.transaction.abort();
        return req;
      };
      const aborted = await window.__offline.performOfflineAdmissionScanAsync(input);
      IDBObjectStore.prototype.put = original;
      const count = (await window.__offline.getOfflinePendingScansAsync('bench')).length;
      const retry = await window.__offline.performOfflineAdmissionScanAsync(input);
      return { aborted, count, retry };
    });
    if (atomicity.aborted.success || atomicity.count !== offline.pending || !atomicity.retry.success) throw Error('Atomic rollback failed');

    // Observe actual wall-clock request timing, including slow responses. No fake clocks.
    const measurePolling = async (adaptive, { delay = 100, status = 200, duration = 13000 } = {}) => {
      pollRun = { inflight: 0, maxInflight: 0, requests: 0 }; responseDelay = delay; pollStatus = status;
      const observed = await page.evaluate(async ({ adaptive, duration }) => {
        const timestamps = [];
        let stopped = false;
        let active = 0, maxConcurrent = 0;
        const step = async ({ signal } = {}) => {
          timestamps.push(performance.now());
          active++; maxConcurrent = Math.max(maxConcurrent, active);
          try {
            const res = await fetch('/poll', { signal, cache: 'no-store' });
            await res.text();
            return { backoff: !res.ok };
          } finally { active--; }
        };
        const start = performance.now();
        let stop;
        if (adaptive) stop = window.__poll.startAdaptivePoller({ jitterRatio: 0, step });
        else { void step(); const timer = setInterval(() => { if (!stopped) void step(); }, 2500); stop = () => { stopped = true; clearInterval(timer); }; }
        await new Promise(resolve => setTimeout(resolve, duration));
        stop();
        await new Promise(resolve => setTimeout(resolve, 3300));
        return { timestamps, maxConcurrent, durationMs: performance.now() - start - 3300 };
      }, { adaptive, duration });
      return { ...observed, requests: pollRun.requests, maxInflight: pollRun.maxInflight, observedRequestsPerSecond: pollRun.requests / (observed.durationMs / 1000) };
    };
    const polling = {
      before: await measurePolling(false), after: await measurePolling(true),
      slowBefore: await measurePolling(false, { delay: 3000 }),
      slowAfter: await measurePolling(true, { delay: 3000 }),
      backoffAfter: await measurePolling(true, { status: 503, duration: 18000 }),
    };
    if (polling.slowAfter.maxConcurrent > 1 || polling.slowBefore.maxConcurrent < 2) throw Error(`Polling overlap assertion failed: ${JSON.stringify(polling)}`);

    // Deterministic noisy poster, real encoder and HTTP bytes. Keep cold/warm separate.
    const pixels = Buffer.alloc(1600 * 2200 * 3);
    let seed = 42;
    for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels[i] = seed >>> 24; }
    const poster = await sharp(pixels, { raw: { width: 1600, height: 2200, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
    const imageResults = {};
    for (const format of ['original', 'webp', 'avif']) {
      const cold = [], warm = [];
      let bytes = 0;
      for (let i = 0; i < 8; i++) {
        const key = `benchmark-${format}-${i}.jpg`;
        await storage.put(key, poster, 'image/jpeg', 'public');
        const url = `${origin}/api/media/${key}${format === 'original' ? '' : `?w=360&fm=${format}`}`;
        for (const samples of [cold, warm]) {
          const start = performance.now();
          const response = await fetch(url);
          if (!response.ok) throw Error(`Image HTTP ${response.status}`);
          const data = Buffer.from(await response.arrayBuffer());
          samples.push(performance.now() - start);
          bytes = data.length;
          const meta = await sharp(data).metadata();
          if (format !== 'original' && (meta.width !== 360 || (format === 'avif' ? meta.format !== 'heif' || meta.compression !== 'av1' : meta.format !== format))) throw Error('Wrong image dimensions/format');
        }
        await storage.delete(key);
      }
      imageResults[format] = { bytes, cold: stats(cold), warm: stats(warm) };
    }
    return { environment: { browser: browser.version(), storage: 'MemoryStorageDouble (local configured provider), real HTTP route + sharp', indexedDB: 'native Chromium, no mock', baselineRef },
      offline: { before: stats(offline.before), after: stats(offline.after), saveMs: offline.saveMs, reloadPersistence: true, atomicRollback: true, snapshotReplacement: true }, polling, images: imageResults };
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
