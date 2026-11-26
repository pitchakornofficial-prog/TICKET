'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import jsQR from 'jsqr';
import {
  CheckCircleIcon,
  CrossCircleIcon,
  RefreshIcon,
  ClockIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  CameraIcon,
  CameraOffIcon,
  FlashlightIcon,
} from './icons';
import { formatTime } from '@/lib/locale';
import {
  buildSegmentedTicketQuery,
  parsePastedTicketSegments,
} from '@/lib/ticket-code-input';
import {
  saveOfflineDatasetAsync,
  getOfflineDatasetMetaAsync,
  getOfflinePendingScansAsync,
  performOfflineAdmissionScanAsync,
  syncPendingOfflineScansAsync,
  exportOfflineBackupAsync,
  importOfflineBackupAsync,
  readPersistedOfflineMode,
  writePersistedOfflineMode,
  type SyncProgressInfo,
} from '@/lib/offline-admission';

/**
 * Warn before refreshing or closing the scanner tab while offline mode is active
 * or while offline scan records are waiting to be synced.
 */
export function shouldWarnBeforeUnload(isOfflineMode: boolean, pendingSyncCount: number): boolean {
  return isOfflineMode || pendingSyncCount > 0;
}

interface ScannedTicketSummary {
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
}

interface ScanResult {
  success: boolean;
  status: 'success' | 'rejected';
  action: 'entry' | 'exit';
  reason?: string;
  message: string;
  ticket?: ScannedTicketSummary;
}

interface AdmissionStats {
  sessionId: string;
  totalTickets: number;
  currentlyInside: number;
  currentlyOutside: number;
  totalEntries: number;
  totalExits: number;
}

interface AdmissionLogItem {
  id: string;
  ticketId: string;
  ticketCode: string;
  scannerName: string;
  action: 'entry' | 'exit';
  status: 'success' | 'rejected';
  reason: string | null;
  deviceMode: string;
  createdAt: string;
}

interface ScannerAdmissionTerminalProps {
  eventId: string;
  eventTitle: string;
  sessionId: string;
  sessionTitle?: string;
  startTime: string;
  endTime: string;
  admissionStartTime?: string | null;
  admissionEndTime?: string | null;
  isPrimary?: boolean;
  primaryScannerName?: string | null;
  scannerId?: string;
  scannerName?: string;
  actorRole?: string;
  onClose?: () => void;
}

function playScanBeep(success: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.value = success ? 880 : 280;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.12 : 0.25));
    osc.onended = () => {
      void ctx.close().catch(() => undefined);
    };
  } catch {
    // ignore audio playback restrictions
  }
}

