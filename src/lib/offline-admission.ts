import type { OfflineDataset, OfflineTicketItem } from '../server/primary-scanner';
import { hashOfflineQrPayload } from './offline-qr-hash';

export interface OfflinePendingScanItem {
  id: string;
  ticketId: string;
  ticketCode: string;
  ticketTypeName?: string;
  sessionId: string;
  eventId: string;
  scannerId: string;
  scannerName: string;
  action: 'entry' | 'exit';
  status: 'success' | 'rejected';
  reason: string | null;
  deviceMode: 'offline';
  scannedAt: string;
}

export interface OfflineAdmissionScanInput {
  eventId: string;
  sessionId: string;
  scannerId: string;
  scannerName: string;
  isPrimary: boolean;
  qrPayloadOrCode: string;
  action: 'entry' | 'exit';
  now?: Date;
}

export interface OfflineAdmissionScanResult {
  success: boolean;
  status: 'success' | 'rejected';
  action: 'entry' | 'exit';
  reason?: string;
  message: string;
  ticket?: {
    ticketId: string;
    ticketCode: string;
    ticketTypeName: string;
    ticketPrice: number;
    eventTitle: string;
    sessionId: string;
    sessionStartTime: string;
    sessionEndTime: string;
    admissionStatus: 'inside' | 'outside';
    scannedAt: string;
  };
  pendingCount?: number;
}

/**
 * Get the localStorage key for cached dataset of an event.
 */
export function getOfflineDatasetKey(eventId: string): string {
  return `ticket_offline_dataset_${eventId}`;
}

/**
 * Get the localStorage key for pending offline scans of an event.
 */
export function getOfflinePendingScansKey(eventId: string): string {
  return `ticket_offline_pending_scans_${eventId}`;
}

/**
 * Retrieve all pending offline scan logs for an event from local storage.
 */
