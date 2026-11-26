import type { OfflineDataset, OfflineTicketItem } from '../server/primary-scanner';
import { hashOfflineQrPayload } from './offline-qr-hash';
import { isTicketSuffixShortcut, parseOrderAndSuffixPattern } from './ticket-code-input';

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
  qrHash?: string;
  assignmentEpoch?: number;
  assignmentToken?: string;
  localSequence?: number;
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
 * Get the localStorage key for persisted offline mode flag of an event.
 */
export function getOfflineModeKey(eventId: string): string {
  return `ticket_scanner_offline_mode_${eventId}`;
}

/**
 * Read persisted offline mode flag for an event.
 */
export function readPersistedOfflineMode(
  eventId: string,
  storage?: Pick<Storage, 'getItem'>,
): boolean {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return false;
  try {
    return store.getItem(getOfflineModeKey(eventId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist offline mode flag for an event across accidental page reloads.
 */
export function writePersistedOfflineMode(
  eventId: string,
  enabled: boolean,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>,
): void {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return;
  try {
    if (enabled) {
      store.setItem(getOfflineModeKey(eventId), '1');
    } else {
      store.removeItem(getOfflineModeKey(eventId));
    }
  } catch {
    // ignore storage quota / privacy mode restrictions
  }
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
  lastScanSequence?: number;
}

interface StoredOfflineTicketRecord extends OfflineTicketItem {
  eventId: string;
}

const OFFLINE_IDB_NAME = 'ticket_offline_admission_db';
const OFFLINE_IDB_VERSION = 2;
const STORE_DATASETS = 'datasets';
const STORE_TICKETS = 'tickets';
const STORE_PENDING_SCANS = 'pending_scans';
const INDEX_TICKETS_BY_EVENT_QR = 'by_event_qrHash';
const INDEX_TICKETS_BY_EVENT_CODE = 'by_event_ticketCode';
const INDEX_BY_EVENT = 'by_event';
export const OFFLINE_SYNC_CHUNK_SIZE = 250;

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
      const upgradeTx = req.transaction;
      if (!db.objectStoreNames.contains(STORE_DATASETS)) {
        db.createObjectStore(STORE_DATASETS, { keyPath: 'eventId' });
      }
      let ticketsStore: IDBObjectStore | null = null;
      if (!db.objectStoreNames.contains(STORE_TICKETS)) {
        ticketsStore = db.createObjectStore(STORE_TICKETS, {
          keyPath: ['eventId', 'id'],
        });
      } else if (upgradeTx) {
        ticketsStore = upgradeTx.objectStore(STORE_TICKETS);
      }
      if (ticketsStore) {
        if (!ticketsStore.indexNames.contains(INDEX_TICKETS_BY_EVENT_QR)) {
          ticketsStore.createIndex(INDEX_TICKETS_BY_EVENT_QR, ['eventId', 'qrHash'], {
            unique: false,
          });
        }
        if (!ticketsStore.indexNames.contains(INDEX_TICKETS_BY_EVENT_CODE)) {
          ticketsStore.createIndex(INDEX_TICKETS_BY_EVENT_CODE, ['eventId', 'ticketCode'], {
            unique: false,
          });
        }
        if (!ticketsStore.indexNames.contains(INDEX_BY_EVENT)) {
          ticketsStore.createIndex(INDEX_BY_EVENT, 'eventId', { unique: false });
        }
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

function datasetMetadata(eventId: string, dataset: OfflineDataset): OfflineDatasetMeta {
  return {
    eventId, event: dataset.event, sessions: dataset.sessions,
    primaryScanner: dataset.primaryScanner, lastSuccessfulSync: dataset.lastSuccessfulSync,
    totalTickets: dataset.totalTickets ?? dataset.tickets.length,
    isOfflineHalted: dataset.isOfflineHalted, offlineStatus: dataset.offlineStatus,
  };
}

// Existing devices may still have unsynced scans from the localStorage release.
// Move the snapshot and logs together before allowing the IndexedDB path to run.
const legacyMigrationPromises = new Map<string, Promise<void>>();

async function migrateLegacyOfflineEvent(db: IDBDatabase, eventId: string): Promise<void> {
  const existing = legacyMigrationPromises.get(eventId);
  if (existing) return existing;
  const migration = migrateLegacyOfflineEventOnce(db, eventId);
  legacyMigrationPromises.set(eventId, migration);
  try {
    await migration;
  } finally {
    legacyMigrationPromises.delete(eventId);
  }
}

async function migrateLegacyOfflineEventOnce(db: IDBDatabase, eventId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const datasetKey = getOfflineDatasetKey(eventId);
  const pendingKey = getOfflinePendingScansKey(eventId);
  const raw = window.localStorage.getItem(datasetKey);
  if (!raw) return;
  const pendingRaw = window.localStorage.getItem(pendingKey);
  const dataset = JSON.parse(raw) as OfflineDataset;
  const pending = pendingRaw ? JSON.parse(pendingRaw) as OfflinePendingScanItem[] : [];
  if (!Array.isArray(dataset.tickets) || !Array.isArray(pending)) {
    throw new Error('Invalid legacy offline data');
  }
  const tx = db.transaction([STORE_DATASETS, STORE_TICKETS, STORE_PENDING_SCANS], 'readwrite');
  const datasets = tx.objectStore(STORE_DATASETS);
  const existing = await idbReq<OfflineDatasetMeta | undefined>(datasets.get(eventId));
  if (!existing) {
    datasets.put({ ...datasetMetadata(eventId, dataset), lastScanSequence: pending.length });
    for (const ticket of dataset.tickets) tx.objectStore(STORE_TICKETS).put({ ...ticket, eventId });
  } else if (pending.length > 0) {
    // Two local histories need reconciliation; preserve their logs and stop
    // admission until sync + a fresh central snapshot establishes the state.
    datasets.put({ ...existing, isOfflineHalted: true, offlineStatus: 'halted_reconciliation_required' });
  }
  for (const [index, scan] of pending.entries()) {
    tx.objectStore(STORE_PENDING_SCANS).put({
      ...scan, localSequence: existing ? index - pending.length : index + 1,
    });
  }
  await idbTxComplete(tx);
  if (window.localStorage.getItem(datasetKey) === raw) window.localStorage.removeItem(datasetKey);
  if (window.localStorage.getItem(pendingKey) === pendingRaw) window.localStorage.removeItem(pendingKey);
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
  assignmentEpoch: number;
  assignmentToken: string;
}): EvaluatedCandidateOk | EvaluatedCandidateRejected {
  const { input, ticket, eventTitle, assignmentEpoch, assignmentToken } = params;

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
    qrHash: ticket.qrHash || hashOfflineQrPayload(input.eventId, input.qrPayloadOrCode.trim()),
    assignmentEpoch,
    assignmentToken,
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
  const assignment = dataset.primaryScanner;
  if (!assignment || assignment.scannerId !== input.scannerId || !assignment.assignmentEpoch || !assignment.assignmentToken) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'STALE_PRIMARY_ASSIGNMENT',
      message: 'ชุดข้อมูลออฟไลน์ไม่มีหลักฐานการมอบหมายเครื่องหลักปัจจุบัน กรุณาดาวน์โหลดชุดข้อมูลใหม่',
    };
  }
  let ticketIndex = dataset.tickets.findIndex(
    (t: OfflineTicketItem) =>
      (typeof t.qrHash === 'string' && t.qrHash === inputHash) ||
      (typeof t.ticketCode === 'string' &&
        (t.ticketCode === cleanInput || t.ticketCode.toUpperCase() === cleanInput.toUpperCase())),
  );

  const orderSuffix = ticketIndex === -1 ? parseOrderAndSuffixPattern(cleanInput) : null;
  if (ticketIndex === -1 && orderSuffix) {
    const prefix = `TK-${orderSuffix.orderPart}-`;
    const suffix = `-${orderSuffix.suffixPart}`;
    const sessionMatches: number[] = [];
    const eventMatches: number[] = [];
    dataset.tickets.forEach((t: OfflineTicketItem, idx: number) => {
      const code = typeof t.ticketCode === 'string' ? t.ticketCode.toUpperCase() : '';
      if (code.startsWith(prefix) && code.endsWith(suffix)) {
        eventMatches.push(idx);
        if (t.sessionId === input.sessionId) {
          sessionMatches.push(idx);
        }
      }
    });
    const candidates = sessionMatches.length > 0 ? sessionMatches : eventMatches;
    if (candidates.length > 1) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'AMBIGUOUS_TICKET_ORDER_SUFFIX',
        message: 'ยังพบบัตรซ้ำในคำสั่งซื้อเดียวกัน กรุณากรอกเลขลำดับใบ (NN) เพิ่มเติม',
      };
    }
    if (candidates.length === 1) {
      ticketIndex = candidates[0];
    }
  }

  if (ticketIndex === -1 && isTicketSuffixShortcut(cleanInput)) {
    const suffix = `-${cleanInput.toUpperCase()}`;
    const sessionMatches: number[] = [];
    const eventMatches: number[] = [];
    dataset.tickets.forEach((t: OfflineTicketItem, idx: number) => {
      if (typeof t.ticketCode === 'string' && t.ticketCode.toUpperCase().endsWith(suffix)) {
        eventMatches.push(idx);
        if (t.sessionId === input.sessionId) {
          sessionMatches.push(idx);
        }
      }
    });
    const candidates = sessionMatches.length > 0 ? sessionMatches : eventMatches;
    if (candidates.length > 1) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'AMBIGUOUS_TICKET_SUFFIX',
        message: 'พบรหัสท้ายซ้ำกันมากกว่า 1 ใบในรอบนี้ กรุณากรอกรหัสบัตรเต็ม (TK-...)',
      };
    }
    if (candidates.length === 1) {
      ticketIndex = candidates[0];
    }
  }

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
    assignmentEpoch: assignment.assignmentEpoch,
    assignmentToken: assignment.assignmentToken,
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
      if (getOfflinePendingScans(eventId).length > 0) {
        throw new Error('กรุณาซิงก์รายการสแกนค้างก่อนดาวน์โหลดชุดข้อมูลใหม่');
      }
      window.localStorage.setItem(getOfflineDatasetKey(eventId), JSON.stringify(dataset));
    }
    return;
  }

  const db = await openOfflineAdmissionDb(factory);
  try {
    await migrateLegacyOfflineEvent(db, eventId);
    const tx = db.transaction([STORE_DATASETS, STORE_TICKETS, STORE_PENDING_SCANS], 'readwrite');
    const pendingCount = await idbReq<number>(
      tx.objectStore(STORE_PENDING_SCANS).index(INDEX_BY_EVENT).count(IDBKeyRange.only(eventId)),
    );
    if (pendingCount > 0) {
      await idbTxComplete(tx);
      throw new Error('กรุณาซิงก์รายการสแกนค้างก่อนดาวน์โหลดชุดข้อมูลใหม่');
    }
    const datasetsStore = tx.objectStore(STORE_DATASETS);
    const ticketsStore = tx.objectStore(STORE_TICKETS);

    const meta = datasetMetadata(eventId, dataset);
    datasetsStore.put(meta);

    // Enqueue new rows only after the deletion cursor is exhausted. Queuing puts
    // immediately lets later cursor iterations delete the replacement rows.
    const cursorReq = ticketsStore.index(INDEX_BY_EVENT).openKeyCursor(IDBKeyRange.only(eventId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        ticketsStore.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        for (const ticket of dataset.tickets) {
          const rec: StoredOfflineTicketRecord = { ...ticket, eventId };
          ticketsStore.put(rec);
        }
      }
    };

    await idbTxComplete(tx);
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function'
    ) {
      void navigator.storage.persist().catch(() => undefined);
    }
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
    await migrateLegacyOfflineEvent(db, eventId);
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
    await migrateLegacyOfflineEvent(db, eventId);
    const tx = db.transaction([STORE_PENDING_SCANS], 'readonly');
    const items = await idbReq<OfflinePendingScanItem[]>(
      tx.objectStore(STORE_PENDING_SCANS).index(INDEX_BY_EVENT).getAll(IDBKeyRange.only(eventId)),
    );
    await idbTxComplete(tx);
    // Secondary-index results use the random log ID as their tie breaker.
    // Preserve admission order when multiple scans share the same millisecond.
    return Array.isArray(items) ? items.sort((a, b) => {
      const timeDiff = Date.parse(a.scannedAt) - Date.parse(b.scannedAt);
      return (Number.isFinite(timeDiff) ? timeDiff : 0) || (a.localSequence ?? 0) - (b.localSequence ?? 0);
    }) : [];
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
    await migrateLegacyOfflineEvent(db, input.eventId);
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

    const assignment = datasetMeta.primaryScanner;
    if (!assignment || assignment.scannerId !== input.scannerId || !assignment.assignmentEpoch || !assignment.assignmentToken) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'STALE_PRIMARY_ASSIGNMENT',
        message: 'ชุดข้อมูลออฟไลน์ไม่มีหลักฐานการมอบหมายเครื่องหลักปัจจุบัน กรุณาดาวน์โหลดชุดข้อมูลใหม่',
      };
    }

    const cleanInput = input.qrPayloadOrCode.trim();
    const inputHash = hashOfflineQrPayload(input.eventId, cleanInput);
    let ticket = await idbReq<StoredOfflineTicketRecord | undefined>(
      ticketsStore.index(INDEX_TICKETS_BY_EVENT_QR).get([input.eventId, inputHash]),
    );

    if (!ticket && ticketsStore.indexNames.contains(INDEX_TICKETS_BY_EVENT_CODE)) {
      ticket = await idbReq<StoredOfflineTicketRecord | undefined>(
        ticketsStore.index(INDEX_TICKETS_BY_EVENT_CODE).get([input.eventId, cleanInput]),
      );
      if (!ticket && cleanInput !== cleanInput.toUpperCase()) {
        ticket = await idbReq<StoredOfflineTicketRecord | undefined>(
          ticketsStore.index(INDEX_TICKETS_BY_EVENT_CODE).get([
            input.eventId,
            cleanInput.toUpperCase(),
          ]),
        );
      }
    }

    const orderSuffix = parseOrderAndSuffixPattern(cleanInput);
    const isSuffix = !orderSuffix && isTicketSuffixShortcut(cleanInput);
    const suffixTarget = isSuffix ? `-${cleanInput.toUpperCase()}` : '';
    const suffixMatches: StoredOfflineTicketRecord[] = [];
    let ambiguousReason: 'AMBIGUOUS_TICKET_SUFFIX' | 'AMBIGUOUS_TICKET_ORDER_SUFFIX' | null = null;

    if (!ticket) {
      await new Promise<void>((resolve, reject) => {
        const req = ticketsStore.index(INDEX_BY_EVENT).openCursor(IDBKeyRange.only(input.eventId));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve();
            return;
          }
          const rec = cursor.value as StoredOfflineTicketRecord;
          if (
            rec.ticketCode === cleanInput ||
            rec.ticketCode?.toUpperCase() === cleanInput.toUpperCase()
          ) {
            ticket = rec;
            resolve();
            return;
          }
          const upperCode = typeof rec.ticketCode === 'string' ? rec.ticketCode.toUpperCase() : '';
          if (
            orderSuffix &&
            upperCode.startsWith(`TK-${orderSuffix.orderPart}-`) &&
            upperCode.endsWith(`-${orderSuffix.suffixPart}`)
          ) {
            suffixMatches.push(rec);
          } else if (isSuffix && upperCode.endsWith(suffixTarget)) {
            suffixMatches.push(rec);
          }
          cursor.continue();
        };
        req.onerror = () => reject(req.error || new Error('Cursor search failed'));
      });

      if (!ticket && (isSuffix || orderSuffix) && suffixMatches.length > 0) {
        const sessionMatches = suffixMatches.filter(r => r.sessionId === input.sessionId);
        const candidates = sessionMatches.length > 0 ? sessionMatches : suffixMatches;
        if (candidates.length > 1) {
          ambiguousReason = orderSuffix ? 'AMBIGUOUS_TICKET_ORDER_SUFFIX' : 'AMBIGUOUS_TICKET_SUFFIX';
        } else if (candidates.length === 1) {
          ticket = candidates[0];
        }
      }
    }

    if (ambiguousReason) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: ambiguousReason,
        message:
          ambiguousReason === 'AMBIGUOUS_TICKET_ORDER_SUFFIX'
            ? 'ยังพบบัตรซ้ำในคำสั่งซื้อเดียวกัน กรุณากรอกเลขลำดับใบ (NN) เพิ่มเติม'
            : 'พบรหัสท้ายซ้ำกันมากกว่า 1 ใบในรอบนี้ กรุณากรอกช่อง 4 ตัวหน้า (XXXX) เพิ่มเติม',
      };
    }

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
      assignmentEpoch: assignment.assignmentEpoch,
      assignmentToken: assignment.assignmentToken,
    });
    if (evaluated.rejected) {
      return evaluated.rejected;
    }

    const { ticketSummary, targetAdmissionStatus, pendingItem, scannedAt } = evaluated;

    const localSequence = (datasetMeta.lastScanSequence ?? 0) + 1;
    pendingStore.add({ ...pendingItem, localSequence });
    datasetsStore.put({ ...datasetMeta, lastScanSequence: localSequence });
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
  securityRejectionsCount?: number;
  lastSuccessfulSync?: string;
  message?: string;
}

