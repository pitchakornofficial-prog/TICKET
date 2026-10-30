'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckCircleIcon,
  CrossCircleIcon,
  RefreshIcon,
  ClockIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  CameraIcon,
  CameraOffIcon,
} from './icons';
import { formatTime } from '@/lib/locale';
import {
  performOfflineAdmissionScan,
  getOfflinePendingScans,
  getOfflineDatasetKey,
  syncPendingOfflineScans,
} from '@/lib/offline-admission';

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
  const [ticketInput, setTicketInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [stats, setStats] = useState<AdmissionStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AdmissionLogItem[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [activeTerminalTab, setActiveTerminalTab] = useState<'scan' | 'logs' | 'offline'>('scan');

  // Connectivity & Offline mode state (AC-40, AC-42, AC-96, AC-103)
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [nonPrimaryOfflineWarning, setNonPrimaryOfflineWarning] = useState<string | null>(null);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  // Offline dataset state (AC-94, AC-65, NQ-06)
  const [offlineDataset, setOfflineDataset] = useState<{
    lastSuccessfulSync?: string;
    totalTickets?: number;
    primaryScanner?: { scannerName: string } | null;
    isOfflineHalted?: boolean;
    offlineStatus?: 'active' | 'halted_reconciliation_required';
  } | null>(null);
  const [syncingDataset, setSyncingDataset] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(getOfflineDatasetKey(eventId));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.lastSuccessfulSync && typeof parsed.totalTickets === 'number') {
          setOfflineDataset(parsed);
        }
      }
      const pending = getOfflinePendingScans(eventId);
      setPendingSyncCount(pending.length);
    } catch {
      // Ignored
    }
  }, [eventId]);

  async function handleDownloadOfflineDataset() {
    setSyncingDataset(true);
    setSyncFeedback(null);
    try {
      const res = await fetch(`/api/scanner/events/${eventId}/offline-dataset`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setSyncFeedback({ type: 'error', message: data.message || 'ไม่สามารถดาวน์โหลดชุดข้อมูลออฟไลน์ได้' });
      } else {
        localStorage.setItem(getOfflineDatasetKey(eventId), JSON.stringify(data));
        setOfflineDataset(data);
        const pending = getOfflinePendingScans(eventId);
        setPendingSyncCount(pending.length);
        setSyncFeedback({
          type: 'success',
          message: `ดาวน์โหลดชุดข้อมูลออฟไลน์สำเร็จเรียบร้อย (${data.totalTickets} ใบ — AC-94)`,
        });
      }
    } catch {
      setSyncFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อดาวน์โหลดชุดข้อมูล' });
    } finally {
      setSyncingDataset(false);
    }
  }

  function handleToggleOfflineMode() {
    if (isOfflineMode) {
      // Switch back to online
      setIsOfflineMode(false);
      setNonPrimaryOfflineWarning(null);
      fetchStats();
    } else {
      // Trying to switch to offline mode (AC-40, O1)
      if (!isPrimary) {
        setNonPrimaryOfflineWarning(
          'เครื่องนี้เป็นเครื่องรองตาม O1 หากต้องการสแกนออฟไลน์ ต้องให้ผู้จัดงานกำหนดเป็นเครื่องหลักและหยุดเครื่องอื่นในงาน',
        );
        return;
      }

      if (offlineDataset?.isOfflineHalted || offlineDataset?.offlineStatus === 'halted_reconciliation_required') {
        setSyncFeedback({
          type: 'error',
          message: 'การใช้งานโหมดออฟไลน์ถูกระงับเพื่อกระทบยอด (AC-98, NQ-06): กรุณารอเจ้าของเว็บและผู้จัดงานตรวจสอบกระทบยอดให้เสร็จสิ้น',
        });
        return;
      }

      const stored = localStorage.getItem(getOfflineDatasetKey(eventId));
      if (!stored) {
        setSyncFeedback({
          type: 'error',
          message: 'กรุณาดาวน์โหลดชุดข้อมูลออฟไลน์ก่อนเริ่มใช้งานโหมดออฟไลน์ (AC-94)',
        });
        return;
      }

      setIsOfflineMode(true);
      setNonPrimaryOfflineWarning(null);
      setSyncFeedback(null);
    }
  }

  async function handleSyncPendingScans() {
    if (isOfflineMode) {
      setSyncFeedback({
        type: 'error',
        message: 'กรุณาสลับกลับเป็นโหมดออนไลน์ก่อนทำการซิงก์ข้อมูลสู่ระบบกลาง (AC-102)',
      });
      return;
    }
    setIsSyncingPending(true);
    setSyncFeedback(null);
    try {
      const res = await syncPendingOfflineScans(eventId);
      if (res.success) {
        setPendingSyncCount(res.remainingCount);
        if (res.lastSuccessfulSync) {
          setOfflineDataset(prev =>
            prev ? { ...prev, lastSuccessfulSync: res.lastSuccessfulSync } : prev,
          );
        }
        setSyncFeedback({
          type: res.conflictsCount > 0 ? 'error' : 'success',
          message: res.message || 'ซิงก์ข้อมูลค้างสำเร็จ',
        });
        fetchStats();
      } else {
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

  async function handleScanSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!ticketInput.trim() || loading) return;

    if (isOfflineMode) {
      setLoading(true);
      try {
        const offResult = performOfflineAdmissionScan({
          eventId,
          sessionId,
          scannerId: scannerId || 'scanner',
          scannerName: scannerName || (isPrimary ? 'เครื่องหลัก' : 'เครื่องสแกน'),
          isPrimary,
          qrPayloadOrCode: ticketInput.trim(),
          action,
        });

        setScanResult(offResult);
        if (typeof offResult.pendingCount === 'number') {
          setPendingSyncCount(offResult.pendingCount);
        }

        const newLog: AdmissionLogItem = {
          id: `off-${Date.now()}`,
          ticketId: offResult.ticket?.ticketId || '',
          ticketCode: offResult.ticket?.ticketCode || ticketInput.trim(),
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
        setTicketInput('');
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
          qrPayloadOrCode: ticketInput.trim(),
          action,
        }),
      });

      const data = await res.json();
      if (res.ok && data.result) {
        setScanResult(data.result);
      } else {
        setScanResult({
          success: false,
          status: 'rejected',
          action,
          reason: data.error || 'ERROR',
          message: data.message || 'เกิดข้อผิดพลาดในการตรวจสอบบัตร',
        });
      }
      setTicketInput('');
      fetchStats();
    } catch {
      setScanResult({
        success: false,
        status: 'rejected',
        action,
        reason: 'NETWORK_ERROR',
        message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="terminal-centered-wrapper">
      <div className="terminal-wrapper" id="admission-terminal-root">
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
                <span>{isOfflineMode ? 'ออฟไลน์ (Offline)' : 'ออนไลน์ (Online)'}</span>
              </span>

              {isPrimary ? (
                <span className="scanner-badge badge-primary-offline" data-testid="terminal-primary-badge">
                  <ShieldCheckIcon width={12} height={12} />
                  <span>เครื่องหลักออฟไลน์</span>
                  <span className="sr-only"> เครื่องหลักประจำงาน (Primary Device — AC-94)</span>
                </span>
              ) : (
                <span
                  className="scanner-badge badge-standard-online"
                  data-testid="terminal-secondary-badge"
                >
                  <span>เครื่องรอง (เครื่องหลัก: {primaryScannerName || 'ยังไม่กำหนด'})</span>
                </span>
              )}

              {pendingSyncCount > 0 && (
                <span className="scanner-pending-pill" data-testid="pending-sync-indicator">
                  รอซิงก์ <strong data-testid="pending-sync-count">{pendingSyncCount}</strong> รายการ
                </span>
              )}
            </div>

            <div className="terminal-top-actions">
              {(actorRole === 'organizer' || actorRole === 'owner') && (
                <Link
                  href="/back-office/organizer?section=scanners"
                  className="secondary-button mini-btn"
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
                  className="secondary-button mini-btn"
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
        <div className="terminal-sub-tabs-bar" role="tablist" aria-label="แท็บเมนูเครื่องตรวจบัตร">
          <button
            type="button"
            role="tab"
            id="terminal-tab-scan"
            data-testid="terminal-tab-scan"
            aria-selected={activeTerminalTab === 'scan'}
            aria-controls="terminal-panel-scan"
            className={`terminal-tab-btn ${activeTerminalTab === 'scan' ? 'active' : ''}`}
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
            onClick={() => setActiveTerminalTab('offline')}
            style={!isPrimary ? { display: 'none' } : undefined}
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
            </div>

            {/* Camera Viewfinder (Auto-Active by Default) */}
            {cameraActive && (
              <div className="camera-viewfinder" id="camera-viewfinder">
                <div className="viewfinder-frame">
                  <div className="viewfinder-laser" />
                  <p className="viewfinder-hint">นำ QR Code บัตรมาส่องในกรอบเพื่อสแกนอัตโนมัติ</p>
                </div>
              </div>
            )}

            {/* Manual Input Section */}
            <div className="terminal-scan-section">
              <form onSubmit={handleScanSubmit} className="scan-input-form">
                <label htmlFor="scanner-ticket-input" className="form-label">
                  {action === 'entry' ? 'หรือพิมพ์/วางรหัสบัตรเพื่อบันทึกเข้างาน:' : 'หรือพิมพ์/วางรหัสบัตรเพื่อบันทึกออกนอกงาน:'}
                </label>
                <div className="scan-input-group">
                  <input
                    id="scanner-ticket-input"
                    type="text"
                    className="text-input font-mono"
                    placeholder="วางรหัสบัตร เช่น TK-..., TKT-..."
                    value={ticketInput}
                    onChange={e => setTicketInput(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    id="scanner-submit-btn"
                    className="button button-primary terminal-submit-btn"
                    disabled={loading || !ticketInput.trim()}
                  >
                    {loading ? 'กำลังตรวจ...' : action === 'entry' ? 'บันทึกเข้างาน' : 'บันทึกออก'}
                  </button>
                </div>
              </form>
            </div>

            {/* Unified 4-Metric Quick Stats in Tab 1 (D-107) */}
            <div className="terminal-quick-stats-grid">
              <div className="terminal-quick-stat-card">
                <span className="terminal-quick-stat-label">บัตรที่ขายได้</span>
                <span className="terminal-quick-stat-val" id="stats-tab1-total-tickets">
                  {stats?.totalTickets ?? (offlineDataset?.totalTickets ?? 0)}
                </span>
                <span className="stat-unit" style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '3px' }}>ใบ</span>
              </div>
              <div className="terminal-quick-stat-card">
                <span className="terminal-quick-stat-label">อยู่ในงานขณะนี้</span>
                <span className="terminal-quick-stat-val" id="stats-currently-inside">
                  {stats?.currentlyInside ?? 0}
                </span>
                <span className="stat-unit" style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '3px' }}>คน</span>
              </div>
              <div className="terminal-quick-stat-card">
                <span className="terminal-quick-stat-label">สแกนเข้าแล้ว</span>
                <span className="terminal-quick-stat-val" id="stats-total-entries">
                  {stats?.totalEntries ?? 0}
                </span>
                <span className="stat-unit" style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '3px' }}>ครั้ง</span>
              </div>
              <div className="terminal-quick-stat-card">
                <span className="terminal-quick-stat-label">สแกนออกแล้ว</span>
                <span className="terminal-quick-stat-val" id="stats-total-exits">
                  {stats?.totalExits ?? 0}
                </span>
                <span className="stat-unit" style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '3px' }}>ครั้ง</span>
              </div>
            </div>
          </div>

          {/* TAB 2: ประวัติการสแกน (Full Stats & Logs - D-107) */}
          <div
            id="terminal-panel-logs"
            role="tabpanel"
            aria-labelledby="terminal-tab-logs"
            className={`terminal-tab-panel ${activeTerminalTab === 'logs' ? 'tab-panel-active' : 'tab-panel-inactive'}`}
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

              <div className="stats-grid">
                <div className="stat-card stat-total">
                  <span className="stat-label">บัตรที่จำหน่ายได้</span>
                  <span className="stat-value" id="stats-total-tickets">
                    {stats?.totalTickets ?? (offlineDataset?.totalTickets ?? 0)}
                  </span>
                  <span className="stat-unit">ใบ</span>
                </div>

                <div className="stat-card stat-inside">
                  <span className="stat-label">อยู่ในงานขณะนี้</span>
                  <span className="stat-value">{stats?.currentlyInside ?? 0}</span>
                  <span className="stat-unit">คน</span>
                </div>

                <div className="stat-card stat-entries">
                  <span className="stat-label">สแกนเข้าแล้ว</span>
                  <span className="stat-value">{stats?.totalEntries ?? 0}</span>
                  <span className="stat-unit">ครั้ง</span>
                </div>

                <div className="stat-card stat-exits">
                  <span className="stat-label">สแกนออกแล้ว</span>
                  <span className="stat-value">{stats?.totalExits ?? 0}</span>
                  <span className="stat-unit">ครั้ง</span>
                </div>
              </div>
            </section>

          {/* Recent Scan Activity Log */}
          <section className="terminal-logs-section" aria-labelledby="logs-heading">
            <h3 id="logs-heading" className="text-sm font-semibold mb-2">
              ประวัติการสแกนล่าสุดในรอบนี้ (AC-65: ไม่มีข้อมูลส่วนตัวผู้ซื้อ)
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
                          <ClockIcon className="inline-icon" />
                          {formatTime(new Date(log.createdAt))}
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
                      {isOfflineMode ? 'ออฟไลน์ (Offline Mode — AC-40)' : 'ออนไลน์ (Online Central)'}
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
                  * ข้อมูลออฟไลน์ได้รับการคัดกรองข้อมูลระบุตัวตนผู้ซื้อ (Buyer PII) ออกทั้งหมดตาม AC-65
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
                  {isOfflineMode ? 'สลับเป็นโหมดออนไลน์ (Switch to Online)' : 'สลับเป็นโหมดออฟไลน์ (Offline Mode — AC-40)'}
                </button>

                <button
                  type="button"
                  id="download-offline-dataset-btn"
                  data-testid="download-offline-dataset-btn"
                  className="secondary-button terminal-action-btn"
                  onClick={handleDownloadOfflineDataset}
                  disabled={syncingDataset || isSyncingPending}
                >
                  {syncingDataset ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลดชุดข้อมูลออฟไลน์ (Download Offline Dataset — AC-94)'}
                </button>

                <button
                  type="button"
                  id="sync-offline-pending-btn"
                  data-testid="sync-offline-pending-btn"
                  className="button button-primary terminal-action-btn"
                  onClick={handleSyncPendingScans}
                  disabled={isSyncingPending || pendingSyncCount === 0 || isOfflineMode}
                >
                  {isSyncingPending
                    ? 'กำลังซิงก์...'
                    : `ซิงก์ข้อมูลค้าง (${pendingSyncCount} รายการ — AC-102)`}
                </button>
              </div>
            </div>

            {isOfflineMode && isPrimary && (
              <div
                data-testid="primary-offline-operational-notice"
                className="status-banner warning"
                style={{ marginTop: '10px', fontSize: '13px' }}
                role="note"
              >
                <strong>ข้อปฏิบัติการทำงานออฟไลน์ (O1):</strong> เครื่องนี้ทำงานเป็นเครื่องหลักเพียงเครื่องเดียวของทั้งงาน กรุณาหยุดการใช้งานเครื่องสแกนอื่นทั้งหมดเพื่อป้องกันข้อมูลไม่ตรงกัน
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
                {scanResult.status === 'success' ? (
                  <CheckCircleIcon className="result-icon-success" width={44} height={44} />
                ) : (
                  <CrossCircleIcon className="result-icon-rejected" width={44} height={44} />
                )}
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
                  className="button button-primary scan-next-modal-btn"
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
                  className="secondary-button"
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
