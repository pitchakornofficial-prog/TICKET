import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  computeAdaptivePollDelayMs,
  startAdaptivePoller,
} from '../../src/lib/adaptive-polling';
import {
  buildResponsiveSrcSet,
  buildResponsiveVariantUrl,
  supportsResponsiveVariants,
} from '../../src/components/responsive-image';
import { parseMoneyReportQueryOptions } from '../../src/server/reports';
import { hashOfflineQrPayload } from '../../src/lib/offline-qr-hash';
import {
  getOfflineDatasetMetaAsync,
  getOfflinePendingScansAsync,
  performOfflineAdmissionScanAsync,
  saveOfflineDatasetAsync,
} from '../../src/lib/offline-admission';

describe('Performance Optimizations Verification (#1-#7)', () => {
  it('#1-#2: parses money-report query options and uses batch summary APIs in finance hubs', () => {
    expect(parseMoneyReportQueryOptions('https://example.test/api/owner/events/e1/money-report')).toEqual({
      includeOrders: true,
    });
    expect(
      parseMoneyReportQueryOptions(
        'https://example.test/api/owner/events/e1/money-report?includeOrders=false&ordersPage=2&ordersLimit=25',
      ),
    ).toEqual({
      includeOrders: false,
      ordersPage: 2,
      ordersLimit: 25,
    });

    const ownerHubSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/owner-finance-hub.tsx'),
      'utf8',
    );
    expect(ownerHubSrc).toContain('/api/owner/finance/summaries');
    expect(ownerHubSrc).toContain('/money-report?ordersPage=1&ordersLimit=20');

    const orgFinanceSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/organizer-finance-view.tsx'),
      'utf8',
    );
    expect(orgFinanceSrc).toContain('/api/organizer/finance/summaries');
    expect(orgFinanceSrc).toContain('includeOrders=false');

    const orgOverviewSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );
    expect(orgOverviewSrc).toContain('/api/organizer/finance/summaries');
  });

  it('#3: adaptive polling computes bounded jitter/backoff delays and never overlaps in-flight requests', async () => {
    const low = computeAdaptivePollDelayMs({
      baseIntervalMs: 3000,
      maxIntervalMs: 15000,
      jitterRatio: 0.2,
      randomFn: () => 0,
    });
    const high = computeAdaptivePollDelayMs({
      baseIntervalMs: 3000,
      maxIntervalMs: 15000,
      jitterRatio: 0.2,
      randomFn: () => 1,
    });
    expect(low).toBe(2400);
    expect(high).toBe(3600);

    const backedOff = computeAdaptivePollDelayMs({
      baseIntervalMs: 3000,
      maxIntervalMs: 10000,
      consecutiveBackoffs: 4,
      jitterRatio: 0,
    });
    expect(backedOff).toBe(10000);

    const hiddenDelay = computeAdaptivePollDelayMs({
      baseIntervalMs: 2500,
      maxIntervalMs: 15000,
      isHidden: true,
      hiddenIntervalMs: 12000,
      jitterRatio: 0,
    });
    expect(hiddenDelay).toBe(12000);

    // Ensure sequential execution (no concurrent overlap even under slow steps)
    let activeCount = 0;
    let maxConcurrent = 0;
    let calls = 0;

    await new Promise<void>(resolve => {
      const stop = startAdaptivePoller({
        baseIntervalMs: 5,
        minIntervalMs: 5,
        maxIntervalMs: 20,
        jitterRatio: 0,
        step: async () => {
          activeCount += 1;
          maxConcurrent = Math.max(maxConcurrent, activeCount);
          await new Promise(r => setTimeout(r, 15));
          activeCount -= 1;
          calls += 1;
          if (calls >= 3) {
            stop();
            resolve();
            return { stop: true };
          }
          return { nextDelayMs: 5 };
        },
      });
    });

    expect(calls).toBe(3);
    expect(maxConcurrent).toBe(1);
  });

  it('#5: home page uses slim paginated catalog and omits descriptions while searching them on server', () => {
    const pageSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf8');
    expect(pageSrc).toContain('queryPublicEventsCatalog');
    expect(pageSrc).toContain('serverCatalogEnabled');

    const eventsSrc = fs.readFileSync(path.join(process.cwd(), 'src/server/events.ts'), 'utf8');
    expect(eventsSrc).toContain("description_text ILIKE '%' || $1 || '%'");
    expect(eventsSrc).toContain('WITH target_tt AS');
  });

  it('#6: generates multi-width AVIF/WebP srcset URLs for media & Unsplash images and skips SVG/data', () => {
    expect(supportsResponsiveVariants('/api/media/poster.jpg')).toBe('media');
    expect(supportsResponsiveVariants('https://images.unsplash.com/photo-123?auto=format&w=1600')).toBe('unsplash');
    expect(supportsResponsiveVariants('/api/media/icon.svg')).toBeNull();
    expect(supportsResponsiveVariants('data:image/png;base64,AAA')).toBeNull();

    expect(buildResponsiveVariantUrl('/api/media/poster.jpg', 480, 'webp')).toBe(
      '/api/media/poster.jpg?w=480&fm=webp',
    );
    expect(buildResponsiveSrcSet('/api/media/poster.jpg', [240, 480], 'avif')).toBe(
      '/api/media/poster.jpg?w=240&fm=avif 240w, /api/media/poster.jpg?w=480&fm=avif 480w',
    );
  });

  it('#7: IndexedDB offline admission uses composite [eventId, qrHash] index and atomic writes', async () => {
    const datasets = new Map<string, unknown>();
    const tickets = new Map<string, Record<string, unknown>>();
    const pending = new Map<string, Record<string, unknown>>();
    let failNextTx = false;
    const indexGets: unknown[] = [];

    function makeReq<T>(resultFn: () => T): IDBRequest<T> {
      const req = {
        result: undefined as unknown as T,
        error: null,
        onsuccess: null as ((this: IDBRequest<T>, ev: Event) => unknown) | null,
        onerror: null as ((this: IDBRequest<T>, ev: Event) => unknown) | null,
      };
      queueMicrotask(() => {
        try {
          req.result = resultFn();
          req.onsuccess?.call(req as unknown as IDBRequest<T>, new Event('success'));
        } catch (err) {
          (req as { error: unknown }).error = err;
          req.onerror?.call(req as unknown as IDBRequest<T>, new Event('error'));
        }
      });
      return req as unknown as IDBRequest<T>;
    }

    const fakeIdb = {
      open: vi.fn(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          close: vi.fn(),
          transaction: (_stores: string[], _mode: IDBTransactionMode) => {
            const pendingSnapshot = new Map(pending);
            const ticketsSnapshot = new Map(tickets);
            const tx: Partial<IDBTransaction> = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: (name: string) => {
                if (name === 'datasets') {
                  return {
                    get: (key: string) => makeReq(() => datasets.get(key)),
                    put: (val: { eventId: string }) => {
                      datasets.set(val.eventId, val);
                      return makeReq(() => val.eventId);
                    },
                  } as unknown as IDBObjectStore;
                }
                if (name === 'tickets') {
                  return {
                    put: (val: Record<string, unknown>) => {
                      tickets.set(`${val.eventId}:${val.id}`, val);
                      return makeReq(() => val.id);
                    },
                    delete: () => makeReq(() => undefined),
                    index: (idxName: string) => {
                      if (idxName === 'by_event') {
                        return {
                          openKeyCursor: () => makeReq(() => null),
                        } as unknown as IDBIndex;
                      }
                      return {
                        get: (key: [string, string]) => {
                          indexGets.push(key);
                          return makeReq(() =>
                            Array.from(tickets.values()).find(
                              t => t.eventId === key[0] && t.qrHash === key[1],
                            ),
                          );
                        },
                      } as unknown as IDBIndex;
                    },
                  } as unknown as IDBObjectStore;
                }
                return {
                  add: (val: Record<string, unknown>) => {
                    pending.set(String(val.id), val);
                    return makeReq(() => val.id);
                  },
                  index: () =>
                    ({
                      getAll: () => makeReq(() => Array.from(pending.values())),
                      count: () => makeReq(() => pending.size),
                    }) as unknown as IDBIndex,
                } as unknown as IDBObjectStore;
              },
            };
            queueMicrotask(() => {
              setTimeout(() => {
                if (failNextTx) {
                  failNextTx = false;
                  pending.clear();
                  for (const [k, v] of pendingSnapshot) pending.set(k, v);
                  tickets.clear();
                  for (const [k, v] of ticketsSnapshot) tickets.set(k, v);
                  tx.onerror?.call(tx as IDBTransaction, new Event('error'));
                } else {
                  tx.oncomplete?.call(tx as IDBTransaction, new Event('complete'));
                }
              }, 0);
            });
            return tx as IDBTransaction;
          },
        };
        const openReq = {
          result: db,
          onupgradeneeded: null as ((ev: IDBVersionChangeEvent) => unknown) | null,
          onsuccess: null as ((ev: Event) => unknown) | null,
          onerror: null as ((ev: Event) => unknown) | null,
        };
        queueMicrotask(() => {
          openReq.onsuccess?.(new Event('success'));
        });
        return openReq as unknown as IDBOpenDBRequest;
      }),
    } as unknown as IDBFactory;

    // Polyfill IDBKeyRange for node test environment
    (globalThis as unknown as { IDBKeyRange: { only: (v: unknown) => unknown } }).IDBKeyRange = {
      only: (v: unknown) => v,
    };

    const eventId = 'evt-idb-1';
    const sessionId = 'sess-idb-1';
    const qrPayload = 'QR-PAYLOAD-001';
    const qrHash = hashOfflineQrPayload(eventId, qrPayload);

    await saveOfflineDatasetAsync(
      eventId,
      {
        event: {
          id: eventId,
          title: 'IDB Test Concert',
          location: 'Hall A',
          status: 'approved',
        },
        sessions: [
          {
            id: sessionId,
            startTime: new Date(Date.now() - 3600000).toISOString(),
            endTime: new Date(Date.now() + 3600000).toISOString(),
            admissionStartTime: new Date(Date.now() - 3600000).toISOString(),
            admissionEndTime: new Date(Date.now() + 3600000).toISOString(),
            status: 'approved',
            ticketTypes: [{ id: 'tt-1', name: 'VIP', price: 1000 }],
          },
        ],
        tickets: [
          {
            id: 'tkt-1',
            ticketCode: 'TCK-001',
            qrHash,
            sessionId,
            ticketTypeId: 'tt-1',
            ticketTypeName: 'VIP',
            status: 'valid',
            admissionStatus: 'outside',
            isRefunded: false,
            admissionWindow: {
              startTime: new Date(Date.now() - 3600000).toISOString(),
              endTime: new Date(Date.now() + 3600000).toISOString(),
              admissionStartTime: new Date(Date.now() - 3600000).toISOString(),
              admissionEndTime: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        ],
        primaryScanner: {
          scannerId: 'sc-1',
          scannerName: 'Gate 1',
          scannerEmail: 'gate1@example.com',
          assignedAt: new Date().toISOString(),
        },
        isCurrentScannerPrimary: true,
        admissionLogs: [],
        syncTimestamp: new Date().toISOString(),
        totalTickets: 1,
        lastSuccessfulSync: new Date().toISOString(),
      },
      fakeIdb,
    );

    const meta = await getOfflineDatasetMetaAsync(eventId, fakeIdb);
    expect(meta?.totalTickets).toBe(1);

    const entryResult = await performOfflineAdmissionScanAsync(
      {
        eventId,
        sessionId,
        scannerId: 'sc-1',
        scannerName: 'Gate 1',
        isPrimary: true,
        qrPayloadOrCode: qrPayload,
        action: 'entry',
      },
      fakeIdb,
    );
    expect(entryResult.success).toBe(true);
    expect(entryResult.ticket?.admissionStatus).toBe('inside');
    expect(entryResult.pendingCount).toBe(1);
    expect(indexGets[0]).toEqual([eventId, qrHash]);

    // Failure during commit must roll back ticket status & pending log (AC-103)
    failNextTx = true;
    const failedExit = await performOfflineAdmissionScanAsync(
      {
        eventId,
        sessionId,
        scannerId: 'sc-1',
        scannerName: 'Gate 1',
        isPrimary: true,
        qrPayloadOrCode: qrPayload,
        action: 'exit',
      },
      fakeIdb,
    );
    expect(failedExit.success).toBe(false);
    expect(failedExit.reason).toBe('STORAGE_WRITE_FAILURE');
    expect((await getOfflinePendingScansAsync(eventId, fakeIdb)).length).toBe(1);
    expect(tickets.get(`${eventId}:tkt-1`)?.admissionStatus).toBe('inside');
  });
});