export function getOfflinePendingScans(
  eventId: string,
  storage?: Pick<Storage, 'getItem'>,
): OfflinePendingScanItem[] {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return [];
  try {
    const raw = store.getItem(getOfflinePendingScansKey(eventId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Clear pending offline scans (e.g. after sync or in testing).
 */
export function clearOfflinePendingScans(
  eventId: string,
  storage?: Pick<Storage, 'removeItem'>,
): void {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return;
  try {
    store.removeItem(getOfflinePendingScansKey(eventId));
  } catch {
    // Ignore
  }
}

export interface OfflineDatasetMeta {
  eventId: string;
  event?: OfflineDataset['event'];
  sessions?: OfflineDataset['sessions'];
  primaryScanner?: OfflineDataset['primaryScanner'];
  lastSuccessfulSync?: string;
  totalTickets?: number;
  isOfflineHalted?: boolean;
  offlineStatus?: 'active' | 'halted_reconciliation_required';
}

interface StoredOfflineTicketRecord extends OfflineTicketItem {
  eventId: string;
}

const OFFLINE_IDB_NAME = 'ticket_offline_admission_db';
const OFFLINE_IDB_VERSION = 1;
const STORE_DATASETS = 'datasets';
const STORE_TICKETS = 'tickets';
const STORE_PENDING_SCANS = 'pending_scans';
const INDEX_TICKETS_BY_EVENT_QR = 'by_event_qrHash';
const INDEX_BY_EVENT = 'by_event';

function resolveIndexedDb(idb?: IDBFactory): IDBFactory | undefined {
  if (idb) return idb;
  if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  return undefined;
}

export function isIndexedDbAvailable(idb?: IDBFactory): boolean {
  return Boolean(resolveIndexedDb(idb));
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

function idbTxComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

function openOfflineAdmissionDb(idb?: IDBFactory): Promise<IDBDatabase> {
  const factory = resolveIndexedDb(idb);
  if (!factory) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  return new Promise((resolve, reject) => {
    const req = factory.open(OFFLINE_IDB_NAME, OFFLINE_IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DATASETS)) {
        db.createObjectStore(STORE_DATASETS, { keyPath: 'eventId' });
      }
      if (!db.objectStoreNames.contains(STORE_TICKETS)) {
        const ticketsStore = db.createObjectStore(STORE_TICKETS, {
          keyPath: ['eventId', 'id'],
        });
        ticketsStore.createIndex(INDEX_TICKETS_BY_EVENT_QR, ['eventId', 'qrHash'], {
          unique: false,
        });
        ticketsStore.createIndex(INDEX_BY_EVENT, 'eventId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_SCANS)) {
        const pendingStore = db.createObjectStore(STORE_PENDING_SCANS, {
          keyPath: 'id',
        });
        pendingStore.createIndex(INDEX_BY_EVENT, 'eventId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

interface EvaluatedCandidateOk {
  rejected?: undefined;
  ticketSummary: NonNullable<OfflineAdmissionScanResult['ticket']>;
  targetAdmissionStatus: 'inside' | 'outside';
  pendingItem: OfflinePendingScanItem;
  scannedAt: string;
}

interface EvaluatedCandidateRejected {
  rejected: OfflineAdmissionScanResult;
}

/**
 * Pure validation & transition rule evaluator shared across synchronous localStorage
 * and indexed IndexedDB offline admission paths.
 */
function evaluateOfflineTicketCandidate(params: {
  input: OfflineAdmissionScanInput;
  ticket: OfflineTicketItem;
  eventTitle: string;
}): EvaluatedCandidateOk | EvaluatedCandidateRejected {
  const { input, ticket, eventTitle } = params;

  // 5. Session matching (AC-100)
  if (ticket.sessionId !== input.sessionId) {
    return {
      rejected: {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'WRONG_SESSION',
        message: 'บัตรใบนี้เป็นของรอบการแสดงอื่น ไม่ตรงกับรอบที่กำลังสแกน',
      },
    };
  }

  // 6. Ticket status validation from snapshot (AC-101)
  if (ticket.status === 'cancelled') {
    return {
      rejected: {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'TICKET_CANCELLED',
        message: 'บัตรถูกยกเลิกแล้ว ไม่อนุญาตให้เข้างาน',
      },
    };
  }

  if (ticket.status === 'refunded' || ticket.isRefunded) {
    return {
      rejected: {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'TICKET_REFUNDED',
        message: 'บัตรถูกคืนเงินแล้ว ไม่อนุญาตให้เข้างาน',
      },
    };
  }

  if (ticket.status !== 'valid') {
    return {
      rejected: {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'INVALID_TICKET',
        message: 'สถานะบัตรไม่ถูกต้อง ไม่อนุญาตให้เข้างาน',
      },
    };
  }

  // 7. Admission window validation (AC-100)
  const currentTime = input.now || new Date();
  if (ticket.admissionWindow) {
    const windowStart = ticket.admissionWindow.admissionStartTime
      ? new Date(ticket.admissionWindow.admissionStartTime)
      : ticket.admissionWindow.startTime
        ? new Date(ticket.admissionWindow.startTime)
        : null;
    const windowEnd = ticket.admissionWindow.admissionEndTime
      ? new Date(ticket.admissionWindow.admissionEndTime)
      : ticket.admissionWindow.endTime
        ? new Date(ticket.admissionWindow.endTime)
        : null;

    if (windowStart && currentTime < windowStart) {
      return {
        rejected: {
          success: false,
          status: 'rejected',
          action: input.action,
          reason: 'OUTSIDE_ADMISSION_WINDOW',
          message: 'ยังไม่ถึงช่วงเวลาเปิดรับเข้างาน',
        },
      };
    }

    if (windowEnd && currentTime > windowEnd) {
      return {
        rejected: {
          success: false,
          status: 'rejected',
          action: input.action,
          reason: 'OUTSIDE_ADMISSION_WINDOW',
          message: 'พ้นช่วงเวลาเปิดรับเข้างานแล้ว',
        },
      };
    }
  }

  const scannedAt = currentTime.toISOString();
  // Summary object for scan result card (AC-65: Zero buyer PII)
  const ticketSummary: NonNullable<OfflineAdmissionScanResult['ticket']> = {
    ticketId: ticket.id,
    ticketCode: ticket.ticketCode,
    ticketTypeName: ticket.ticketTypeName,
    ticketPrice: 0,
    eventTitle,
    sessionId: ticket.sessionId,
    sessionStartTime: ticket.admissionWindow?.startTime || '',
    sessionEndTime: ticket.admissionWindow?.endTime || '',
    admissionStatus: ticket.admissionStatus,
    scannedAt,
  };

  // 8. State transition check (AC-96, AC-50, AC-49)
  let targetAdmissionStatus: 'inside' | 'outside';
  if (input.action === 'entry') {
    if (ticket.admissionStatus === 'inside') {
      return {
        rejected: {
          success: false,
          status: 'rejected',
          action: 'entry',
          reason: 'ALREADY_INSIDE',
          message: 'บัตรอยู่ในพื้นที่จัดงานแล้ว ไม่อนุญาตให้เข้าซ้ำ',
          ticket: ticketSummary,
        },
      };
    }
    targetAdmissionStatus = 'inside';
  } else {
    if (ticket.admissionStatus !== 'inside') {
      return {
        rejected: {
          success: false,
          status: 'rejected',
          action: 'exit',
          reason: 'NOT_INSIDE',
          message: 'บัตรอยู่นอกพื้นที่จัดงาน ไม่สามารถบันทึกออกได้',
          ticket: ticketSummary,
        },
      };
    }
    targetAdmissionStatus = 'outside';
  }

  const pendingItem: OfflinePendingScanItem = {
    id: `offline-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ticketId: ticket.id,
    ticketCode: ticket.ticketCode,
    ticketTypeName: ticket.ticketTypeName,
    sessionId: ticket.sessionId,
    eventId: input.eventId,
    scannerId: input.scannerId,
    scannerName: input.scannerName,
    action: input.action,
    status: 'success',
    reason: null,
    deviceMode: 'offline',
    scannedAt,
  };

  return {
    ticketSummary,
    targetAdmissionStatus,
    pendingItem,
    scannedAt,
  };
}

/**
 * Perform an offline admission scan on the primary device (AC-40, AC-41, AC-50, AC-96, AC-103).
 * Uses synchronous localStorage (kept for tests & non-IndexedDB environments).
 */
export function performOfflineAdmissionScan(
  input: OfflineAdmissionScanInput,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): OfflineAdmissionScanResult {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);

  // 1. Primary device verification (AC-40, O1)
  if (!input.isPrimary) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'NOT_PRIMARY_DEVICE',
      message: 'เครื่องนี้ไม่ใช่เครื่องหลักประจำงาน ไม่อนุญาตให้สแกนในโหมดออฟไลน์',
    };
  }

  // 2. Storage availability
  if (!store) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'STORAGE_UNAVAILABLE',
      message: 'อุปกรณ์ไม่รองรับการจัดเก็บข้อมูลออฟไลน์ (Storage Unavailable)',
    };
  }

  // 3. Load cached offline dataset
  let dataset: OfflineDataset;
  try {
    const rawDataset = store.getItem(getOfflineDatasetKey(input.eventId));
    if (!rawDataset) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'NO_OFFLINE_DATASET',
        message: 'ไม่มีชุดข้อมูลออฟไลน์ในอุปกรณ์ กรุณาดาวน์โหลดชุดข้อมูลก่อนใช้งาน',
      };
    }
    dataset = JSON.parse(rawDataset);
    if (!dataset || !Array.isArray(dataset.tickets)) {
      throw new Error('Invalid dataset structure');
    }
    if (dataset.isOfflineHalted || dataset.offlineStatus === 'halted_reconciliation_required') {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'OFFLINE_HALTED_RECONCILIATION',
        message: 'การสแกนออฟไลน์ถูกระงับเพื่อกระทบยอด กรุณาเชื่อมต่อออนไลน์เพื่อตรวจสอบร่วมกับผู้จัดงาน',
      };
    }
  } catch {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'CORRUPTED_OFFLINE_DATASET',
      message: 'ชุดข้อมูลออฟไลน์ชำรุดเสียหาย กรุณาดาวน์โหลดชุดข้อมูลใหม่',
    };
  }

  // 4. Ticket lookup in cached dataset (AC-41, O2)
  const cleanInput = input.qrPayloadOrCode.trim();
  const inputHash = hashOfflineQrPayload(input.eventId, cleanInput);
  const ticketIndex = dataset.tickets.findIndex(
    (t: OfflineTicketItem) => typeof t.qrHash === 'string' && t.qrHash === inputHash,
  );

  if (ticketIndex === -1) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'OFFLINE_TICKET_NOT_FOUND',
      message: 'ไม่พบข้อมูลบัตรในชุดข้อมูลออฟไลน์ กรุณารอเชื่อมต่อออนไลน์',
    };
  }

  const ticket = dataset.tickets[ticketIndex];
  const evaluated = evaluateOfflineTicketCandidate({
    input,
    ticket,
    eventTitle: dataset.event?.title || '',
  });
  if (evaluated.rejected) {
    return evaluated.rejected;
  }

  const { ticketSummary, targetAdmissionStatus, pendingItem, scannedAt } = evaluated;
  const existingPending = getOfflinePendingScans(input.eventId, store);
  const nextPending = [...existingPending, pendingItem];
  const originalAdmissionStatus = ticket.admissionStatus;

  try {
    store.setItem(getOfflinePendingScansKey(input.eventId), JSON.stringify(nextPending));
    dataset.tickets[ticketIndex].admissionStatus = targetAdmissionStatus;
    store.setItem(getOfflineDatasetKey(input.eventId), JSON.stringify(dataset));
  } catch (_storageErr) {
    ticket.admissionStatus = originalAdmissionStatus;
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'STORAGE_WRITE_FAILURE',
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลงอุปกรณ์ (Storage Error) ไม่อนุญาตให้ผ่าน',
    };
  }

  return {
    success: true,
    status: 'success',
    action: input.action,
    message:
      input.action === 'entry'
        ? 'บันทึกเข้างานสำเร็จ (ผ่าน) [ออฟไลน์]'
        : 'บันทึกออกนอกงานสำเร็จ (ผ่าน) [ออฟไลน์]',
    ticket: {
      ...ticketSummary,
      admissionStatus: targetAdmissionStatus,
      scannedAt,
    },
    pendingCount: nextPending.length,
  };
}

/**
 * Saves a downloaded offline dataset into IndexedDB with indexed tickets (`[eventId, qrHash]`)
 * so scans perform O(log N) indexed reads without parsing the full JSON dataset.
 */
export async function saveOfflineDatasetAsync(
  eventId: string,
  dataset: OfflineDataset,
  idb?: IDBFactory,
): Promise<void> {
  const factory = resolveIndexedDb(idb);
  if (!factory) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(getOfflineDatasetKey(eventId), JSON.stringify(dataset));
    }
    return;
  }

  const db = await openOfflineAdmissionDb(factory);
  try {
    const tx = db.transaction([STORE_DATASETS, STORE_TICKETS], 'readwrite');
    const datasetsStore = tx.objectStore(STORE_DATASETS);
    const ticketsStore = tx.objectStore(STORE_TICKETS);

    const meta: OfflineDatasetMeta = {
      eventId,
      event: dataset.event,
      sessions: dataset.sessions,
      primaryScanner: dataset.primaryScanner,
      lastSuccessfulSync: dataset.lastSuccessfulSync,
      totalTickets: dataset.totalTickets ?? dataset.tickets.length,
      isOfflineHalted: dataset.isOfflineHalted,
      offlineStatus: dataset.offlineStatus,
    };
    datasetsStore.put(meta);

    // Clear previous tickets for this event before writing fresh snapshot
    const cursorReq = ticketsStore.index(INDEX_BY_EVENT).openKeyCursor(IDBKeyRange.only(eventId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        ticketsStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    for (const ticket of dataset.tickets) {
      const rec: StoredOfflineTicketRecord = {
        ...ticket,
        eventId,
      };
      ticketsStore.put(rec);
    }

    await idbTxComplete(tx);
  } finally {
    db.close();
  }
}

/**
 * Loads only small offline dataset metadata for UI status & gating.
 */
export async function getOfflineDatasetMetaAsync(
  eventId: string,
  idb?: IDBFactory,
): Promise<OfflineDatasetMeta | null> {
  const factory = resolveIndexedDb(idb);
  if (!factory) {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(getOfflineDatasetKey(eventId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as OfflineDataset;
      return {
        eventId,
        event: parsed.event,
        sessions: parsed.sessions,
        primaryScanner: parsed.primaryScanner,
        lastSuccessfulSync: parsed.lastSuccessfulSync,
        totalTickets: parsed.totalTickets,
        isOfflineHalted: parsed.isOfflineHalted,
        offlineStatus: parsed.offlineStatus,
      };
    } catch {
      return null;
    }
  }

  const db = await openOfflineAdmissionDb(factory);
  try {
    const tx = db.transaction([STORE_DATASETS], 'readonly');
    const meta = await idbReq<OfflineDatasetMeta | undefined>(
      tx.objectStore(STORE_DATASETS).get(eventId),
    );
    await idbTxComplete(tx);
    return meta ?? null;
  } finally {
    db.close();
  }
}

/**
 * Retrieves pending offline scan items for an event from IndexedDB (`by_event` index).
 */
export async function getOfflinePendingScansAsync(
  eventId: string,
  idb?: IDBFactory,
): Promise<OfflinePendingScanItem[]> {
  const factory = resolveIndexedDb(idb);
  if (!factory) {
    return getOfflinePendingScans(eventId);
  }

  const db = await openOfflineAdmissionDb(factory);
  try {
    const tx = db.transaction([STORE_PENDING_SCANS], 'readonly');
    const items = await idbReq<OfflinePendingScanItem[]>(
      tx.objectStore(STORE_PENDING_SCANS).index(INDEX_BY_EVENT).getAll(IDBKeyRange.only(eventId)),
    );
    await idbTxComplete(tx);
    return Array.isArray(items) ? items : [];
  } finally {
    db.close();
  }
}

/**
 * IndexedDB-backed offline admission scan (#7):
 * Looks up a single ticket via composite QR hash index `['eventId', 'qrHash']` and atomically
 * writes updated ticket state + pending scan log inside one `readwrite` transaction (AC-103).
 */
export async function performOfflineAdmissionScanAsync(
  input: OfflineAdmissionScanInput,
  idb?: IDBFactory,
): Promise<OfflineAdmissionScanResult> {
  if (!input.isPrimary) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'NOT_PRIMARY_DEVICE',
      message: 'เครื่องนี้ไม่ใช่เครื่องหลักประจำงาน ไม่อนุญาตให้สแกนในโหมดออฟไลน์',
    };
  }

  const factory = resolveIndexedDb(idb);
  if (!factory) {
    return performOfflineAdmissionScan(input);
  }

  let db: IDBDatabase;
  try {
    db = await openOfflineAdmissionDb(factory);
  } catch {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'STORAGE_UNAVAILABLE',
      message: 'อุปกรณ์ไม่รองรับการจัดเก็บข้อมูลออฟไลน์ (Storage Unavailable)',
    };
  }

  try {
    const tx = db.transaction([STORE_DATASETS, STORE_TICKETS, STORE_PENDING_SCANS], 'readwrite');
    const datasetsStore = tx.objectStore(STORE_DATASETS);
    const ticketsStore = tx.objectStore(STORE_TICKETS);
    const pendingStore = tx.objectStore(STORE_PENDING_SCANS);

    const datasetMeta = await idbReq<OfflineDatasetMeta | undefined>(
      datasetsStore.get(input.eventId),
    );
    if (!datasetMeta) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'NO_OFFLINE_DATASET',
        message: 'ไม่มีชุดข้อมูลออฟไลน์ในอุปกรณ์ กรุณาดาวน์โหลดชุดข้อมูลก่อนใช้งาน',
      };
    }
    if (
      datasetMeta.isOfflineHalted ||
      datasetMeta.offlineStatus === 'halted_reconciliation_required'
    ) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'OFFLINE_HALTED_RECONCILIATION',
        message: 'การสแกนออฟไลน์ถูกระงับเพื่อกระทบยอด กรุณาเชื่อมต่อออนไลน์เพื่อตรวจสอบร่วมกับผู้จัดงาน',
      };
    }

    const cleanInput = input.qrPayloadOrCode.trim();
    const inputHash = hashOfflineQrPayload(input.eventId, cleanInput);
    const ticket = await idbReq<StoredOfflineTicketRecord | undefined>(
      ticketsStore.index(INDEX_TICKETS_BY_EVENT_QR).get([input.eventId, inputHash]),
    );

    if (!ticket) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'OFFLINE_TICKET_NOT_FOUND',
        message: 'ไม่พบข้อมูลบัตรในชุดข้อมูลออฟไลน์ กรุณารอเชื่อมต่อออนไลน์',
      };
    }

    const evaluated = evaluateOfflineTicketCandidate({
      input,
      ticket,
      eventTitle: datasetMeta.event?.title || '',
    });
    if (evaluated.rejected) {
      return evaluated.rejected;
    }

    const { ticketSummary, targetAdmissionStatus, pendingItem, scannedAt } = evaluated;

    pendingStore.add(pendingItem);
    ticketsStore.put({
      ...ticket,
      eventId: input.eventId,
      admissionStatus: targetAdmissionStatus,
    });
    const pendingCount = await idbReq<number>(
      pendingStore.index(INDEX_BY_EVENT).count(IDBKeyRange.only(input.eventId)),
    );

    await idbTxComplete(tx);

    return {
      success: true,
      status: 'success',
      action: input.action,
      message:
        input.action === 'entry'
          ? 'บันทึกเข้างานสำเร็จ (ผ่าน) [ออฟไลน์]'
          : 'บันทึกออกนอกงานสำเร็จ (ผ่าน) [ออฟไลน์]',
      ticket: {
        ...ticketSummary,
        admissionStatus: targetAdmissionStatus,
        scannedAt,
      },
      pendingCount,
    };
  } catch {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'STORAGE_WRITE_FAILURE',
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลงอุปกรณ์ (Storage Error) ไม่อนุญาตให้ผ่าน',
    };
  } finally {
    db.close();
  }
}

export interface SyncOfflineScansResult {
  success: boolean;
  acknowledgedCount: number;
  remainingCount: number;
  conflictsCount: number;
  lastSuccessfulSync?: string;
  message?: string;
}

async function postOfflineSyncBatch(
  eventId: string,
  pendingScans: OfflinePendingScanItem[],
): Promise<
  | { ok: true; acknowledgedIds: string[]; conflictsCount: number; lastSuccessfulSync?: string }
  | { ok: false; message: string }
> {
  try {
    const res = await fetch(`/api/scanner/events/${eventId}/offline-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scans: pendingScans }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, message: data.message || 'การซิงก์ข้อมูลล้มเหลว' };
    }
    const acknowledgedIds: string[] = Array.isArray(data.acknowledgedIds) ? data.acknowledgedIds : [];
    return {
      ok: true,
      acknowledgedIds,
      conflictsCount: data.conflictsCount || 0,
      lastSuccessfulSync: data.lastSuccessfulSync,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อซิงก์ข้อมูล',
    };
  }
}

/**
 * Synchronize all pending offline scans for an event to the server (AC-102, AC-99).
 * Removes only acknowledged scan items from local storage.
 */
export async function syncPendingOfflineScans(
  eventId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): Promise<SyncOfflineScansResult> {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) {
    return {
      success: false,
      acknowledgedCount: 0,
      remainingCount: 0,
      conflictsCount: 0,
      message: 'อุปกรณ์ไม่รองรับการจัดเก็บข้อมูล',
    };
  }

  const pendingScans = getOfflinePendingScans(eventId, store);
  if (pendingScans.length === 0) {
    return {
      success: true,
      acknowledgedCount: 0,
      remainingCount: 0,
      conflictsCount: 0,
      message: 'ไม่มีรายการรอซิงก์ในเครื่อง',
    };
  }

  const postRes = await postOfflineSyncBatch(eventId, pendingScans);
  if (!postRes.ok) {
    return {
      success: false,
      acknowledgedCount: 0,
      remainingCount: pendingScans.length,
      conflictsCount: 0,
      message: postRes.message,
    };
  }

  const remaining = pendingScans.filter(p => !postRes.acknowledgedIds.includes(p.id));
  if (remaining.length === 0) {
    clearOfflinePendingScans(eventId, store);
  } else {
    store.setItem(getOfflinePendingScansKey(eventId), JSON.stringify(remaining));
  }

  if (postRes.lastSuccessfulSync) {
    try {
      const raw = store.getItem(getOfflineDatasetKey(eventId));
      if (raw) {
        const ds = JSON.parse(raw);
        ds.lastSuccessfulSync = postRes.lastSuccessfulSync;
        store.setItem(getOfflineDatasetKey(eventId), JSON.stringify(ds));
      }
    } catch {
      // Ignored
    }
  }

  return {
    success: true,
    acknowledgedCount: postRes.acknowledgedIds.length,
    remainingCount: remaining.length,
    conflictsCount: postRes.conflictsCount,
    lastSuccessfulSync: postRes.lastSuccessfulSync,
    message: `ซิงก์สำเร็จ ${postRes.acknowledgedIds.length} รายการ${postRes.conflictsCount > 0 ? ` (พบข้อขัดแย้ง ${postRes.conflictsCount} รายการ)` : ''}`,
  };
}

/**
 * Synchronize pending offline scans stored in IndexedDB inside an atomic readwrite transaction.
 * Falls back cleanly to localStorage sync when IndexedDB is unavailable.
 */
export async function syncPendingOfflineScansAsync(
  eventId: string,
  idb?: IDBFactory,
): Promise<SyncOfflineScansResult> {
  const factory = resolveIndexedDb(idb);
  if (!factory) {
    return syncPendingOfflineScans(eventId);
  }

  const pendingScans = await getOfflinePendingScansAsync(eventId, factory);
  if (pendingScans.length === 0) {
    return {
      success: true,
      acknowledgedCount: 0,
      remainingCount: 0,
      conflictsCount: 0,
      message: 'ไม่มีรายการรอซิงก์ในเครื่อง',
    };
  }

  const postRes = await postOfflineSyncBatch(eventId, pendingScans);
  if (!postRes.ok) {
    return {
      success: false,
      acknowledgedCount: 0,
      remainingCount: pendingScans.length,
      conflictsCount: 0,
      message: postRes.message,
    };
  }

  const db = await openOfflineAdmissionDb(factory);
  try {
    const tx = db.transaction([STORE_PENDING_SCANS, STORE_DATASETS], 'readwrite');
    const pendingStore = tx.objectStore(STORE_PENDING_SCANS);
    const datasetsStore = tx.objectStore(STORE_DATASETS);

    for (const ackId of postRes.acknowledgedIds) {
      pendingStore.delete(ackId);
    }

    if (postRes.lastSuccessfulSync) {
      const meta = await idbReq<OfflineDatasetMeta | undefined>(datasetsStore.get(eventId));
      if (meta) {
        datasetsStore.put({ ...meta, lastSuccessfulSync: postRes.lastSuccessfulSync });
      }
    }

    const remainingCount = await idbReq<number>(
      pendingStore.index(INDEX_BY_EVENT).count(IDBKeyRange.only(eventId)),
    );

    await idbTxComplete(tx);

    return {
      success: true,
      acknowledgedCount: postRes.acknowledgedIds.length,
      remainingCount,
      conflictsCount: postRes.conflictsCount,
      lastSuccessfulSync: postRes.lastSuccessfulSync,
      message: `ซิงก์สำเร็จ ${postRes.acknowledgedIds.length} รายการ${postRes.conflictsCount > 0 ? ` (พบข้อขัดแย้ง ${postRes.conflictsCount} รายการ)` : ''}`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      acknowledgedCount: 0,
      remainingCount: pendingScans.length,
      conflictsCount: 0,
      message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการซิงก์ข้อมูลออฟไลน์',
    };
  } finally {
    db.close();
  }
}