export function ScannerAdmissionTerminal({
  eventId,
  eventTitle,
  sessionId,
  startTime,
  endTime,
  admissionStartTime,
  admissionEndTime,
  isPrimary = false,
  primaryScannerName = null,
  scannerId,
  scannerName,
  actorRole,
  onClose,
}: ScannerAdmissionTerminalProps) {
  const [action, setAction] = useState<'entry' | 'exit'>('entry');
  const [orderPart, setOrderPart] = useState('');
  const [indexPart, setIndexPart] = useState('');
  const [suffixPart, setSuffixPart] = useState('');
  const [highlightedSegment, setHighlightedSegment] = useState<'none' | 'order' | 'index'>('none');
  const [segmentHint, setSegmentHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [stats, setStats] = useState<AdmissionStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AdmissionLogItem[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);
  const [activeTerminalTab, setActiveTerminalTab] = useState<'scan' | 'logs' | 'offline'>('scan');
  const [torchActive, setTorchActive] = useState(false);
  const [torchFeedback, setTorchFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const orderInputRef = useRef<HTMLInputElement | null>(null);
  const indexInputRef = useRef<HTMLInputElement | null>(null);
  const ticketInputRef = useRef<HTMLInputElement | null>(null);
  const wasScanResultOpenRef = useRef(false);
  const lastScannedRef = useRef<{ code: string; at: number } | null>(null);
  const scanPausedRef = useRef(false);
  scanPausedRef.current = loading || Boolean(scanResult);

  // Connectivity & Offline mode state (AC-40, AC-42, AC-96, AC-103)
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [nonPrimaryOfflineWarning, setNonPrimaryOfflineWarning] = useState<string | null>(null);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  // Offline dataset state (AC-94, AC-65, NQ-06)
  const [offlineDataset, setOfflineDataset] = useState<{
    lastSuccessfulSync?: string;
    totalTickets?: number;
    primaryScanner?: { scannerId?: string; scannerName: string } | null;
    isOfflineHalted?: boolean;
    offlineStatus?: 'active' | 'halted_reconciliation_required';
  } | null>(null);
  const [syncingDataset, setSyncingDataset] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressInfo | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const autoDownloadedEventRef = useRef<string | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDownloadOfflineDataset = useCallback(async () => {
    setSyncingDataset(true);
    setSyncFeedback(null);
    try {
      const res = await fetch(`/api/scanner/events/${eventId}/offline-dataset`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setSyncFeedback({ type: 'error', message: data.message || 'ไม่สามารถดาวน์โหลดชุดข้อมูลออฟไลน์ได้' });
      } else {
        await saveOfflineDatasetAsync(eventId, data);
        setOfflineDataset(data);
        const pending = await getOfflinePendingScansAsync(eventId);
        setPendingSyncCount(pending.length);
        setSyncFeedback({
          type: 'success',
          message: `ดาวน์โหลดชุดข้อมูลออฟไลน์สำเร็จเรียบร้อย (${data.totalTickets} ใบ)`,
        });
      }
    } catch (error) {
      setSyncFeedback({ type: 'error', message: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อดาวน์โหลดชุดข้อมูล' });
    } finally {
      setSyncingDataset(false);
    }
  }, [eventId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getOfflineDatasetMetaAsync(eventId),
      getOfflinePendingScansAsync(eventId),
    ])
      .then(([meta, pending]) => {
        if (!active) return;
        if (meta?.lastSuccessfulSync && typeof meta.totalTickets === 'number') {
          setOfflineDataset(meta);
          if (
            isPrimary &&
            !meta.isOfflineHalted &&
            meta.offlineStatus !== 'halted_reconciliation_required' &&
            readPersistedOfflineMode(eventId)
          ) {
            setIsOfflineMode(true);
          } else if (!isPrimary) {
            writePersistedOfflineMode(eventId, false);
          }
        } else if (isPrimary && autoDownloadedEventRef.current !== eventId) {
          autoDownloadedEventRef.current = eventId;
          void handleDownloadOfflineDataset();
        }
        setPendingSyncCount(pending.length);
      })
      .catch(() => {
        // Ignored
      });
    return () => {
      active = false;
    };
  }, [eventId, isPrimary, handleDownloadOfflineDataset]);

  useEffect(() => {
    const isOpen = Boolean(scanResult);
    if (wasScanResultOpenRef.current && !isOpen && activeTerminalTab === 'scan') {
      ticketInputRef.current?.focus();
    }
    wasScanResultOpenRef.current = isOpen;
  }, [scanResult, activeTerminalTab]);

  useEffect(() => {
    if (!shouldWarnBeforeUnload(isOfflineMode, pendingSyncCount)) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isOfflineMode, pendingSyncCount]);

  async function handleToggleOfflineMode() {
    if (isOfflineMode) {
      // Switch back to online
      setIsOfflineMode(false);
      writePersistedOfflineMode(eventId, false);
      setNonPrimaryOfflineWarning(null);
      fetchStats();
    } else {
      // Trying to switch to offline mode (AC-40, O1)
      if (!isPrimary) {
        setNonPrimaryOfflineWarning(
          'เครื่องนี้เป็นเครื่องรอง หากต้องการสแกนออฟไลน์ ต้องให้ผู้จัดงานกำหนดเป็นเครื่องหลักและหยุดเครื่องอื่นในงาน',
        );
        return;
      }

      const meta = offlineDataset || (await getOfflineDatasetMetaAsync(eventId));
      if (meta?.isOfflineHalted || meta?.offlineStatus === 'halted_reconciliation_required') {
        setSyncFeedback({
          type: 'error',
          message: 'การใช้งานโหมดออฟไลน์ถูกระงับเพื่อกระทบยอด: กรุณารอเจ้าของเว็บและผู้จัดงานตรวจสอบกระทบยอดให้เสร็จสิ้น',
        });
        return;
      }

      if (!meta) {
        setSyncFeedback({
          type: 'error',
          message: 'กรุณาดาวน์โหลดชุดข้อมูลออฟไลน์ก่อนเริ่มใช้งานโหมดออฟไลน์',
        });
        return;
      }

      setOfflineDataset(meta);
      setIsOfflineMode(true);
      writePersistedOfflineMode(eventId, true);
      setNonPrimaryOfflineWarning(null);
      setSyncFeedback(null);
    }
  }

  async function handleSyncPendingScans() {
    if (isOfflineMode) {
      setSyncFeedback({
        type: 'error',
        message: 'กรุณาสลับกลับเป็นโหมดออนไลน์ก่อนทำการซิงก์ข้อมูลสู่ระบบกลาง',
      });
      return;
    }
    setIsSyncingPending(true);
    setSyncProgress(null);
    setSyncFeedback(null);
    try {
      const res = await syncPendingOfflineScansAsync(eventId, undefined, {
        onProgress: (progress) => setSyncProgress(progress),
      });
      if (res.success) {
        setPendingSyncCount(res.remainingCount);
        if (res.lastSuccessfulSync) {
          setOfflineDataset(prev =>
            prev ? { ...prev, lastSuccessfulSync: res.lastSuccessfulSync } : prev,
          );
        }
        setSyncFeedback({
          type: res.conflictsCount > 0 || (res.securityRejectionsCount ?? 0) > 0 ? 'error' : 'success',
          message: res.message || 'ซิงก์ข้อมูลค้างสำเร็จ',
        });
        fetchStats();
      } else {
        setPendingSyncCount(res.remainingCount);
        setSyncFeedback({
          type: 'error',
          message: res.message || 'การซิงก์ข้อมูลล้มเหลว',
        });
      }
    } catch {
      setSyncFeedback({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อซิงก์ข้อมูล',
      });
    } finally {
      setIsSyncingPending(false);
      setSyncProgress(null);
    }
  }

  async function handleExportOfflineBackup() {
    try {
      const payload = await exportOfflineBackupAsync(eventId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.download = `ticket-offline-backup-${eventId}-${dateStamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSyncFeedback({
        type: 'success',
        message: `สำรองข้อมูลออฟไลน์เรียบร้อยแล้ว (${payload.pendingScansCount} รายการเข้า-ออก)`,
      });
    } catch (error) {
      setSyncFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'ไม่สามารถสำรองข้อมูลออฟไลน์ได้',
      });
    }
  }

  async function handleImportOfflineBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rawText = await file.text();
      const result = await importOfflineBackupAsync(eventId, rawText);
      setPendingSyncCount(result.totalPendingCount);
      setSyncFeedback({
        type: 'success',
        message: `กู้คืนไฟล์สำรองสำเร็จ: เพิ่ม ${result.importedCount} รายการ (ข้ามรายการซ้ำ ${result.skippedDuplicates} รายการ)`,
      });
    } catch (error) {
      setSyncFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'ไม่สามารถนำเข้าไฟล์สำรองได้',
      });
    }
  }

  // Fetch admission stats
  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const res = await fetch(`/api/scanner/admissions/stats?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setRecentLogs(data.recentLogs || []);
      }
    } catch {
      // silently ignore polling error
    } finally {
      setLoadingStats(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const resetSegmentedInputs = useCallback(() => {
    setOrderPart('');
    setIndexPart('');
    setSuffixPart('');
    setHighlightedSegment('none');
    setSegmentHint(null);
  }, []);

  const handleSegmentedAmbiguity = useCallback((reason?: string, message?: string): boolean => {
    if (reason === 'AMBIGUOUS_TICKET_SUFFIX') {
      setHighlightedSegment('order');
      setSegmentHint(message || 'พบรหัสท้ายซ้ำในรอบนี้ กรุณากรอกช่อง 4 ตัวหน้า (XXXX) เพิ่มเติม');
      setScanResult(null);
      setTimeout(() => orderInputRef.current?.focus(), 0);
      return true;
    }
    if (reason === 'AMBIGUOUS_TICKET_ORDER_SUFFIX') {
      setHighlightedSegment('index');
      setSegmentHint(message || 'ยังพบบัตรซ้ำในคำสั่งซื้อเดียวกัน กรุณากรอกเลขลำดับใบ (NN) เพิ่มเติม');
      setScanResult(null);
      setTimeout(() => indexInputRef.current?.focus(), 0);
      return true;
    }
    return false;
  }, []);

  const submitScanCode = useCallback(async (rawCode: string) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode || loading) return;

    if (isOfflineMode) {
      setLoading(true);
      try {
        const effectiveScannerId =
          isPrimary && offlineDataset?.primaryScanner?.scannerId
            ? offlineDataset.primaryScanner.scannerId
            : scannerId || 'scanner';
        const effectiveScannerName =
          isPrimary && offlineDataset?.primaryScanner?.scannerName
            ? offlineDataset.primaryScanner.scannerName
            : scannerName || (isPrimary ? 'เครื่องหลัก' : 'เครื่องสแกน');
        const offResult = await performOfflineAdmissionScanAsync({
          eventId,
          sessionId,
          scannerId: effectiveScannerId,
          scannerName: effectiveScannerName,
          isPrimary,
          qrPayloadOrCode: cleanCode,
          action,
        });

        if (handleSegmentedAmbiguity(offResult.reason, offResult.message)) {
          playScanBeep(false);
          return;
        }

        setScanResult(offResult);
        playScanBeep(offResult.success);

        if (typeof offResult.pendingCount === 'number') {
          setPendingSyncCount(offResult.pendingCount);
        }

        const newLog: AdmissionLogItem = {
          id: `off-${Date.now()}`,
          ticketId: offResult.ticket?.ticketId || '',
          ticketCode: offResult.ticket?.ticketCode || cleanCode,
          scannerName: scannerName || (isPrimary ? 'เครื่องหลัก' : 'เครื่องสแกน'),
          action,
          status: offResult.status,
          reason: offResult.reason || null,
          deviceMode: 'offline',
          createdAt: new Date().toISOString(),
        };
        setRecentLogs(prev => [newLog, ...prev.slice(0, 49)]);

        if (offResult.success) {
          setStats(prev => {
            const cur = prev || {
              sessionId,
              totalTickets: offlineDataset?.totalTickets ?? 0,
              currentlyInside: 0,
              currentlyOutside: offlineDataset?.totalTickets ?? 0,
              totalEntries: 0,
              totalExits: 0,
            };
            if (action === 'entry') {
              return {
                ...cur,
                currentlyInside: cur.currentlyInside + 1,
                currentlyOutside: Math.max(0, cur.currentlyOutside - 1),
                totalEntries: cur.totalEntries + 1,
              };
            } else {
              return {
                ...cur,
                currentlyInside: Math.max(0, cur.currentlyInside - 1),
                currentlyOutside: cur.currentlyOutside + 1,
                totalExits: cur.totalExits + 1,
              };
            }
          });
        }
        resetSegmentedInputs();
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/scanner/admissions/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          qrPayloadOrCode: cleanCode,
          action,
        }),
      });

      const data = await res.json();
      if (res.ok && data.result) {
        if (handleSegmentedAmbiguity(data.result.reason, data.result.message)) {
          playScanBeep(false);
          return;
        }
        setScanResult(data.result);
        playScanBeep(Boolean(data.result.success));
      } else {
        setScanResult({
          success: false,
          status: 'rejected',
          action,
          reason: data.error || 'ERROR',
          message: data.message || 'เกิดข้อผิดพลาดในการตรวจสอบบัตร',
        });
        playScanBeep(false);
      }
      resetSegmentedInputs();
      fetchStats();
    } catch {
      setScanResult({
        success: false,
        status: 'rejected',
        action,
        reason: 'NETWORK_ERROR',
        message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง',
      });
      playScanBeep(false);
    } finally {
      setLoading(false);
    }
  }, [
    action,
    eventId,
    fetchStats,
    handleSegmentedAmbiguity,
    isOfflineMode,
    isPrimary,
    loading,
    offlineDataset?.primaryScanner?.scannerId,
    offlineDataset?.primaryScanner?.scannerName,
    offlineDataset?.totalTickets,
    resetSegmentedInputs,
    scannerId,
    scannerName,
    sessionId,
  ]);

  const submitScanCodeRef = useRef(submitScanCode);
  submitScanCodeRef.current = submitScanCode;

  const manualQuery = buildSegmentedTicketQuery({ orderPart, indexPart, suffixPart });

  async function handleScanSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!manualQuery) return;
    await submitScanCode(manualQuery);
  }

  function handleSegmentPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text');
    const parsed = parsePastedTicketSegments(pasted);
    if (!parsed) return;
    e.preventDefault();
    if ('rawQrPayload' in parsed) {
      setSuffixPart(parsed.rawQrPayload);
      void submitScanCode(parsed.rawQrPayload);
      return;
    }
    setOrderPart(parsed.orderPart);
    setIndexPart(parsed.indexPart);
    setSuffixPart(parsed.suffixPart);
    setHighlightedSegment('none');
    setSegmentHint(null);
  }

  // Real camera stream + QR code decoding (BarcodeDetector with jsQR fallback for iOS Safari/Firefox)
  useEffect(() => {
    if (!hydrated || !cameraActive || activeTerminalTab !== 'scan' || cameraRetryNonce < 0) {
      setCameraStatus('idle');
      setCameraError(null);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let scanTimer: ReturnType<typeof setTimeout> | null = null;

    type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
    const nativeBarcodeDetectorCtor =
      typeof window !== 'undefined'
        ? (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
        : undefined;
    let barcodeDetector: InstanceType<BarcodeDetectorCtor> | null = null;
    if (nativeBarcodeDetectorCtor) {
      try {
        barcodeDetector = new nativeBarcodeDetectorCtor({ formats: ['qr_code'] });
      } catch {
        barcodeDetector = null;
      }
    }

    const decodeFrame = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && !scanPausedRef.current && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        let decoded: string | null = null;
        if (barcodeDetector) {
          try {
            const barcodes = await barcodeDetector.detect(video);
            const raw = barcodes.find(b => typeof b.rawValue === 'string' && b.rawValue.trim())?.rawValue?.trim();
            if (raw) decoded = raw;
          } catch {
            // Fall through to jsQR if BarcodeDetector fails on this device
            barcodeDetector = null;
          }
        }
        if (!decoded) {
          const canvas = decodeCanvasRef.current || document.createElement('canvas');
          decodeCanvasRef.current = canvas;
          const maxWidth = 640;
          const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
          const targetW = Math.max(1, Math.round(video.videoWidth * scale));
          const targetH = Math.max(1, Math.round(video.videoHeight * scale));
          if (canvas.width !== targetW) canvas.width = targetW;
          if (canvas.height !== targetH) canvas.height = targetH;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, targetW, targetH);
            const imageData = ctx.getImageData(0, 0, targetW, targetH);
            const qr = jsQR(imageData.data, targetW, targetH, { inversionAttempts: 'dontInvert' });
            if (qr?.data?.trim()) {
              decoded = qr.data.trim();
            }
          }
        }

        if (decoded && !cancelled) {
          const nowMs = Date.now();
          const last = lastScannedRef.current;
          if (!last || last.code !== decoded || nowMs - last.at > 2500) {
            lastScannedRef.current = { code: decoded, at: nowMs };
            void submitScanCodeRef.current(decoded);
          }
        }
      }

      if (!cancelled) {
        scanTimer = setTimeout(() => {
          void decodeFrame();
        }, 160);
      }
    };

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('error');
        setCameraError('เบราว์เซอร์ไม่รองรับการเปิดกล้อง (ต้องใช้งานผ่าน HTTPS) สามารถกรอกรหัสบัตรด้านล่างได้');
        return;
      }

      setCameraStatus('starting');
      setCameraError(null);

      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          // Fallback for desktop webcams or browsers that reject facingMode constraints
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }

        streamRef.current = stream;
        setCameraStatus('active');
        void decodeFrame();
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError('ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณาอนุญาตสิทธิ์กล้องในเบราว์เซอร์แล้วลองใหม่');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError('ไม่พบกล้องบนอุปกรณ์นี้ สามารถกรอกรหัสบัตรด้วยมือด้านล่างได้');
        } else {
          setCameraError('ไม่สามารถเปิดกล้องได้ในขณะนี้ กรุณาลองใหม่หรือกรอกรหัสบัตรด้านล่าง');
        }
        setCameraStatus('error');
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (scanTimer) clearTimeout(scanTimer);
      if (streamRef.current) {
        const track = streamRef.current.getVideoTracks()[0];
        if (track) {
          track.applyConstraints({
            advanced: [{ torch: false } as unknown as MediaTrackConstraintSet],
          }).catch(() => undefined);
        }
      }
      setTorchActive(false);
      streamRef.current = null;
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      const video = videoRef.current;
      if (video?.srcObject) {
        video.srcObject = null;
      }
    };
  }, [hydrated, cameraActive, activeTerminalTab, cameraRetryNonce]);

  const handleToggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) {
      setTorchFeedback('กรุณาเปิดกล้องก่อนใช้งานไฟแฟลช');
      setTimeout(() => setTorchFeedback(null), 3000);
      return;
    }
    const nextTorch = !torchActive;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorch } as unknown as MediaTrackConstraintSet],
      });
      setTorchActive(nextTorch);
      setTorchFeedback(null);
    } catch {
      setTorchActive(false);
      setTorchFeedback('อุปกรณ์หรือกล้องนี้ไม่รองรับการเปิดไฟแฟลช');
      setTimeout(() => setTorchFeedback(null), 3000);
    }
  }, [torchActive]);

  return (
    <div className="terminal-centered-wrapper" style={{ minWidth: 0 }}>
      <div className="terminal-wrapper" id="admission-terminal-root" style={{ minWidth: 0 }}>
        {/* Terminal Header Card (D-107) */}
        <header className="terminal-header-card" id="admission-terminal-header">
          <div className="terminal-top-nav">
            <div className="terminal-meta-row">
              <span
                data-testid="connectivity-status-badge"
                className={`scanner-conn-badge ${isOfflineMode ? 'offline' : 'online'}`}
                title={isOfflineMode ? 'โหมดออฟไลน์' : 'โหมดออนไลน์'}
              >
                <span className={`online-pulse-dot ${isOfflineMode ? 'offline' : 'online'}`} />
                <span>{isOfflineMode ? 'ออฟไลน์' : 'ออนไลน์'}</span>
              </span>

              {isPrimary ? (
                <span className="scanner-badge badge-primary-offline" data-testid="terminal-primary-badge">
                  <ShieldCheckIcon width={13} height={13} />
                  <span>เครื่องหลัก</span>
                  <span className="sr-only"> เครื่องหลักประจำงาน (Primary Device)</span>
                </span>
              ) : (
                <span
                  className="scanner-badge badge-standard-online"
                  data-testid="terminal-secondary-badge"
                >
                  <span>เครื่องรอง ({primaryScannerName || 'ยังไม่กำหนดเครื่องหลัก'})</span>
                </span>
              )}

              {pendingSyncCount > 0 && (
                <span className="scanner-pending-pill" data-testid="pending-sync-indicator">
                  รอซิงก์ <strong data-testid="pending-sync-count">{pendingSyncCount}</strong> รายการ
                </span>
              )}
            </div>

            <div className="terminal-top-actions">
              <Link
                href="/back-office/ticket-inspector"
                className="terminal-nav-btn"
                id="open-ticket-inspector-btn"
                title="เปิดระบบตรวจสอบและทดสอบคิวอาร์โค้ดบัตร (โหมดปลอดภัย ไม่ตัดรอบ)"
              >
                <QrCodeIcon width={14} height={14} />
                <span>ตรวจสอบบัตร</span>
              </Link>
              {(actorRole === 'organizer' || actorRole === 'owner') && (
                <Link
                  href="/back-office/organizer?section=scanners"
                  className="terminal-nav-btn"
                  id="back-to-organizer-btn"
                  data-testid="back-to-organizer-btn"
                  title="กลับสู่หน้าจัดการหลังบ้านผู้จัดงาน"
                >
                  กลับสู่หลังบ้านผู้จัด
                </Link>
              )}
              {onClose && (
                <button
                  type="button"
                  className="terminal-nav-btn"
                  onClick={onClose}
                  id="close-terminal-btn"
                >
                  ปิดเครื่องสแกน
                </button>
              )}
            </div>
          </div>

          <div className="terminal-heading-section">
            <h2 className="terminal-heading">
              <span className="sr-only">เครื่องตรวจบัตรเข้างาน: </span>
              {eventTitle}
            </h2>
            <p className="terminal-sub">
              <span>รอบการแสดง: {formatTime(new Date(startTime))} – {formatTime(new Date(endTime))}</span>
              {admissionStartTime && admissionEndTime && (
                <span> | ช่วงรับเข้า: {formatTime(new Date(admissionStartTime))} – {formatTime(new Date(admissionEndTime))}</span>
              )}
            </p>
          </div>
        </header>

        {/* 3-Tab Modular Sub-Navigation Bar OUTSIDE the card (D-107) */}
        <div className="terminal-sub-tabs-bar" role="tablist" aria-label="แท็บเมนูเครื่องตรวจบัตร"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <button
            type="button"
            role="tab"
            id="terminal-tab-scan"
            data-testid="terminal-tab-scan"
            aria-selected={activeTerminalTab === 'scan'}
            aria-controls="terminal-panel-scan"
            className={`terminal-tab-btn ${activeTerminalTab === 'scan' ? 'active' : ''}`}
            style={{ minWidth: 0, whiteSpace: 'normal', scrollMarginTop: '12rem' }}
            onClick={() => setActiveTerminalTab('scan')}
          >
            <QrCodeIcon width={16} height={16} />
            <span>จุดสแกนบัตร</span>
          </button>

          <button
            type="button"
            role="tab"
            id="terminal-tab-logs"
            data-testid="terminal-tab-logs"
            aria-selected={activeTerminalTab === 'logs'}
            aria-controls="terminal-panel-logs"
            className={`terminal-tab-btn ${activeTerminalTab === 'logs' ? 'active' : ''}`}
            style={{ minWidth: 0, whiteSpace: 'normal', scrollMarginTop: '12rem' }}
            onClick={() => setActiveTerminalTab('logs')}
          >
            <ClockIcon width={16} height={16} />
            <span>ประวัติการสแกน</span>
            <span className="terminal-tab-badge">{recentLogs.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            id="terminal-tab-offline"
            data-testid="terminal-tab-offline"
            aria-selected={activeTerminalTab === 'offline'}
            aria-controls="terminal-panel-offline"
            className={`terminal-tab-btn ${activeTerminalTab === 'offline' ? 'active' : ''}`}
            style={{ minWidth: 0, whiteSpace: 'normal', scrollMarginTop: '12rem' }}
            onClick={() => setActiveTerminalTab('offline')}
          >
            <ShieldCheckIcon width={16} height={16} />
            <span>จัดการระบบออฟไลน์</span>
            {pendingSyncCount > 0 && (
              <span className="terminal-tab-badge warning">{pendingSyncCount}</span>
            )}
          </button>
        </div>

        {/* Content Container Card (D-107) */}
        <div className="terminal-container" id="admission-terminal-container">
          {/* TAB 1: จุดสแกนบัตร (Hero / Primary Focus - D-107) */}
          <div
            id="terminal-panel-scan"
            role="tabpanel"
            aria-labelledby="terminal-tab-scan"
            className={`terminal-tab-panel ${activeTerminalTab === 'scan' ? 'tab-panel-active' : 'tab-panel-inactive'}`}
            hidden={activeTerminalTab !== 'scan'}
            style={activeTerminalTab !== 'scan' ? { display: 'none' } : undefined}
          >
            {/* Unified Mode and Camera Toolbar (D-107) */}
            <div className="terminal-control-toolbar">
              <div className="terminal-mode-selector">
                <button
                  type="button"
                  id="mode-entry-btn"
                  className={`mode-btn ${action === 'entry' ? 'active entry' : ''}`}
                  onClick={() => {
                    setAction('entry');
                    setScanResult(null);
                  }}
                >
                  <span className="mode-indicator" />
                  <span className="mode-label">บันทึกเข้างาน</span>
                </button>
                <button
                  type="button"
                  id="mode-exit-btn"
                  className={`mode-btn ${action === 'exit' ? 'active exit' : ''}`}
                  onClick={() => {
                    setAction('exit');
                    setScanResult(null);
                  }}
                >
                  <span className="mode-indicator" />
                  <span className="mode-label">บันทึกออก</span>
                </button>
              </div>

              {/* Camera Icon Toggle Button (D-107) */}
              <button
                type="button"
                id="toggle-camera-view-btn"
                className={`camera-icon-toggle-btn ${cameraActive ? 'active' : ''}`}
                onClick={() => setCameraActive(prev => !prev)}
                title={cameraActive ? 'ปิดช่องมองภาพกล้อง' : 'เปิดช่องมองภาพสแกนกล้อง'}
                aria-label={cameraActive ? 'ปิดช่องมองภาพกล้อง' : 'เปิดช่องมองภาพสแกนกล้อง'}
              >
                {cameraActive ? (
                  <CameraIcon width={22} height={22} />
                ) : (
                  <CameraOffIcon width={22} height={22} />
                )}
                <span className="sr-only">{cameraActive ? 'ปิดช่องมองภาพกล้อง' : 'เปิดช่องมองภาพสแกนกล้อง'}</span>
              </button>

              {/* Torch Toggle Button (single unified location next to camera toggle) */}
              <button
                type="button"
                id="toggle-torch-btn"
                data-testid="toggle-torch-btn"
                className={`camera-icon-toggle-btn torch-toggle-btn ${torchActive ? 'active' : ''}`}
                onClick={handleToggleTorch}
                disabled={!cameraActive || cameraStatus !== 'active'}
                title={
                  !cameraActive || cameraStatus !== 'active'
                    ? 'เปิดไฟแฟลช (ต้องเปิดกล้องสำเร็จก่อน)'
                    : torchActive
                      ? 'ปิดไฟแฟลช'
                      : 'เปิดไฟแฟลช'
                }
                aria-label={torchActive ? 'ปิดไฟแฟลช' : 'เปิดไฟแฟลช'}
              >
                <FlashlightIcon width={22} height={22} />
                <span className="sr-only">{torchActive ? 'ปิดไฟแฟลช' : 'เปิดไฟแฟลช'}</span>
              </button>
            </div>

            {/* Camera Viewfinder (Live Rear Camera + Automatic QR Scanner) */}
            {cameraActive && (
              <div className="camera-viewfinder" id="camera-viewfinder">
                <video
                  ref={videoRef}
                  id="scanner-live-video"
                  className="camera-video-feed"
                  autoPlay
                  playsInline
                  muted
                />
                {torchFeedback && (
                  <div style={{ position: 'absolute', top: '12px', zIndex: 12, background: 'rgba(15,23,42,0.88)', color: '#f8fafc', padding: '4px 12px', borderRadius: '999px', fontSize: '0.75rem', pointerEvents: 'none' }}>
                    {torchFeedback}
                  </div>
                )}
                <div className="camera-overlay-layer">
                  {cameraStatus === 'error' ? (
                    <div className="camera-status-box">
                      <CameraOffIcon width={32} height={32} className="camera-error-icon" />
                      <p className="camera-error-text">{cameraError}</p>
                      <button
                        type="button"
                        className="secondary-button mini-btn camera-retry-btn"
                        onClick={() => setCameraRetryNonce(n => n + 1)}
                      >
                        ลองเปิดกล้องอีกครั้ง
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="viewfinder-frame scanner-reticle" aria-hidden="true">
                        <span className="reticle-corner tl" />
                        <span className="reticle-corner tr" />
                        <span className="reticle-corner bl" />
                        <span className="reticle-corner br" />
                        <div className="viewfinder-laser" />
                      </div>
                      <p className="scanner-hint-pill">
                        {cameraStatus === 'starting'
                          ? 'กำลังเปิดกล้อง...'
                          : 'วาง QR Code ให้อยู่ในกรอบเพื่อสแกนอัตโนมัติ'}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Manual Input Section */}
            <div className="terminal-scan-section">
              <form onSubmit={handleScanSubmit} className="scan-input-form">
                <label htmlFor="scanner-ticket-input" className="form-label">
                  {action === 'entry' ? 'หรือสแกน QR / กรอกรหัสบัตร เพื่อบันทึกเข้างาน:' : 'หรือสแกน QR / กรอกรหัสบัตร เพื่อบันทึกออกนอกงาน:'}
                </label>
                <div className="scan-input-group">
                  <fieldset className="segmented-ticket-bar" aria-label="รหัสบัตรแบบแบ่งช่อง">
                    <span className="segment-prefix" aria-hidden="true">TK</span>
                    <span className="segment-dash" aria-hidden="true">-</span>
                    <input
                      ref={orderInputRef}
                      id="scanner-order-input"
                      data-testid="scanner-order-input"
                      type="text"
                      maxLength={4}
                      aria-label="รหัสคำสั่งซื้อ 4 ตัว"
                      placeholder="XXXX"
                      className={`text-input font-mono segment-box segment-order${highlightedSegment === 'order' ? ' is-highlighted' : ''}`}
                      value={orderPart}
                      onChange={e => {
                        const next = e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 4);
                        setOrderPart(next);
                        if (highlightedSegment === 'order' && next.length === 4) {
                          setHighlightedSegment('none');
                          setSegmentHint(null);
                        }
                      }}
                      onPaste={handleSegmentPaste}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                    <span className="segment-dash" aria-hidden="true">-</span>
                    <input
                      ref={indexInputRef}
                      id="scanner-index-input"
                      data-testid="scanner-index-input"
                      type="text"
                      maxLength={2}
                      inputMode="numeric"
                      aria-label="ลำดับใบ 2 หลัก"
                      placeholder="NN"
                      className={`text-input font-mono segment-box segment-index${highlightedSegment === 'index' ? ' is-highlighted' : ''}`}
                      value={indexPart}
                      onChange={e => {
                        const next = e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 2);
                        setIndexPart(next);
                        if (highlightedSegment === 'index' && next.length === 2) {
                          setHighlightedSegment('none');
                          setSegmentHint(null);
                        }
                      }}
                      onPaste={handleSegmentPaste}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="segment-dash" aria-hidden="true">-</span>
                    <input
                      ref={ticketInputRef}
                      id="scanner-ticket-input"
                      data-testid="scanner-ticket-input"
                      type="text"
                      aria-label="รหัสสุ่ม 8 ตัวท้าย หรือสแกน QR"
                      placeholder="8 ตัวท้าย (เช่น 9C4E12B0)"
                      className="text-input font-mono segment-box segment-suffix"
                      value={suffixPart}
                      onChange={e => {
                        const raw = e.target.value;
                        if (/^tkt-qr-/i.test(raw.trim()) || /^tkt-q?r?$/i.test(raw.trim())) {
                          setSuffixPart(raw.trim());
                          return;
                        }
                        setSuffixPart(raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 8));
                      }}
                      onPaste={handleSegmentPaste}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                  </fieldset>
                  <button
                    type="submit"
                    id="scanner-submit-btn"
                    className="secondary-button terminal-submit-btn"
                    disabled={loading || !hydrated || !manualQuery}
                  >
                    {loading ? 'กำลังตรวจ...' : action === 'entry' ? 'บันทึกเข้างาน' : 'บันทึกออก'}
                  </button>
                </div>
                {segmentHint && (
                  <p className="segment-escalation-hint" role="alert" data-testid="segment-escalation-hint">
                    {segmentHint}
                  </p>
                )}
              </form>
            </div>

            {/* Unified 4-Metric Quick Stats in Tab 1 (D-107) */}
            <div className="terminal-quick-stats-grid">
              <div className="terminal-quick-stat-card">
                <span className="terminal-quick-stat-label">บัตรที่ขายได้</span>
                <div className="terminal-quick-stat-value-row">
                  <span className="terminal-quick-stat-val" id="stats-tab1-total-tickets">
                    {stats?.totalTickets ?? (offlineDataset?.totalTickets ?? 0)}
                  </span>
                  <span className="terminal-stat-unit">ใบ</span>
                </div>
              </div>
              <div className="terminal-quick-stat-card">
                <span className="terminal-quick-stat-label">อยู่ในงานขณะนี้</span>
                <div className="terminal-quick-stat-value-row">
                  <span className="terminal-quick-stat-val" id="stats-currently-inside">
                    {stats?.currentlyInside ?? 0}
                  </span>
                  <span className="terminal-stat-unit">คน</span>
                </div>
              </div>
              <div className="terminal-quick-stat-card">
                <span className="terminal-quick-stat-label">สแกนเข้าแล้ว</span>
                <div className="terminal-quick-stat-value-row">
                  <span className="terminal-quick-stat-val" id="stats-total-entries">
                    {stats?.totalEntries ?? 0}
                  </span>
                  <span className="terminal-stat-unit">ครั้ง</span>
                </div>
              </div>
              <div className="terminal-quick-stat-card">
                <span className="terminal-quick-stat-label">สแกนออกแล้ว</span>
                <div className="terminal-quick-stat-value-row">
                  <span className="terminal-quick-stat-val" id="stats-total-exits">
                    {stats?.totalExits ?? 0}
                  </span>
                  <span className="terminal-stat-unit">ครั้ง</span>
                </div>
              </div>
            </div>
          </div>

          {/* TAB 2: ประวัติการสแกน (Full Stats & Logs - D-107) */}
          <div
            id="terminal-panel-logs"
            role="tabpanel"
            aria-labelledby="terminal-tab-logs"
            className={`terminal-tab-panel ${activeTerminalTab === 'logs' ? 'tab-panel-active' : 'tab-panel-inactive'}`}
            hidden={activeTerminalTab !== 'logs'}
            style={activeTerminalTab !== 'logs' ? { display: 'none' } : undefined}
          >
            {/* Full Statistics Grid (Unified 4-Metric) */}
            <section className="terminal-stats-section" aria-labelledby="stats-heading">
              <div className="stats-header">
                <h3 id="stats-heading" className="text-sm font-semibold">
                  สถิติการรับเข้างานของรอบนี้
                </h3>
                <button
                  type="button"
                  className="refresh-icon-btn"
                  onClick={fetchStats}
                  title="รีเฟรชสถิติ"
                  disabled={loadingStats}
                >
                  <RefreshIcon className={loadingStats ? 'spinning' : ''} />
                </button>
              </div>

              <div className="terminal-stats-grid-compact">
                <div className="terminal-quick-stat-card">
                  <span className="terminal-quick-stat-label">บัตรที่จำหน่ายได้</span>
                  <div className="terminal-quick-stat-value-row">
                    <span className="terminal-quick-stat-val" id="stats-total-tickets">
                      {stats?.totalTickets ?? (offlineDataset?.totalTickets ?? 0)}
                    </span>
                    <span className="terminal-stat-unit">ใบ</span>
                  </div>
                </div>

                <div className="terminal-quick-stat-card">
                  <span className="terminal-quick-stat-label">อยู่ในงานขณะนี้</span>
                  <div className="terminal-quick-stat-value-row">
                    <span className="terminal-quick-stat-val">{stats?.currentlyInside ?? 0}</span>
                    <span className="terminal-stat-unit">คน</span>
                  </div>
                </div>

                <div className="terminal-quick-stat-card">
                  <span className="terminal-quick-stat-label">สแกนเข้าแล้ว</span>
                  <div className="terminal-quick-stat-value-row">
                    <span className="terminal-quick-stat-val">{stats?.totalEntries ?? 0}</span>
                    <span className="terminal-stat-unit">ครั้ง</span>
                  </div>
                </div>

                <div className="terminal-quick-stat-card">
                  <span className="terminal-quick-stat-label">สแกนออกแล้ว</span>
                  <div className="terminal-quick-stat-value-row">
                    <span className="terminal-quick-stat-val">{stats?.totalExits ?? 0}</span>
                    <span className="terminal-stat-unit">ครั้ง</span>
                  </div>
                </div>
              </div>
            </section>

          {/* Recent Scan Activity Log */}
          <section className="terminal-logs-section" aria-labelledby="logs-heading">
            <h3 id="logs-heading" className="text-sm font-semibold mb-2">
              ประวัติการสแกนล่าสุดในรอบนี้ (ไม่มีข้อมูลส่วนตัวผู้ซื้อ)
            </h3>
            {recentLogs.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">ยังไม่มีประวัติการสแกนในรอบนี้</p>
            ) : (
              <div className="table-responsive">
                <table className="logs-table" id="admission-logs-table">
                  <thead>
                    <tr>
                      <th>เวลา</th>
                      <th>รหัสบัตร</th>
                      <th>การดำเนินการ</th>
                      <th>ผลการสแกน</th>
                      <th>สาเหตุ / หมายเหตุ</th>
                      <th>ผู้สแกน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.map(log => (
                      <tr key={log.id} className={log.status === 'success' ? 'log-success' : 'log-rejected'}>
                        <td className="font-mono text-xs whitespace-nowrap">
                          <span className="log-time-cell">
                            <ClockIcon width={14} height={14} />
                            <span>{formatTime(new Date(log.createdAt))}</span>
                          </span>
                        </td>
                        <td className="font-mono text-xs font-semibold">{log.ticketCode}</td>
                        <td>
                          <span className={`mini-badge ${log.action === 'entry' ? 'badge-entry' : 'badge-exit'}`}>
                            {log.action === 'entry' ? 'เข้า' : 'ออก'}
                          </span>
                        </td>
                        <td>
                          <span className={`mini-badge ${log.status === 'success' ? 'badge-success' : 'badge-danger'}`}>
                            {log.status === 'success' ? 'สำเร็จ' : 'ปฏิเสธ'}
                          </span>
                        </td>
                        <td className="text-xs text-slate-600">{log.reason || '-'}</td>
                        <td className="text-xs text-slate-600">{log.scannerName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* TAB 3: จัดการระบบออฟไลน์ (Offline Mode & Dataset - D-106) */}
        <div
          id="terminal-panel-offline"
          role="tabpanel"
          aria-labelledby="terminal-tab-offline"
          className={`terminal-tab-panel ${activeTerminalTab === 'offline' ? 'tab-panel-active' : 'tab-panel-inactive'}`}
          hidden={activeTerminalTab !== 'offline'}
          style={activeTerminalTab !== 'offline' ? { display: 'none' } : undefined}
        >
          <section
            className="offline-dataset-panel"
            data-testid="offline-dataset-panel"
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '20px',
            }}
            aria-label="การเตรียมชุดข้อมูลออฟไลน์"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '15px', color: '#0f172a' }}>ชุดข้อมูลออฟไลน์ประจำงาน:</strong>
                  <span
                    data-testid="offline-dataset-status-badge"
                    className={`status-badge ${offlineDataset ? 'approved' : 'pending'}`}
                    style={{ fontSize: '12px' }}
                  >
                    {offlineDataset ? `พร้อมใช้งาน (${offlineDataset.totalTickets ?? 0} ใบ)` : 'ยังไม่มีข้อมูลในเครื่อง'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span>
                    สถานะการเชื่อมต่อ:{' '}
                    <strong data-testid="connectivity-status-text">
                      {isOfflineMode ? 'ออฟไลน์ (Offline Mode)' : 'ออนไลน์ (Online Central)'}
                    </strong>
                  </span>
                  <span>
                    ซิงก์สำเร็จล่าสุด:{' '}
                    <strong data-testid="last-successful-sync-time">
                      {offlineDataset?.lastSuccessfulSync
                        ? new Date(offlineDataset.lastSuccessfulSync).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
                        : 'ยังไม่เคยซิงก์'}
                    </strong>
                  </span>
                  <span>
                    จำนวนบัตรที่เก็บในเครื่อง:{' '}
                    <strong data-testid="cached-tickets-count">
                      {offlineDataset?.totalTickets ?? 0} ใบ
                    </strong>
                  </span>
                  <span data-testid="pending-sync-indicator">
                    รายการรอซิงก์สู่ระบบกลาง:{' '}
                    <strong data-testid="pending-sync-count">
                      {pendingSyncCount}
                    </strong>{' '}
                    รายการ
                  </span>
                </div>
                <p
                  data-testid="offline-privacy-guarantee"
                  style={{ margin: '6px 0 0', fontSize: '11px', color: '#059669' }}
                >
                  * ข้อมูลออฟไลน์ได้รับการคัดกรองข้อมูลระบุตัวตนผู้ซื้อ (Buyer PII) ออกทั้งหมด
                </p>
              </div>

              <div className="offline-actions-row">
                <button
                  type="button"
                  id="toggle-offline-mode-btn"
                  data-testid="toggle-offline-mode-btn"
                  className="secondary-button terminal-action-btn"
                  onClick={handleToggleOfflineMode}
                >
                  {isOfflineMode ? 'สลับเป็นโหมดออนไลน์' : 'สลับเป็นโหมดออฟไลน์'}
                </button>

                <button
                  type="button"
                  id="download-offline-dataset-btn"
                  data-testid="download-offline-dataset-btn"
                  className="secondary-button terminal-action-btn"
                  onClick={handleDownloadOfflineDataset}
                  disabled={syncingDataset || isSyncingPending}
                >
                  {syncingDataset ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลดข้อมูลออฟไลน์'}
                </button>

                <button
                  type="button"
                  id="sync-offline-pending-btn"
                  data-testid="sync-offline-pending-btn"
                  className="secondary-button terminal-action-btn"
                  onClick={handleSyncPendingScans}
                  disabled={isSyncingPending || pendingSyncCount === 0 || isOfflineMode}
                >
                  {isSyncingPending
                    ? syncProgress
                      ? `กำลังซิงก์ (${syncProgress.syncedSoFar}/${syncProgress.total})...`
                      : 'กำลังซิงก์...'
                    : `ซิงก์ข้อมูลค้าง (${pendingSyncCount} รายการ)`}
                </button>

                <button
                  type="button"
                  id="export-offline-backup-btn"
                  data-testid="export-offline-backup-btn"
                  className="secondary-button terminal-action-btn"
                  onClick={handleExportOfflineBackup}
                  disabled={syncingDataset || isSyncingPending}
                >
                  สำรองข้อมูล (.json)
                </button>

                <button
                  type="button"
                  id="import-offline-backup-btn"
                  data-testid="import-offline-backup-btn"
                  className="secondary-button terminal-action-btn"
                  onClick={() => backupFileInputRef.current?.click()}
                  disabled={syncingDataset || isSyncingPending}
                >
                  กู้คืนไฟล์สำรอง (.json)
                </button>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportOfflineBackup}
                  style={{ display: 'none' }}
                  aria-label="เลือกไฟล์สำรองข้อมูลออฟไลน์"
                />
              </div>
            </div>

            {isOfflineMode && isPrimary && (
              <div
                data-testid="primary-offline-operational-notice"
                className="status-banner warning"
                style={{ marginTop: '10px', fontSize: '13px' }}
                role="note"
              >
                <strong>ข้อปฏิบัติการทำงานออฟไลน์:</strong> เครื่องนี้ทำงานเป็นเครื่องหลักเพียงเครื่องเดียวของทั้งงาน กรุณาหยุดการใช้งานเครื่องสแกนอื่นทั้งหมดเพื่อป้องกันข้อมูลไม่ตรงกัน
              </div>
            )}

            {nonPrimaryOfflineWarning && (
              <div
                data-testid="non-primary-offline-warning"
                className="status-banner error"
                style={{ marginTop: '10px', fontSize: '13px' }}
                role="alert"
              >
                <span>{nonPrimaryOfflineWarning}</span>
              </div>
            )}

            {syncFeedback && (
              <div
                className={`status-banner ${syncFeedback.type}`}
                style={{ marginTop: '10px', fontSize: '13px' }}
                role="status"
              >
                <span>{syncFeedback.message}</span>
              </div>
            )}
          </section>

          <section
            className="offline-guide-card"
            data-testid="offline-usage-guide"
            aria-labelledby="offline-guide-heading"
          >
            <h3 id="offline-guide-heading" className="offline-guide-title">
              คู่มือการใช้งานระบบออฟไลน์
            </h3>
            <ol className="offline-guide-steps">
              <li>
                <strong>เตรียมข้อมูลก่อนเริ่มงาน (ขณะมีอินเทอร์เน็ต):</strong>{' '}
                กดปุ่ม &ldquo;ดาวน์โหลดข้อมูลออฟไลน์&rdquo; เพื่อบันทึกรหัสบัตรลงเครื่อง (ไม่มีข้อมูลส่วนตัวผู้ซื้อ) และแนะนำให้กด &ldquo;สำรองข้อมูล (.json)&rdquo; เก็บไว้สำรอง
              </li>
              <li>
                <strong>ใช้งานเฉพาะเครื่องหลักเมื่อเน็ตขัดข้อง:</strong>{' '}
                กด &ldquo;สลับเป็นโหมดออฟไลน์&rdquo; เฉพาะบนเครื่องหลักเพียงเครื่องเดียว และหยุดสแกนบนเครื่องอื่นทั้งหมด เพื่อป้องกันบัตรถูกสแกนซ้ำข้ามเครื่อง
              </li>
              <li>
                <strong>สแกนบัตรตามปกติระหว่างออฟไลน์:</strong>{' '}
                รายการเข้าและออกจะถูกบันทึกไว้ในเครื่องและแสดงจำนวนที่ &ldquo;รอซิงก์&rdquo;
              </li>
              <li>
                <strong>ซิงก์ข้อมูลกลับสู่ระบบกลาง:</strong>{' '}
                เมื่ออินเทอร์เน็ตกลับมา ให้กด &ldquo;สลับเป็นโหมดออนไลน์&rdquo; แล้วกด &ldquo;ซิงก์ข้อมูลค้าง&rdquo; จนกว่าจำนวนรอซิงก์จะเป็น 0 รายการ
              </li>
              <li>
                <strong>กรณีย้ายเครื่องหรือล้างข้อมูลเบราว์เซอร์:</strong>{' '}
                ใช้ปุ่ม &ldquo;กู้คืนไฟล์สำรอง (.json)&rdquo; เพื่อนำข้อมูลที่สำรองไว้กลับมาใช้งานต่อได้ทันที
              </li>
            </ol>
          </section>
        </div>

        {/* Scan Result Modal with Pause & "สแกนคนถัดไป" (D-107) */}
        {scanResult && (
          <div
            className="terminal-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-result-message"
            tabIndex={-1}
            onKeyDown={e => {
              if (e.key === 'Escape') setScanResult(null);
            }}
            onClick={e => {
              if (e.target === e.currentTarget) setScanResult(null);
            }}
          >
            <div
              id="scan-result-card"
              className={`terminal-modal-content scan-result-card ${
                scanResult.status === 'success'
                  ? (scanResult.action === 'entry' ? 'result-success-entry' : 'result-success-exit')
                  : 'result-rejected'
              }`}
            >
              <div className="result-header">
                <div
                  className={`result-icon-badge ${
                    scanResult.status === 'success'
                      ? (scanResult.action === 'entry' ? 'is-entry' : 'is-exit')
                      : 'is-rejected'
                  }`}
                >
                  {scanResult.status === 'success' ? (
                    <CheckCircleIcon width={26} height={26} />
                  ) : (
                    <CrossCircleIcon width={26} height={26} />
                  )}
                </div>
                <div className="result-headline">
                  <span className="result-badge-text">
                    {scanResult.status === 'success'
                      ? (scanResult.action === 'entry' ? 'ผ่าน / บันทึกเข้างาน' : 'ผ่าน / บันทึกออกนอกงาน')
                      : 'ไม่ผ่าน / ปฏิเสธการสแกน'}
                  </span>
                  <h3 id="scan-result-message" className="result-message">
                    {scanResult.message}
                  </h3>
                </div>
              </div>

              {/* Non-PII Ticket Details (AC-65) */}
              {scanResult.ticket && (
                <div className="result-details" id="scanned-ticket-details">
                  <dl className="details-grid">
                    <div>
                      <dt>รหัสบัตร</dt>
                      <dd id="scanned-ticket-code" className="font-mono font-bold">
                        {scanResult.ticket.ticketCode}
                      </dd>
                    </div>
                    <div>
                      <dt>ประเภทบัตร</dt>
                      <dd id="scanned-ticket-type">{scanResult.ticket.ticketTypeName}</dd>
                    </div>
                    <div>
                      <dt>สถานะในพื้นที่จัดงาน</dt>
                      <dd
                        id="scanned-ticket-admission-status"
                        className={`status-pill ${scanResult.ticket.admissionStatus === 'inside' ? 'pill-inside' : 'pill-outside'}`}
                      >
                        {scanResult.ticket.admissionStatus === 'inside' ? 'อยู่ในพื้นที่จัดงาน' : 'อยู่นอกพื้นที่จัดงาน'}
                      </dd>
                    </div>
                    <div>
                      <dt>เวลาที่สแกน</dt>
                      <dd className="font-mono text-sm">{formatTime(new Date(scanResult.ticket.scannedAt))}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Modal Action Controls */}
              <div className="terminal-modal-actions">
                <button
                  type="button"
                  id="scan-next-btn"
                  data-testid="scan-next-btn"
                  className="secondary-button scan-next-modal-btn"
                  onClick={() => {
                    setScanResult(null);
                    setCameraActive(true);
                  }}
                >
                  <QrCodeIcon width={18} height={18} />
                  <span>สแกนคนถัดไป</span>
                </button>
                <button
                  type="button"
                  id="dismiss-scan-modal-btn"
                  data-testid="dismiss-scan-modal-btn"
                  className="secondary-button dismiss-scan-modal-btn"
                  onClick={() => setScanResult(null)}
                >
                  ปิด / ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
}
