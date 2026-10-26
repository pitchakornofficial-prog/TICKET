'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TicketIcon } from './ticket-icon';
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  UsersIcon,
  UserPlusIcon,
  ClockIcon,
  SearchIcon,
  SlidersIcon,
  InfoIcon,
} from './icons';

interface OrganizerEvent {
  id: string;
  title: string;
  status: string;
}

interface ScannerItem {
  id: string;
  scannerId: string;
  name: string;
  email: string;
  assignedAt: string;
  isPrimary?: boolean;
}

interface EventOfflineControl {
  eventId: string;
  offlineStatus: 'active' | 'halted_reconciliation_required';
  haltReason?: string | null;
  haltDetails?: string | null;
  haltedAt?: string | null;
  haltedBy?: string | null;
  resumedAt?: string | null;
  resumedBy?: string | null;
  updatedAt: string;
}

interface HandoverHistoryItem {
  id: string;
  eventId: string;
  oldScannerId?: string | null;
  oldScannerName?: string | null;
  newScannerId?: string | null;
  newScannerName?: string | null;
  action: 'HANDOVER' | 'EMERGENCY_STOP' | 'RESUME_RECONCILIATION';
  oldScannerPendingCount: number;
  newScannerSyncedAt?: string | null;
  reason?: string | null;
  actorName: string;
  createdAt: string;
}

type ScannerSubTab = 'manage' | 'create' | 'history';

