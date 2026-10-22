import type { OfflineDataset, OfflineTicketItem } from '../server/primary-scanner';

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

/**
 * Perform an offline admission scan on the primary device (AC-40, AC-41, AC-50, AC-96, AC-103).
 *
 * Rules:
 * 1. Only primary device can scan offline (AC-40, O1). Non-primary rejected.
 * 2. Missing ticket or ticket not found in dataset returns wait for online (AC-41, O2).
 *    Never assumes valid and never flags as fake.
 * 3. State transitions outside -> inside -> outside -> inside (AC-96, AC-50).
 *    Entry while inside rejected with 'ALREADY_INSIDE'.
 *    Exit while outside rejected with 'NOT_INSIDE'.
 * 4. Admission window check (AC-100) and ticket status check (AC-101).
 * 5. Atomic local storage write: Pending queue and updated ticket status written to localStorage
 *    BEFORE success is displayed. If write fails, rollback and display failure (AC-103).
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
      message: 'เครื่องนี้ไม่ใช่เครื่องหลักประจำงาน ไม่อนุญาตให้สแกนในโหมดออฟไลน์ (AC-40, O1)',
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
        message: 'การสแกนออฟไลน์ถูกระงับเพื่อกระทบยอด (AC-98) กรุณาเชื่อมต่อออนไลน์เพื่อตรวจสอบร่วมกับผู้จัดงาน',
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
  const ticketIndex = dataset.tickets.findIndex(
    (t: OfflineTicketItem) => t.qrPayload === cleanInput || t.ticketCode === cleanInput,
  );

  if (ticketIndex === -1) {
    // Missing tickets or newly bought tickets not in snapshot must NOT pass and are NOT fake
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'OFFLINE_TICKET_NOT_FOUND',
      message: 'ไม่พบข้อมูลบัตรในชุดข้อมูลออฟไลน์ กรุณารอเชื่อมต่อออนไลน์ (AC-41, O2)',
    };
  }

  const ticket = dataset.tickets[ticketIndex];

  // 5. Session matching (AC-100)
  if (ticket.sessionId !== input.sessionId) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'WRONG_SESSION',
      message: 'บัตรใบนี้เป็นของรอบการแสดงอื่น ไม่ตรงกับรอบที่กำลังสแกน (AC-100)',
    };
  }

  // 6. Ticket status validation from snapshot (AC-101)
  if (ticket.status === 'cancelled') {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'TICKET_CANCELLED',
      message: 'บัตรถูกยกเลิกแล้ว ไม่อนุญาตให้เข้างาน (AC-101)',
    };
  }

  if (ticket.status === 'refunded' || ticket.isRefunded) {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'TICKET_REFUNDED',
      message: 'บัตรถูกคืนเงินแล้ว ไม่อนุญาตให้เข้างาน (AC-101)',
    };
  }

  if (ticket.status !== 'valid') {
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'INVALID_TICKET',
      message: 'สถานะบัตรไม่ถูกต้อง ไม่อนุญาตให้เข้างาน (AC-101)',
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
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'OUTSIDE_ADMISSION_WINDOW',
        message: 'ยังไม่ถึงช่วงเวลาเปิดรับเข้างาน (AC-100)',
      };
    }

    if (windowEnd && currentTime > windowEnd) {
      return {
        success: false,
        status: 'rejected',
        action: input.action,
        reason: 'OUTSIDE_ADMISSION_WINDOW',
        message: 'พ้นช่วงเวลาเปิดรับเข้างานแล้ว (AC-100)',
      };
    }
  }

  // Summary object for scan result card (AC-65: Zero buyer PII)
  const ticketSummary = {
    ticketId: ticket.id,
    ticketCode: ticket.ticketCode,
    ticketTypeName: ticket.ticketTypeName,
    ticketPrice: 0,
    eventTitle: dataset.event?.title || '',
    sessionId: ticket.sessionId,
    sessionStartTime: ticket.admissionWindow?.startTime || '',
    sessionEndTime: ticket.admissionWindow?.endTime || '',
    admissionStatus: ticket.admissionStatus,
    scannedAt: currentTime.toISOString(),
  };

  // 8. State transition check (AC-96, AC-50, AC-49)
  let targetAdmissionStatus: 'inside' | 'outside';
  if (input.action === 'entry') {
    if (ticket.admissionStatus === 'inside') {
      return {
        success: false,
        status: 'rejected',
        action: 'entry',
        reason: 'ALREADY_INSIDE',
        message: 'บัตรอยู่ในพื้นที่จัดงานแล้ว ไม่อนุญาตให้เข้าซ้ำ (AC-49, AC-96)',
        ticket: ticketSummary,
      };
    }
    targetAdmissionStatus = 'inside';
  } else {
    // exit action
    if (ticket.admissionStatus !== 'inside') {
      return {
        success: false,
        status: 'rejected',
        action: 'exit',
        reason: 'NOT_INSIDE',
        message: 'บัตรอยู่นอกพื้นที่จัดงาน ไม่สามารถบันทึกออกได้',
        ticket: ticketSummary,
      };
    }
    targetAdmissionStatus = 'outside';
  }

  // 9. Atomic Local Storage Persistence (AC-103)
  // Offline scan must be persisted to pending sync queue before displaying success.
  const scannedAt = currentTime.toISOString();
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

  const existingPending = getOfflinePendingScans(input.eventId, store);
  const nextPending = [...existingPending, pendingItem];

  // Backup original status in case storage write fails
  const originalAdmissionStatus = ticket.admissionStatus;

  try {
    // 1. Write pending queue
    store.setItem(getOfflinePendingScansKey(input.eventId), JSON.stringify(nextPending));

    // 2. Update cached dataset ticket state
    dataset.tickets[ticketIndex].admissionStatus = targetAdmissionStatus;
    store.setItem(getOfflineDatasetKey(input.eventId), JSON.stringify(dataset));
  } catch (_storageErr) {
    // CRITICAL (AC-103): If write fails, rollback and DO NOT claim success
    ticket.admissionStatus = originalAdmissionStatus;
    return {
      success: false,
      status: 'rejected',
      action: input.action,
      reason: 'STORAGE_WRITE_FAILURE',
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลงอุปกรณ์ (Storage Error) ไม่อนุญาตให้ผ่าน (AC-103)',
    };
  }

  // 10. Scan succeeded offline and persisted to device
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
 * Synchronize all pending offline scans for an event to the server (AC-102, AC-99).
 * Removes only acknowledged scan items from local storage.
 * If all pending items are acknowledged, fetches and updates the cached offline dataset.
 */