export function sortPendingScansInOrder(
  scans: OfflinePendingScanItem[],
): OfflinePendingScanItem[] {
  return [...scans].sort((a, b) => {
    const seqA = typeof a.localSequence === 'number' ? a.localSequence : Number.MAX_SAFE_INTEGER;
    const seqB = typeof b.localSequence === 'number' ? b.localSequence : Number.MAX_SAFE_INTEGER;
    if (seqA !== seqB) return seqA - seqB;
    return a.scannedAt.localeCompare(b.scannedAt);
  });
}

export interface SyncProgressInfo {
  syncedSoFar: number;
  total: number;
}

async function postOfflineSyncBatch(
  eventId: string,
  pendingScans: OfflinePendingScanItem[],
): Promise<
  | {
      ok: true;
      acknowledgedIds: string[];
      conflictsCount: number;
      securityRejectionsCount: number;
      lastSuccessfulSync?: string;
      authorizationLost?: boolean;
    }
  | {
      ok: false;
      acknowledgedIds: string[];
      conflictsCount: number;
      securityRejectionsCount: number;
      lastSuccessfulSync?: string;
      authorizationLost?: boolean;
      message: string;
    }
> {
  try {
    const res = await fetch(`/api/scanner/events/${eventId}/offline-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scans: pendingScans }),
    });
    const data = await res.json();
    const acknowledgedIds: string[] = Array.isArray(data.acknowledgedIds) ? data.acknowledgedIds : [];
    const conflictsCount = Number(data.conflictsCount) || 0;
    const securityRejectionsCount = Number(data.securityRejectionsCount) || 0;
    const lastSuccessfulSync = typeof data.lastSuccessfulSync === 'string' ? data.lastSuccessfulSync : undefined;
    const authorizationLost = Boolean(data.authorizationLost);
    if (!res.ok) {
      return {
        ok: false,
        acknowledgedIds,
        conflictsCount,
        securityRejectionsCount,
        lastSuccessfulSync,
        authorizationLost,
        message: data.message || 'การซิงก์ข้อมูลล้มเหลว',
      };
    }
    return {
      ok: true,
      acknowledgedIds,
      conflictsCount,
      securityRejectionsCount,
      lastSuccessfulSync,
      authorizationLost,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      acknowledgedIds: [],
      conflictsCount: 0,
      securityRejectionsCount: 0,
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
  options?: { onProgress?: (progress: SyncProgressInfo) => void; chunkSize?: number },
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

  const sortedPending = sortPendingScansInOrder(getOfflinePendingScans(eventId, store));
  if (sortedPending.length === 0) {
    return {
      success: true,
      acknowledgedCount: 0,
      remainingCount: 0,
      conflictsCount: 0,
      message: 'ไม่มีรายการรอซิงก์ในเครื่อง',
    };
  }

  const chunkSize = Math.max(1, Math.min(500, options?.chunkSize ?? OFFLINE_SYNC_CHUNK_SIZE));
  let remaining = sortedPending;
  let totalAcknowledged = 0;
  let totalConflicts = 0;
  let totalSecurityRejections = 0;
  let lastSuccessfulSync: string | undefined;
  let failedMessage: string | null = null;

  for (let i = 0; i < sortedPending.length; i += chunkSize) {
    const chunk = sortedPending.slice(i, i + chunkSize);
    const postRes = await postOfflineSyncBatch(eventId, chunk);
    const ackSet = new Set(postRes.acknowledgedIds);
    remaining = remaining.filter((p) => !ackSet.has(p.id));

    if (remaining.length === 0) {
      clearOfflinePendingScans(eventId, store);
    } else {
      store.setItem(getOfflinePendingScansKey(eventId), JSON.stringify(remaining));
    }

    totalAcknowledged += postRes.acknowledgedIds.length;
    totalConflicts += postRes.conflictsCount;
    totalSecurityRejections += postRes.securityRejectionsCount;
    if (postRes.lastSuccessfulSync) {
      lastSuccessfulSync = postRes.lastSuccessfulSync;
    }

    options?.onProgress?.({ syncedSoFar: totalAcknowledged, total: sortedPending.length });

    if (!postRes.ok || postRes.authorizationLost) {
      failedMessage = postRes.ok ? 'สิทธิ์เครื่องหลักถูกเปลี่ยนระหว่างการซิงก์' : postRes.message;
      break;
    }
  }

  if (lastSuccessfulSync) {
    try {
      const raw = store.getItem(getOfflineDatasetKey(eventId));
      if (raw) {
        const ds = JSON.parse(raw);
        ds.lastSuccessfulSync = lastSuccessfulSync;
        store.setItem(getOfflineDatasetKey(eventId), JSON.stringify(ds));
      }
    } catch {
      // Ignored
    }
  }

  return {
    success: failedMessage === null,
    acknowledgedCount: totalAcknowledged,
    remainingCount: remaining.length,
    conflictsCount: totalConflicts,
    securityRejectionsCount: totalSecurityRejections,
    lastSuccessfulSync,
    message:
      failedMessage ??
      `ซิงก์สำเร็จ ${totalAcknowledged} รายการ${totalConflicts > 0 ? ` (พบข้อขัดแย้ง ${totalConflicts} รายการ)` : ''}${totalSecurityRejections > 0 ? ` (ส่ง ${totalSecurityRejections} รายการให้เจ้าของเว็บตรวจสอบ)` : ''}`,
  };
}

/**
 * Synchronize pending offline scans stored in IndexedDB in ordered chunks,
 * committing acknowledged deletions atomically after each chunk.
 */
export async function syncPendingOfflineScansAsync(
  eventId: string,
  idb?: IDBFactory,
  options?: { onProgress?: (progress: SyncProgressInfo) => void; chunkSize?: number },
): Promise<SyncOfflineScansResult> {
  const factory = resolveIndexedDb(idb);
  if (!factory) {
    return syncPendingOfflineScans(eventId, undefined, options);
  }

  const sortedPending = sortPendingScansInOrder(
    await getOfflinePendingScansAsync(eventId, factory),
  );
  if (sortedPending.length === 0) {
    return {
      success: true,
      acknowledgedCount: 0,
      remainingCount: 0,
      conflictsCount: 0,
      message: 'ไม่มีรายการรอซิงก์ในเครื่อง',
    };
  }

  const chunkSize = Math.max(1, Math.min(500, options?.chunkSize ?? OFFLINE_SYNC_CHUNK_SIZE));
  let totalAcknowledged = 0;
  let totalConflicts = 0;
  let totalSecurityRejections = 0;
  let lastSuccessfulSync: string | undefined;
  let failedMessage: string | null = null;
  let remainingCount = sortedPending.length;

  try {
    for (let i = 0; i < sortedPending.length; i += chunkSize) {
      const chunk = sortedPending.slice(i, i + chunkSize);
      const postRes = await postOfflineSyncBatch(eventId, chunk);

      const db = await openOfflineAdmissionDb(factory);
      try {
        const tx = db.transaction([STORE_PENDING_SCANS, STORE_DATASETS], 'readwrite');
        const pendingStore = tx.objectStore(STORE_PENDING_SCANS);
        const datasetsStore = tx.objectStore(STORE_DATASETS);

        for (const ackId of postRes.acknowledgedIds) {
          pendingStore.delete(ackId);
        }

        if (postRes.lastSuccessfulSync) {
          lastSuccessfulSync = postRes.lastSuccessfulSync;
          const meta = await idbReq<OfflineDatasetMeta | undefined>(datasetsStore.get(eventId));
          if (meta) {
            datasetsStore.put({ ...meta, lastSuccessfulSync: postRes.lastSuccessfulSync });
          }
        }

        remainingCount = await idbReq<number>(
          pendingStore.index(INDEX_BY_EVENT).count(IDBKeyRange.only(eventId)),
        );

        await idbTxComplete(tx);
      } finally {
        db.close();
      }

      totalAcknowledged += postRes.acknowledgedIds.length;
      totalConflicts += postRes.conflictsCount;
      totalSecurityRejections += postRes.securityRejectionsCount;
      options?.onProgress?.({ syncedSoFar: totalAcknowledged, total: sortedPending.length });

      if (!postRes.ok || postRes.authorizationLost) {
        failedMessage = postRes.ok ? 'สิทธิ์เครื่องหลักถูกเปลี่ยนระหว่างการซิงก์' : postRes.message;
        break;
      }
    }

    return {
      success: failedMessage === null,
      acknowledgedCount: totalAcknowledged,
      remainingCount,
      conflictsCount: totalConflicts,
      securityRejectionsCount: totalSecurityRejections,
      lastSuccessfulSync,
      message:
        failedMessage ??
        `ซิงก์สำเร็จ ${totalAcknowledged} รายการ${totalConflicts > 0 ? ` (พบข้อขัดแย้ง ${totalConflicts} รายการ)` : ''}${totalSecurityRejections > 0 ? ` (ส่ง ${totalSecurityRejections} รายการให้เจ้าของเว็บตรวจสอบ)` : ''}`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      acknowledgedCount: totalAcknowledged,
      remainingCount,
      conflictsCount: totalConflicts,
      message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการซิงก์ข้อมูลออฟไลน์',
    };
  }
}

export interface OfflineBackupPayload {
  version: 1;
  eventId: string;
  exportedAt: string;
  datasetMeta: OfflineDatasetMeta | null;
  pendingScansCount: number;
  pendingScans: OfflinePendingScanItem[];
  checksum: string;
}

function computeBackupChecksum(eventId: string, scans: OfflinePendingScanItem[]): string {
  const canonical = `${eventId}:${scans.length}:${scans
    .map((s) => `${s.id}|${s.ticketId}|${s.action}|${s.scannedAt}|${s.localSequence ?? ''}`)
    .join(';')}`;
  return hashOfflineQrPayload(eventId, canonical);
}

/**
 * Export offline metadata and ordered pending entry/exit scans as a verifiable JSON backup.
 */
export async function exportOfflineBackupAsync(
  eventId: string,
  idb?: IDBFactory,
): Promise<OfflineBackupPayload> {
  const datasetMeta = await getOfflineDatasetMetaAsync(eventId, idb);
  const pendingScans = sortPendingScansInOrder(
    await getOfflinePendingScansAsync(eventId, idb),
  );
  return {
    version: 1,
    eventId,
    exportedAt: new Date().toISOString(),
    datasetMeta,
    pendingScansCount: pendingScans.length,
    pendingScans,
    checksum: computeBackupChecksum(eventId, pendingScans),
  };
}

/**
 * Validate and merge pending entry/exit scans from an offline JSON backup without duplicating existing IDs.
 */
export async function importOfflineBackupAsync(
  eventId: string,
  rawJson: string,
  idb?: IDBFactory,
): Promise<{ importedCount: number; skippedDuplicates: number; totalPendingCount: number }> {
  let parsed: OfflineBackupPayload;
  try {
    parsed = JSON.parse(rawJson) as OfflineBackupPayload;
  } catch {
    throw new Error('ไฟล์สำรองข้อมูลไม่ใช่รูปแบบ JSON ที่ถูกต้อง');
  }

  if (parsed?.version !== 1 || parsed.eventId !== eventId || !Array.isArray(parsed.pendingScans)) {
    throw new Error('ไฟล์สำรองข้อมูลไม่ตรงกับงานคอนเสิร์ตนี้หรือรูปแบบไม่ถูกต้อง');
  }

  const expectedChecksum = computeBackupChecksum(eventId, parsed.pendingScans);
  if (parsed.checksum !== expectedChecksum) {
    throw new Error('ไฟล์สำรองข้อมูลไม่สมบูรณ์หรือถูกแก้ไข (Checksum ไม่ตรงกัน)');
  }

  const orderedScans = sortPendingScansInOrder(parsed.pendingScans);
  const factory = resolveIndexedDb(idb);

  if (!factory) {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('อุปกรณ์ไม่รองรับการจัดเก็บข้อมูล');
    }
    const existing = getOfflinePendingScans(eventId);
    const existingIds = new Set(existing.map((s) => s.id));
    let importedCount = 0;
    let skippedDuplicates = 0;
    const merged = [...existing];
    for (const scan of orderedScans) {
      if (existingIds.has(scan.id)) {
        skippedDuplicates++;
        continue;
      }
      existingIds.add(scan.id);
      merged.push(scan);
      importedCount++;
    }
    window.localStorage.setItem(getOfflinePendingScansKey(eventId), JSON.stringify(merged));
    return { importedCount, skippedDuplicates, totalPendingCount: merged.length };
  }

  const db = await openOfflineAdmissionDb(factory);
  try {
    const tx = db.transaction([STORE_PENDING_SCANS], 'readwrite');
    const pendingStore = tx.objectStore(STORE_PENDING_SCANS);
    const existing = await idbReq<OfflinePendingScanItem[]>(
      pendingStore.index(INDEX_BY_EVENT).getAll(IDBKeyRange.only(eventId)),
    );
    const existingIds = new Set(existing.map((s) => s.id));

    let importedCount = 0;
    let skippedDuplicates = 0;

    for (const scan of orderedScans) {
      if (!scan.id || existingIds.has(scan.id)) {
        skippedDuplicates++;
        continue;
      }
      existingIds.add(scan.id);
      pendingStore.add({ ...scan, eventId });
      importedCount++;
    }

    const totalPendingCount = await idbReq<number>(
      pendingStore.index(INDEX_BY_EVENT).count(IDBKeyRange.only(eventId)),
    );
    await idbTxComplete(tx);
    return { importedCount, skippedDuplicates, totalPendingCount };
  } finally {
    db.close();
  }
}