export function OrganizerScannerManager() {
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [scanners, setScanners] = useState<ScannerItem[]>([]);
  const [offlineControl, setOfflineControl] = useState<EventOfflineControl | null>(null);
  const [handovers, setHandovers] = useState<HandoverHistoryItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingScanners, setLoadingScanners] = useState(false);

  // Sub-tabs navigation state (D-67)
  const [activeSubTab, setActiveSubTab] = useState<ScannerSubTab>('manage');
  const [hasUserManuallySwitchedTab, setHasUserManuallySwitchedTab] = useState(false);

  // Search & Filter states (D-67)
  const [searchScanner, setSearchScanner] = useState('');
  const [scannerStatusFilter, setScannerStatusFilter] = useState<'all' | 'primary' | 'standard'>('all');
  const [searchHistory, setSearchHistory] = useState('');
  const [historyActionFilter, setHistoryActionFilter] = useState<'all' | 'HANDOVER' | 'EMERGENCY_STOP' | 'RESUME_RECONCILIATION'>('all');

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Handover modal state
  const [handoverTarget, setHandoverTarget] = useState<ScannerItem | null>(null);
  const [declaredOldPending, setDeclaredOldPending] = useState<number>(0);
  const [handoverReason, setHandoverReason] = useState<string>('');
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [readinessResult, setReadinessResult] = useState<{ ready: boolean; reasons: string[] } | null>(null);

  // Emergency Stop modal state
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('DEVICE_DAMAGED_RECONCILIATION_REQUIRED');
  const [emergencyDetails, setEmergencyDetails] = useState('');
  const [lostPendingCount, setLostPendingCount] = useState<number>(0);

  // Load organizer's events
  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        const list: OrganizerEvent[] = data.events || [];
        setEvents(list);
        setSelectedEventId(prev => (prev && list.some(e => e.id === prev) ? prev : (list[0]?.id || '')));
      }
    } catch {
      setError('ไม่สามารถโหลดข้อมูลงานคอนเสิร์ตได้');
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();

    function onEventsUpdated() {
      loadEvents();
    }
    window.addEventListener('events-updated', onEventsUpdated);
    return () => {
      window.removeEventListener('events-updated', onEventsUpdated);
    };
  }, [loadEvents]);

  // Load scanners and offline status for selected event
  const loadEventData = useCallback(async (eventId: string) => {
    if (!eventId) {
      setScanners([]);
      setOfflineControl(null);
      setHandovers([]);
      return;
    }
    setLoadingScanners(true);
    try {
      const [scRes, ctrlRes] = await Promise.all([
        fetch(`/api/organizer/events/${eventId}/scanners`),
        fetch(`/api/organizer/events/${eventId}/primary-scanner/offline-status`),
      ]);

      if (scRes.ok) {
        const data = await scRes.json();
        const scList: ScannerItem[] = data.scanners || [];
        setScanners(scList);

        // If no scanners exist and user hasn't explicitly clicked a tab, default to 'create' tab (E2E test alignment)
        if (scList.length === 0 && !hasUserManuallySwitchedTab) {
          setActiveSubTab('create');
        } else if (scList.length > 0 && !hasUserManuallySwitchedTab) {
          setActiveSubTab('manage');
        }
      }
      if (ctrlRes.ok) {
        const data = await ctrlRes.json();
        setOfflineControl(data.control || null);
        setHandovers(data.handovers || []);
      }
    } catch {
      setError('ไม่สามารถโหลดข้อมูลทีมสแกนได้');
    } finally {
      setLoadingScanners(false);
    }
  }, [hasUserManuallySwitchedTab]);

  useEffect(() => {
    if (selectedEventId) {
      loadEventData(selectedEventId);
    } else {
      setScanners([]);
      setOfflineControl(null);
      setHandovers([]);
    }
  }, [selectedEventId, loadEventData]);

  // Filtered lists
  const filteredScanners = useMemo(() => {
    return scanners.filter(s => {
      const matchSearch =
        !searchScanner.trim() ||
        s.name.toLowerCase().includes(searchScanner.toLowerCase()) ||
        s.email.toLowerCase().includes(searchScanner.toLowerCase());
      const matchStatus =
        scannerStatusFilter === 'all' ||
        (scannerStatusFilter === 'primary' && s.isPrimary) ||
        (scannerStatusFilter === 'standard' && !s.isPrimary);
      return matchSearch && matchStatus;
    });
  }, [scanners, searchScanner, scannerStatusFilter]);

  const filteredHandovers = useMemo(() => {
    return handovers.filter(h => {
      const matchSearch =
        !searchHistory.trim() ||
        (h.reason?.toLowerCase().includes(searchHistory.toLowerCase()) ?? false) ||
        h.actorName.toLowerCase().includes(searchHistory.toLowerCase()) ||
        (h.oldScannerName?.toLowerCase().includes(searchHistory.toLowerCase()) ?? false) ||
        (h.newScannerName?.toLowerCase().includes(searchHistory.toLowerCase()) ?? false);
      const matchAction = historyActionFilter === 'all' || h.action === historyActionFilter;
      return matchSearch && matchAction;
    });
  }, [handovers, searchHistory, historyActionFilter]);

  async function handleAddScanner(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!selectedEventId) {
      setError('กรุณาเลือกงานคอนเสิร์ต');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/organizer/events/${selectedEventId}/scanners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'ทีมสแกน',
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'เพิ่มทีมสแกนไม่สำเร็จ');
      } else {
        setMessage('เพิ่มทีมสแกนสำหรับงานคอนเสิร์ตเรียบร้อยแล้ว');
        setName('');
        setEmail('');
        setPassword('');
        // Switch to manage tab so user and E2E tests see the newly created account immediately
        setActiveSubTab('manage');
        setHasUserManuallySwitchedTab(true);
        loadEventData(selectedEventId);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเพิ่มทีมสแกน');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveScanner(scannerId: string) {
    if (!confirm('ยืนยันที่จะนำทีมสแกนนี้ออกจากงานหรือไม่?')) return;
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/organizer/events/${selectedEventId}/scanners/${scannerId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'นำทีมสแกนออกไม่สำเร็จ');
      } else {
        setMessage('นำทีมสแกนออกจากงานเรียบร้อยแล้ว');
        loadEventData(selectedEventId);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการลบ');
    }
  }

  async function handleSetPrimary(scannerId: string) {
    setError('');
    setMessage('');
    setSettingPrimaryId(scannerId);
    try {
      const res = await fetch(`/api/organizer/events/${selectedEventId}/primary-scanner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scannerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'กำหนดเครื่องหลักไม่สำเร็จ');
      } else {
        setMessage('กำหนดเครื่องหลักสำหรับงานเรียบร้อยแล้ว (AC-94)');
        loadEventData(selectedEventId);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการกำหนดเครื่องหลัก');
    } finally {
      setSettingPrimaryId(null);
    }
  }

  // Pre-check handover readiness
  async function handleCheckReadiness(scannerId: string) {
    setCheckingReadiness(true);
    setReadinessResult(null);
    try {
      const res = await fetch(
        `/api/organizer/events/${selectedEventId}/primary-scanner/handover?scannerId=${scannerId}&oldPendingCount=${declaredOldPending}`,
      );
      if (res.ok) {
        const data = await res.json();
        setReadinessResult(data.readiness);
      }
    } catch {
      // Ignored
    } finally {
      setCheckingReadiness(false);
    }
  }

  // Execute handover
  async function handleExecuteHandover() {
    if (!handoverTarget) return;
    setError('');
    setMessage('');
    setActionLoading(true);

    try {
      const res = await fetch(`/api/organizer/events/${selectedEventId}/primary-scanner/handover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newScannerId: handoverTarget.scannerId,
          oldScannerPendingCount: declaredOldPending,
          reason: handoverReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'สลับเครื่องหลักไม่สำเร็จ');
      } else {
        setMessage(data.message || 'สลับเครื่องหลักประจำงานสำเร็จ (AC-97)');
        setHandoverTarget(null);
        setReadinessResult(null);
        loadEventData(selectedEventId);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการสลับเครื่องหลัก');
    } finally {
      setActionLoading(false);
    }
  }

  // Emergency stop offline mode (AC-98, NQ-06)
  async function handleExecuteEmergencyStop() {
    setError('');
    setMessage('');
    setActionLoading(true);

    try {
      const res = await fetch(`/api/organizer/events/${selectedEventId}/primary-scanner/emergency-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: emergencyReason,
          details: emergencyDetails.trim() || undefined,
          lostPendingCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ระงับการใช้งานออฟไลน์ไม่สำเร็จ');
      } else {
        setMessage(data.message || 'ระงับการใช้งานสแกนออฟไลน์เพื่อเข้าสู่กระบวนการกระทบยอดเรียบร้อยแล้ว (AC-98)');
        setShowEmergencyModal(false);
        loadEventData(selectedEventId);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการระงับการใช้งานออฟไลน์');
    } finally {
      setActionLoading(false);
    }
  }

  // Resume offline mode after reconciliation
  async function handleResumeOffline() {
    if (!confirm('ยืนยันว่าเจ้าของเว็บและผู้จัดงานได้ทำการกระทบยอดการเข้างานและข้อมูลเรียบร้อยแล้ว และต้องการปลดระงับการใช้งานออฟไลน์หรือไม่?')) {
      return;
    }
    setError('');
    setMessage('');
    setActionLoading(true);

    try {
      const res = await fetch(`/api/organizer/events/${selectedEventId}/primary-scanner/resume-offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'ผู้จัดงานและเจ้าของเว็บกระทบยอดเสร็จสิ้น อนุญาตให้ตั้งเครื่องหลักใหม่ได้ตามปกติ',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ปลดระงับไม่สำเร็จ');
      } else {
        setMessage(data.message || 'กระทบยอดเสร็จสิ้น ปลดระงับและเปิดให้ตั้งเครื่องหลักใหม่เรียบร้อยแล้ว (AC-98)');
        loadEventData(selectedEventId);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการปลดระงับ');
    } finally {
      setActionLoading(false);
    }
  }

  const currentPrimaryScanner = scanners.find(s => s.isPrimary);
  const isHalted = offlineControl?.offlineStatus === 'halted_reconciliation_required';
  const selectedEventObj = events.find(e => e.id === selectedEventId);

  return (
    <section className="form-card organizer-scanner-card" aria-labelledby="organizer-scanner-heading">
      {/* Top Header & Global Event Selector */}
      <div className="scanner-workspace-header">
        <div className="scanner-workspace-title-wrap">
          <h2 id="organizer-scanner-heading">จัดการทีมสแกนบัตรเฉพาะงาน</h2>
          <p className="card-caption">
            กำหนดสิทธิ์ให้ทีมสแกนเข้าถึงเฉพาะงานคอนเสิร์ตที่เลือก พร้อมระบบตรวจสอบสิทธิ์และบันทึกประวัติการทำงาน
          </p>
        </div>

        {/* Global Event Selector Filter */}
        {events.length > 0 && (
          <div className="scanner-global-event-filter">
            <label htmlFor="select-scanner-event" className="filter-label">
              เลือกงานคอนเสิร์ตที่ต้องการจัดทีมสแกน
            </label>
            <div className="filter-select-wrap">
              <TicketIcon />
              <select
                id="select-scanner-event"
                className="text-input"
                value={selectedEventId}
                onChange={e => {
                  setSelectedEventId(e.target.value);
                  setSearchScanner('');
                  setSearchHistory('');
                }}
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.status === 'approved' ? 'อนุมัติแล้ว' : 'ฉบับร่าง'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {message && (
        <div className="status-banner success" role="status">
          <CheckCircleIcon />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="status-banner error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Emergency Halted Alert Banner (AC-98, NQ-06) */}
      {isHalted && (
        <div
          data-testid="offline-halted-banner"
          className="status-banner error"
          style={{ marginBottom: '16px', display: 'block' }}
          role="alert"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <AlertTriangleIcon />
            <strong style={{ fontSize: '15px' }}>
              การใช้งานโหมดออฟไลน์ถูกระงับเพื่อกระทบยอด (AC-98, NQ-06)
            </strong>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: '13px' }}>
            เหตุผล: {offlineControl?.haltReason === 'DEVICE_DAMAGED_RECONCILIATION_REQUIRED' ? 'เครื่องหลักชำรุด สูญหาย หรือข้อมูลสูญหาย' : (offlineControl?.haltReason || 'ระงับเพื่อกระทบยอด')}
            {offlineControl?.haltDetails ? ` — ${offlineControl.haltDetails}` : ''}
          </p>
          <div style={{ fontSize: '12px', color: '#7f1d1d', marginBottom: '10px' }}>
            <strong>ขั้นตอนการปฏิบัติงานตาม NQ-06:</strong>
            <ol style={{ margin: '4px 0 0 20px', padding: 0 }}>
              <li>หยุดการสแกนออฟไลน์ทั้งหมดในงานทันที ห้ามตั้งเครื่องใหม่ข้ามขั้นตอน</li>
              <li>เจ้าของเว็บและผู้จัดงานตรวจสอบประวัติการสแกนในระบบกลางและจำนวนผู้ชมจริง</li>
              <li>เมื่อตรวจสอบกระทบยอดเรียบร้อย ให้กดปุ่มปลดระงับด้านล่างเพื่อเปิดให้กำหนดเครื่องหลักใหม่</li>
            </ol>
          </div>
          <button
            type="button"
            id="resume-offline-btn"
            data-testid="resume-offline-btn"
            className="secondary-button small"
            onClick={handleResumeOffline}
            disabled={actionLoading}
          >
            {actionLoading ? 'กำลังปลดระงับ...' : 'ปลดระงับและเปิดให้ตั้งเครื่องหลักใหม่ (Resume after Reconciliation)'}
          </button>
        </div>
      )}

      {loadingEvents ? (
        <p className="loading-text">กำลังโหลดรายการงานคอนเสิร์ต...</p>
      ) : events.length === 0 ? (
        <div className="empty-sub-card">
          <TicketIcon />
          <p>ยังไม่มีงานคอนเสิร์ตในระบบ กรุณาสร้างงานคอนเสิร์ตด้านบนก่อนจัดทีมสแกน</p>
          <button type="button" className="secondary-button small" onClick={loadEvents}>
            รีเฟรชรายการงาน
          </button>
        </div>
      ) : (
        <>
          {/* Internal Tabs Switcher (D-67: 3 Sub-Tabs) */}
          <div className="scanner-sub-tabs" role="tablist" aria-label="แท็บจัดการทีมสแกนบัตร">
            <button
              type="button"
              role="tab"
              id="scanner-tab-manage"
              data-testid="scanner-tab-manage"
              aria-selected={activeSubTab === 'manage'}
              aria-controls="scanner-panel-manage"
              className={`scanner-sub-tab-btn ${activeSubTab === 'manage' ? 'active' : ''}`}
              onClick={() => {
                setActiveSubTab('manage');
                setHasUserManuallySwitchedTab(true);
              }}
            >
              <UsersIcon />
              <span>จัดการบัญชี</span>
              <span className="tab-count-badge">{scanners.length}</span>
            </button>

            <button
              type="button"
              role="tab"
              id="scanner-tab-create"
              data-testid="scanner-tab-create"
              aria-selected={activeSubTab === 'create'}
              aria-controls="scanner-panel-create"
              className={`scanner-sub-tab-btn ${activeSubTab === 'create' ? 'active' : ''}`}
              onClick={() => {
                setActiveSubTab('create');
                setHasUserManuallySwitchedTab(true);
              }}
            >
              <UserPlusIcon />
              <span>สร้างบัญชีใหม่</span>
            </button>

            <button
              type="button"
              role="tab"
              id="scanner-tab-history"
              data-testid="scanner-tab-history"
              aria-selected={activeSubTab === 'history'}
              aria-controls="scanner-panel-history"
              className={`scanner-sub-tab-btn ${activeSubTab === 'history' ? 'active' : ''}`}
              onClick={() => {
                setActiveSubTab('history');
                setHasUserManuallySwitchedTab(true);
              }}
            >
              <ClockIcon />
              <span>ประวัติการทำงาน</span>
              <span className="tab-count-badge">{handovers.length}</span>
            </button>
          </div>

          {/* TAB 1: MANAGE ACCOUNTS */}
          {activeSubTab === 'manage' && (
            <div
              id="scanner-panel-manage"
              role="tabpanel"
              aria-labelledby="scanner-tab-manage"
              className="scanner-tab-panel"
            >
              {/* Header & Quick Actions */}
              <div className="scanner-panel-top-row">
                <div className="scanner-panel-title-group">
                  <h3 className="scanner-panel-heading">
                    รายชื่อทีมสแกนของงานนี้ ({filteredScanners.length})
                  </h3>
                  <p className="scanner-panel-sub-caption">
                    * กำหนดเครื่องหลัก (Primary Device) ได้ 1 เครื่องทั้งงานขณะออนไลน์ (AC-94, G-41)
                    {currentPrimaryScanner ? ` — ปัจจุบันคือ: ${currentPrimaryScanner.name}` : ' — ยังไม่ได้กำหนดเครื่องหลัก'}
                  </p>
                </div>

                <div className="scanner-panel-actions-group">
                  <button
                    type="button"
                    className="primary-button small"
                    onClick={() => {
                      setActiveSubTab('create');
                      setHasUserManuallySwitchedTab(true);
                    }}
                  >
                    <UserPlusIcon />
                    <span>+ เพิ่มทีมสแกนใหม่</span>
                  </button>

                  {currentPrimaryScanner && !isHalted && (
                    <button
                      type="button"
                      id="emergency-stop-offline-btn"
                      data-testid="emergency-stop-offline-btn"
                      className="danger-button small"
                      onClick={() => setShowEmergencyModal(true)}
                    >
                      <AlertTriangleIcon />
                      <span>แจ้งเครื่องหลักชำรุด / ระงับออฟไลน์ (AC-98)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Bar for Manage Accounts */}
              <div className="scanner-filter-bar">
                <div className="scanner-search-wrap">
                  <SearchIcon />
                  <input
                    type="text"
                    className="text-input scanner-search-input"
                    placeholder="ค้นหาชื่อทีมสแกน หรืออีเมล..."
                    value={searchScanner}
                    onChange={e => setSearchScanner(e.target.value)}
                  />
                  {searchScanner && (
                    <button
                      type="button"
                      className="clear-search-btn"
                      onClick={() => setSearchScanner('')}
                      aria-label="ล้างคำค้นหา"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="scanner-filter-dropdown-wrap">
                  <SlidersIcon />
                  <select
                    className="text-input scanner-filter-select"
                    value={scannerStatusFilter}
                    onChange={e => setScannerStatusFilter(e.target.value as 'all' | 'primary' | 'standard')}
                    aria-label="กรองตามสถานะเครื่องหลัก"
                  >
                    <option value="all">สถานะทั้งหมด</option>
                    <option value="primary">เครื่องหลักประจำงาน (Primary)</option>
                    <option value="standard">ทีมสแกนทั่วไป (Standard)</option>
                  </select>
                </div>
              </div>

              {/* Data Table */}
              {loadingScanners ? (
                <p className="loading-text">กำลังโหลดรายชื่อทีมสแกน...</p>
              ) : scanners.length === 0 ? (
                <div className="empty-sub-card">
                  <TicketIcon />
                  <p>ยังไม่มีทีมสแกนสำหรับงานนี้</p>
                  <button
                    type="button"
                    className="primary-button small"
                    onClick={() => {
                      setActiveSubTab('create');
                      setHasUserManuallySwitchedTab(true);
                    }}
                  >
                    + สร้างบัญชีทีมสแกนแรกสำหรับงานนี้
                  </button>
                </div>
              ) : filteredScanners.length === 0 ? (
                <div className="empty-sub-card">
                  <SearchIcon />
                  <p>ไม่พบทีมสแกนที่ตรงกับเงื่อนไขการค้นหาหรือตัวกรอง</p>
                  <button
                    type="button"
                    className="secondary-button small"
                    onClick={() => {
                      setSearchScanner('');
                      setScannerStatusFilter('all');
                    }}
                  >
                    ล้างตัวกรองทั้งหมด
                  </button>
                </div>
              ) : (
                <div className="owner-news-table-wrap scanner-enterprise-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ชื่อทีม</th>
                        <th>อีเมล</th>
                        <th>สถานะเครื่องหลัก (AC-94, AC-97)</th>
                        <th>บทบาท</th>
                        <th>การดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredScanners.map(s => (
                        <tr key={s.id} data-testid={`scanner-row-${s.scannerId}`}>
                          <td><strong>{s.name}</strong></td>
                          <td>{s.email}</td>
                          <td>
                            {s.isPrimary ? (
                              <span
                                className="status-badge approved"
                                data-testid={`primary-scanner-badge-${s.scannerId}`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                เครื่องหลักประจำงาน (Primary — AC-94)
                              </span>
                            ) : currentPrimaryScanner ? (
                              <button
                                type="button"
                                className="secondary-button small"
                                id={`handover-primary-scanner-${s.scannerId}`}
                                data-testid={`handover-primary-scanner-${s.scannerId}`}
                                onClick={() => {
                                  setHandoverTarget(s);
                                  setDeclaredOldPending(0);
                                  setHandoverReason('');
                                  setReadinessResult(null);
                                }}
                                disabled={isHalted || settingPrimaryId === s.scannerId}
                              >
                                สลับเป็นเครื่องหลัก (Handover — AC-97)
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="secondary-button small"
                                id={`set-primary-scanner-${s.scannerId}`}
                                data-testid={`set-primary-scanner-${s.scannerId}`}
                                onClick={() => handleSetPrimary(s.scannerId)}
                                disabled={isHalted || settingPrimaryId === s.scannerId}
                              >
                                {settingPrimaryId === s.scannerId ? 'กำลังบันทึก...' : 'กำหนดเป็นเครื่องหลัก'}
                              </button>
                            )}
                          </td>
                          <td>
                            <span className="status-badge open">ทีมสแกนเฉพาะงาน</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="danger-button small"
                              onClick={() => handleRemoveScanner(s.scannerId)}
                              disabled={s.isPrimary}
                            >
                              นำออก
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE NEW SCANNER */}
          {activeSubTab === 'create' && (
            <div
              id="scanner-panel-create"
              role="tabpanel"
              aria-labelledby="scanner-tab-create"
              className="scanner-tab-panel"
            >
              <div className="scanner-create-layout">
                {/* Add Scanner Form */}
                <form onSubmit={handleAddScanner} className="scanner-add-form modern-create-card">
                  <div className="create-card-header">
                    <div className="card-badge primary">
                      <UserPlusIcon />
                      <span>สร้างบัญชี</span>
                    </div>
                    <h3 style={{ margin: 0 }}>เพิ่มทีมสแกนใหม่สำหรับงานนี้</h3>
                    {selectedEventObj && (
                      <p className="target-event-badge">
                        งานที่กำหนดสิทธิ์: <strong>{selectedEventObj.title}</strong>
                      </p>
                    )}
                  </div>

                  <div className="form-row-three">
                    <div className="form-group">
                      <label htmlFor="scanner-name">ชื่อทีมสแกน / ผู้สแกน</label>
                      <input
                        id="scanner-name"
                        type="text"
                        className="text-input"
                        placeholder="เช่น ทีมประตู A, สมชาย"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="scanner-email">อีเมลทีมสแกน *</label>
                      <input
                        id="scanner-email"
                        type="email"
                        className="text-input"
                        placeholder="scanner@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={submitting}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="scanner-password">รหัสผ่าน (อย่างน้อย 15 ตัวอักษร)</label>
                      <input
                        id="scanner-password"
                        type="password"
                        className="text-input"
                        placeholder="อย่างน้อย 15 ตัวอักษร"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        disabled={submitting}
                        required
                      />
                    </div>
                  </div>

                  <div className="create-form-actions">
                    <button type="submit" className="primary-button" disabled={submitting}>
                      {submitting ? 'กำลังเพิ่ม...' : 'เพิ่มทีมสแกนสำหรับงานนี้'}
                    </button>
                    {scanners.length > 0 && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setActiveSubTab('manage')}
                        disabled={submitting}
                      >
                        กลับไปยังรายการทีมสแกน
                      </button>
                    )}
                  </div>
                </form>

                {/* Guidance & Security Instructions */}
                <div className="scanner-guidance-card">
                  <div className="guidance-card-header">
                    <InfoIcon />
                    <h4>คำแนะนำและนโยบายความปลอดภัยของบัญชีทีมสแกน</h4>
                  </div>
                  <ul className="guidance-list">
                    <li>
                      <strong>ขอบเขตสิทธิ์เฉพาะงาน:</strong> บัญชีทีมสแกนจะได้รับสิทธิ์เข้าถึงเฉพาะงานคอนเสิร์ตที่ระบุเท่านั้น ไม่สามารถดูข้อมูลคอนเสิร์ตอื่นหรือจัดการข้อมูลการเงินได้
                    </li>
                    <li>
                      <strong>มาตรฐานรหัสผ่าน:</strong> เพื่อความปลอดภัยสูงสุด รหัสผ่านต้องมีความยาวอย่างน้อย 15 ตัวอักษร
                    </li>
                    <li>
                      <strong>การสแกนแบบออฟไลน์ (AC-94):</strong> หลังสร้างบัญชีแล้ว ผู้จัดงานสามารถกำหนดให้บัญชีนี้เป็น &ldquo;เครื่องหลักประจำงาน (Primary Device)&rdquo; ได้ที่แท็บจัดการบัญชี เพื่อให้เครื่องสามารถดาวน์โหลดชุดข้อมูลและสแกนบัตรในโหมดออฟไลน์ได้
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HISTORY & AUDIT LOGS */}
          {activeSubTab === 'history' && (
            <div
              id="scanner-panel-history"
              role="tabpanel"
              aria-labelledby="scanner-tab-history"
              className="scanner-tab-panel"
            >
              {/* Header */}
              <div className="scanner-panel-top-row">
                <div className="scanner-panel-title-group">
                  <h3 className="scanner-panel-heading">
                    ประวัติการสลับเครื่องหลักและการระงับเพื่อกระทบยอด ({filteredHandovers.length})
                  </h3>
                  <p className="scanner-panel-sub-caption">
                    บันทึกประวัติการสลับเครื่องหลัก (Handover), การระงับโหมดออฟไลน์ฉุกเฉิน (Emergency Stop) และการปลดระงับกระทบยอด (Resume)
                  </p>
                </div>
              </div>

              {/* Filter Bar for History */}
              <div className="scanner-filter-bar">
                <div className="scanner-search-wrap">
                  <SearchIcon />
                  <input
                    type="text"
                    className="text-input scanner-search-input"
                    placeholder="ค้นหาเหตุผล, เครื่อง หรือชื่อผู้ทำรายการ..."
                    value={searchHistory}
                    onChange={e => setSearchHistory(e.target.value)}
                  />
                  {searchHistory && (
                    <button
                      type="button"
                      className="clear-search-btn"
                      onClick={() => setSearchHistory('')}
                      aria-label="ล้างคำค้นหา"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="scanner-filter-dropdown-wrap">
                  <SlidersIcon />
                  <select
                    className="text-input scanner-filter-select"
                    value={historyActionFilter}
                    onChange={e => setHistoryActionFilter(e.target.value as 'all' | 'HANDOVER' | 'EMERGENCY_STOP' | 'RESUME_RECONCILIATION')}
                    aria-label="กรองตามประเภทการดำเนินการ"
                  >
                    <option value="all">การดำเนินการทั้งหมด</option>
                    <option value="HANDOVER">สลับเครื่องหลัก (HANDOVER)</option>
                    <option value="EMERGENCY_STOP">ระงับฉุกเฉิน (EMERGENCY_STOP)</option>
                    <option value="RESUME_RECONCILIATION">ปลดระงับกระทบยอด (RESUME)</option>
                  </select>
                </div>
              </div>

              {/* History Table */}
              {handovers.length === 0 ? (
                <div className="empty-sub-card">
                  <ClockIcon />
                  <p>ยังไม่มีประวัติการสลับเครื่องหลักหรือการระงับในงานนี้</p>
                </div>
              ) : filteredHandovers.length === 0 ? (
                <div className="empty-sub-card">
                  <SearchIcon />
                  <p>ไม่พบบันทึกประวัติที่ตรงกับคำค้นหาหรือตัวกรอง</p>
                  <button
                    type="button"
                    className="secondary-button small"
                    onClick={() => {
                      setSearchHistory('');
                      setHistoryActionFilter('all');
                    }}
                  >
                    ล้างตัวกรองทั้งหมด
                  </button>
                </div>
              ) : (
                <div className="owner-news-table-wrap scanner-enterprise-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>เวลา</th>
                        <th>การดำเนินการ</th>
                        <th>เครื่องเดิม</th>
                        <th>เครื่องใหม่</th>
                        <th>รายการค้างเดิม</th>
                        <th>เหตุผล</th>
                        <th>ผู้ทำรายการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHandovers.map(h => (
                        <tr key={h.id}>
                          <td style={{ fontSize: '12px' }}>
                            {new Date(h.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
                          </td>
                          <td>
                            <span className={`status-badge ${h.action === 'HANDOVER' ? 'approved' : h.action === 'EMERGENCY_STOP' ? 'rejected' : 'open'}`}>
                              {h.action === 'HANDOVER' ? 'สลับเครื่องหลัก (AC-97)' : h.action === 'EMERGENCY_STOP' ? 'ระงับฉุกเฉิน (AC-98)' : 'ปลดระงับกระทบยอด'}
                            </span>
                          </td>
                          <td>{h.oldScannerName || '-'}</td>
                          <td>{h.newScannerName || '-'}</td>
                          <td>{h.oldScannerPendingCount} รายการ</td>
                          <td style={{ fontSize: '12px' }}>{h.reason || '-'}</td>
                          <td style={{ fontSize: '12px' }}>{h.actorName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Handover Modal (AC-97) */}
          {handoverTarget && (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="handover-title">
              <div className="modal-card" style={{ maxWidth: '520px' }}>
                <h3 id="handover-title">สลับเครื่องหลักประจำงาน (Primary Handover — AC-97)</h3>
                <p className="card-caption" style={{ marginBottom: '14px' }}>
                  การสลับเครื่องหลักทำได้เฉพาะขณะออนไลน์ โดยเครื่องเดิมต้องส่งผลค้างครบ (Pending = 0) และเครื่องใหม่ต้องดาวน์โหลดชุดข้อมูลล่าสุดแล้ว
                </p>

                <div style={{ backgroundColor: '#f1f5f9', padding: '12px', borderRadius: '6px', marginBottom: '14px', fontSize: '13px' }}>
                  <div><strong>เครื่องหลักเดิม:</strong> {currentPrimaryScanner?.name} ({currentPrimaryScanner?.email})</div>
                  <div><strong>เครื่องหลักใหม่:</strong> {handoverTarget.name} ({handoverTarget.email})</div>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="declared-old-pending">จำนวนรายการค้างที่ยังไม่ซิงก์บนเครื่องเดิม (Old Pending Count)</label>
                  <input
                    id="declared-old-pending"
                    type="number"
                    min="0"
                    className="text-input"
                    value={declaredOldPending}
                    onChange={e => {
                      setDeclaredOldPending(Math.max(0, Number(e.target.value) || 0));
                      setReadinessResult(null);
                    }}
                  />
                  <small style={{ color: '#64748b' }}>* ต้องเป็น 0 รายการเท่านั้นจึงจะสามารถสลับเครื่องได้ (AC-97)</small>
                </div>

                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label htmlFor="handover-reason">เหตุผลการสลับเครื่อง (ไม่บังคับ)</label>
                  <input
                    id="handover-reason"
                    type="text"
                    className="text-input"
                    placeholder="เช่น แบตเตอรี่เครื่องเดิมใกล้หมด, สลับกะการทำงาน"
                    value={handoverReason}
                    onChange={e => setHandoverReason(e.target.value)}
                  />
                </div>

                {readinessResult && (
                  <div
                    className={`status-banner ${readinessResult.ready ? 'success' : 'error'}`}
                    style={{ marginBottom: '14px', fontSize: '13px' }}
                  >
                    {readinessResult.ready ? (
                      <div>
                        <CheckCircleIcon />
                        <span>ผ่านเกณฑ์การตรวจสอบความพร้อม พร้อมสลับเครื่องหลัก (AC-97)</span>
                      </div>
                    ) : (
                      <div>
                        <strong>ไม่สามารถสลับเครื่องได้:</strong>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          {readinessResult.reasons.map(r => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    id="cancel-handover-modal-btn"
                    className="secondary-button"
                    onClick={() => {
                      setHandoverTarget(null);
                      setReadinessResult(null);
                    }}
                    disabled={actionLoading}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    id="check-handover-readiness-btn"
                    data-testid="check-handover-readiness-btn"
                    className="secondary-button"
                    onClick={() => handleCheckReadiness(handoverTarget.scannerId)}
                    disabled={checkingReadiness || actionLoading}
                  >
                    {checkingReadiness ? 'กำลังตรวจสอบ...' : 'ตรวจสอบความพร้อม (Check Readiness)'}
                  </button>
                  <button
                    type="button"
                    id="confirm-handover-btn"
                    data-testid="confirm-handover-btn"
                    className="primary-button"
                    onClick={handleExecuteHandover}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'กำลังสลับเครื่อง...' : 'ยืนยันการสลับเครื่องหลัก (AC-97)'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Emergency Stop Modal (AC-98, NQ-06) */}
          {showEmergencyModal && (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="emergency-title">
              <div className="modal-card" style={{ maxWidth: '520px' }}>
                <h3 id="emergency-title" style={{ color: '#dc2626' }}>
                  แจ้งเครื่องหลักชำรุด / ระงับการใช้งานออฟไลน์เพื่อกระทบยอด (AC-98)
                </h3>
                <p className="card-caption" style={{ marginBottom: '14px' }}>
                  เมื่อเครื่องหลักชำรุด สูญหาย หรือข้อมูลในเครื่องเสียหายพร้อมรายการค้าง: <strong>ต้องหยุดการสแกนแบบออฟไลน์ทั้งหมดในงาน</strong> และเข้าสู่กระบวนการกระทบยอดร่วมกับเจ้าของเว็บตาม NQ-06 ไม่สามารถสลับหรือเปิดเครื่องออฟไลน์เครื่องใหม่ข้ามขั้นตอนได้
                </p>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="emergency-reason-select">สาเหตุการระงับ</label>
                  <select
                    id="emergency-reason-select"
                    className="text-input"
                    value={emergencyReason}
                    onChange={e => setEmergencyReason(e.target.value)}
                  >
                    <option value="DEVICE_DAMAGED_RECONCILIATION_REQUIRED">เครื่องหลักชำรุด ใช้งานไม่ได้ (Device Damaged)</option>
                    <option value="LOCAL_DATA_CORRUPTED_LOST">ข้อมูลในเครื่องสูญหาย / ล้างแคชโดยไม่ได้ตั้งใจ</option>
                    <option value="DEVICE_LOST_OR_STOLEN">อุปกรณ์สูญหายหรือถูกขโมย</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="lost-pending-count">จำนวนรายการสแกนค้างที่สูญหาย (โดยประมาณ)</label>
                  <input
                    id="lost-pending-count"
                    type="number"
                    min="0"
                    className="text-input"
                    value={lostPendingCount}
                    onChange={e => setLostPendingCount(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="emergency-details">รายละเอียดเพิ่มเติมสำหรับบันทึกกระทบยอด (NQ-06)</label>
                  <textarea
                    id="emergency-details"
                    className="text-input"
                    rows={3}
                    placeholder="ระบุจุดที่เครื่องชำรุด เวลาที่เกิดเหตุ หรือจำนวนผู้ชมโดยประมาณ"
                    value={emergencyDetails}
                    onChange={e => setEmergencyDetails(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowEmergencyModal(false)}
                    disabled={actionLoading}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    id="confirm-emergency-stop-btn"
                    data-testid="confirm-emergency-stop-btn"
                    className="danger-button"
                    onClick={handleExecuteEmergencyStop}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'กำลังระงับ...' : 'ยืนยันการระงับออฟไลน์เพื่อกระทบยอด (AC-98)'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