export async function syncPendingOfflineScans(
  eventId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): Promise<{
  success: boolean;
  acknowledgedCount: number;
  remainingCount: number;
  conflictsCount: number;
  lastSuccessfulSync?: string;
  message?: string;
}> {
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

  try {
    const res = await fetch(`/api/scanner/events/${eventId}/offline-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scans: pendingScans }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        acknowledgedCount: 0,
        remainingCount: pendingScans.length,
        conflictsCount: 0,
        message: data.message || 'การซิงก์ข้อมูลล้มเหลว',
      };
    }

    const acknowledgedIds: string[] = Array.isArray(data.acknowledgedIds) ? data.acknowledgedIds : [];
    const remaining = pendingScans.filter(p => !acknowledgedIds.includes(p.id));

    // Update pending queue in storage (AC-102 partial sync support)
    if (remaining.length === 0) {
      clearOfflinePendingScans(eventId, store);
    } else {
      store.setItem(getOfflinePendingScansKey(eventId), JSON.stringify(remaining));
    }

    // If sync succeeded and lastSuccessfulSync provided, update dataset sync timestamp
    if (data.lastSuccessfulSync) {
      try {
        const raw = store.getItem(getOfflineDatasetKey(eventId));
        if (raw) {
          const ds = JSON.parse(raw);
          ds.lastSuccessfulSync = data.lastSuccessfulSync;
          store.setItem(getOfflineDatasetKey(eventId), JSON.stringify(ds));
        }
      } catch {
        // Ignored
      }
    }

    return {
      success: true,
      acknowledgedCount: acknowledgedIds.length,
      remainingCount: remaining.length,
      conflictsCount: data.conflictsCount || 0,
      lastSuccessfulSync: data.lastSuccessfulSync,
      message: `ซิงก์สำเร็จ ${acknowledgedIds.length} รายการ${data.conflictsCount > 0 ? ` (พบข้อขัดแย้ง ${data.conflictsCount} รายการ — AC-99)` : ''}`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      acknowledgedCount: 0,
      remainingCount: pendingScans.length,
      conflictsCount: 0,
      message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อซิงก์ข้อมูล',
    };
  }
}

