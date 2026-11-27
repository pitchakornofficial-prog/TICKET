'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DirectTicketBatchSummary } from '@/server/direct-tickets';
import type { TicketDetail } from '@/server/tickets';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { loadOwnerMasterTemplate } from '@/lib/ticket-master-template-sync';
import { triggerToast, triggerRefreshToast } from './toast-notification';
import {
  downloadTicketAsPng,
  downloadAllTicketsAsZip,
  generateTicketDataUrl,
} from './ticket-canvas-download';
import {
  RefreshIcon,
  DownloadIcon,
  EyeIcon,
  SearchIcon,
  XIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  ShieldCheckIcon,
  UsersIcon,
  UserPlusIcon,
  MailIcon,
  QrCodeIcon,
  ReceiptIcon,
  PlusIcon,
} from './icons';

export interface EventOption {
  eventId: string;
  eventTitle: string;
  organizerName: string;
  organizerEmail: string;
  salesStartTime?: string | null;
  salesEndTime?: string | null;
  isSalesEnded?: boolean;
  sessions: {
    sessionId: string;
    startTime: string;
    endTime: string;
    isSessionEnded?: boolean;
    isSalesEnded?: boolean;
    salesStatusLabel?: string;
    ticketTypes: {
      ticketTypeId: string;
      name: string;
      price: number;
      totalQuota: number;
      webSold: number;
      directIssued: number;
      returnedQuota?: number;
      heldPending: number;
      remainingQuota: number;
    }[];
  }[];
}

export function normalizeEventOptions(rawList: unknown): EventOption[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(item => {
    const raw = item as Record<string, unknown>;
    const rawSessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    return {
      eventId: String(raw.eventId || ''),
      eventTitle: String(raw.eventTitle || ''),
      organizerName: String(raw.organizerName || 'ผู้จัดงาน'),
      organizerEmail: String(raw.organizerEmail || ''),
      salesStartTime: raw.salesStartTime ? String(raw.salesStartTime) : null,
      salesEndTime: raw.salesEndTime ? String(raw.salesEndTime) : null,
      isSalesEnded: Boolean(raw.isSalesEnded),
      sessions: rawSessions.map(sItem => {
        const s = sItem as Record<string, unknown>;
        const rawTypes = Array.isArray(s.ticketTypes) ? s.ticketTypes : [];
        return {
          sessionId: String(s.sessionId || ''),
          startTime: String(s.startTime || ''),
          endTime: String(s.endTime || ''),
          isSessionEnded: Boolean(s.isSessionEnded),
          isSalesEnded: Boolean(s.isSalesEnded),
          salesStatusLabel: s.salesStatusLabel ? String(s.salesStatusLabel) : undefined,
          ticketTypes: rawTypes.map(tItem => {
            const tt = tItem as Record<string, unknown>;
            const totalQuota = Number(tt.totalQuota ?? tt.quota ?? 0);
            const remainingQuota = Number(tt.remainingQuota ?? tt.available ?? 0);
            return {
              ticketTypeId: String(tt.ticketTypeId || ''),
              name: String(tt.name || ''),
              price: Number(tt.price || 0),
              totalQuota,
              webSold: Number(tt.webSold || 0),
              directIssued: Number(tt.directIssued || 0),
              returnedQuota: Number(tt.returnedQuota || 0),
              heldPending: Number(tt.heldPending || 0),
              remainingQuota,
            };
          }),
        };
      }),
    };
  });
}

type HistoryFilterTab = 'all' | 'active' | 'revoked';

export function OwnerDirectTicketsManager() {
  const [eventsOptions, setEventsOptions] = useState<EventOption[]>([]);
  const [batches, setBatches] = useState<DirectTicketBatchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filters on main history table
  const [statusTab, setStatusTab] = useState<HistoryFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEventId, setFilterEventId] = useState('all');

  // Popup 1: Issue Direct Tickets Modal
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueStep, setIssueStep] = useState<'form' | 'confirm'>('form');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [ticketQuantities, setTicketQuantities] = useState<Record<string, number>>({});
  const [recipientMode, setRecipientMode] = useState<'organizer' | 'owner' | 'custom'>('organizer');
  const [customRecipientName, setCustomRecipientName] = useState('');
  const [customRecipientEmail, setCustomRecipientEmail] = useState('');
  const [priceDisplayMode, setPriceDisplayMode] = useState<'face_value' | 'complimentary'>('face_value');
  const [referenceNote, setReferenceNote] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Popup 2: Batch Detail & Evidence Modal
  const [viewingBatch, setViewingBatch] = useState<DirectTicketBatchSummary | null>(null);
  const [batchTickets, setBatchTickets] = useState<TicketDetail[]>([]);
  const [isLoadingBatchDetail, setIsLoadingBatchDetail] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadingRowId, setDownloadingRowId] = useState<string | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  // Popup 3: Revoke Confirmation Modal
  const [revokingTicketId, setRevokingTicketId] = useState<string | null>(null);
  const [isRevokingBatch, setIsRevokingBatch] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [isSubmittingRevoke, setIsSubmittingRevoke] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/owner/direct-tickets', { cache: 'no-store' });
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      const data = await res.json();
      const rawEvents = data.eventsOptions || data.options || [];
      const loadedEvents = normalizeEventOptions(rawEvents);
      setEventsOptions(loadedEvents);
      setBatches(data.batches || []);

      if (loadedEvents.length > 0 && !selectedEventId) {
        const firstEv = loadedEvents[0];
        setSelectedEventId(firstEv.eventId);
        if (firstEv.sessions.length > 0) {
          setSelectedSessionId(firstEv.sessions[0].sessionId);
        }
      }
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล',
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // KPI Aggregates
  const kpiStats = useMemo(() => {
    let totalTickets = 0;
    let totalAdmitted = 0;
    let totalRevoked = 0;
    let activeBatches = 0;
    let revokedBatches = 0;

    for (const b of batches) {
      totalTickets += b.totalTickets;
      totalAdmitted += b.admittedTickets;
      totalRevoked += b.cancelledTickets;
      if (b.cancelledTickets === b.totalTickets && b.totalTickets > 0) {
        revokedBatches += 1;
      } else {
        activeBatches += 1;
      }
    }

    return {
      totalBatches: batches.length,
      activeBatches,
      revokedBatches,
      totalTickets,
      totalAdmitted,
      totalRevoked,
    };
  }, [batches]);

  // Filtered history list
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const isFullyRevoked = b.cancelledTickets === b.totalTickets && b.totalTickets > 0;
      if (statusTab === 'active' && isFullyRevoked) return false;
      if (statusTab === 'revoked' && !isFullyRevoked) return false;
      if (filterEventId !== 'all' && b.eventId !== filterEventId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          b.orderId.toLowerCase().includes(q) ||
          b.eventTitle.toLowerCase().includes(q) ||
          b.buyerName.toLowerCase().includes(q) ||
          b.buyerEmail.toLowerCase().includes(q) ||
          Boolean(b.referenceNote?.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [batches, statusTab, filterEventId, searchQuery]);

  // Selected event & session for Issue Modal
  const currentEvent = useMemo(
    () => eventsOptions.find(e => e.eventId === selectedEventId),
    [eventsOptions, selectedEventId],
  );

  const currentSession = useMemo(() => {
    if (!currentEvent) return null;
    return currentEvent.sessions.find(s => s.sessionId === selectedSessionId) || currentEvent.sessions[0] || null;
  }, [currentEvent, selectedSessionId]);

  const handleEventChange = (newEvId: string) => {
    setSelectedEventId(newEvId);
    setTicketQuantities({});
    const ev = eventsOptions.find(e => e.eventId === newEvId);
    if (ev && ev.sessions.length > 0) {
      const activeSess = ev.sessions.find(s => !s.isSessionEnded) || ev.sessions[0];
      setSelectedSessionId(activeSess.sessionId);
    } else {
      setSelectedSessionId('');
    }
  };

  const handleSessionChange = (newSId: string) => {
    setSelectedSessionId(newSId);
    setTicketQuantities({});
  };

  const handleQuantityChange = (ticketTypeId: string, value: number, maxAvailable: number) => {
    const safeVal = Math.max(0, Math.min(Math.floor(value || 0), maxAvailable));
    setTicketQuantities(prev => ({
      ...prev,
      [ticketTypeId]: safeVal,
    }));
  };

  const totalSelectedTickets = useMemo(
    () => Object.values(ticketQuantities).reduce((sum, qty) => sum + (qty || 0), 0),
    [ticketQuantities],
  );

  const totalSelectedValue = useMemo(() => {
    if (!currentSession) return 0;
    return currentSession.ticketTypes.reduce((sum, tt) => {
      const qty = ticketQuantities[tt.ticketTypeId] || 0;
      return sum + qty * tt.price;
    }, 0);
  }, [currentSession, ticketQuantities]);

  const handleOpenIssueModal = () => {
    void loadData();
    setIssueStep('form');
    setTicketQuantities({});
    setRecipientMode('organizer');
    setCustomRecipientName('');
    setCustomRecipientEmail('');
    setPriceDisplayMode('face_value');
    setReferenceNote('');
    setSendEmail(true);

    if (eventsOptions.length > 0) {
      const activeEv = eventsOptions.find(e => e.eventId === selectedEventId) || eventsOptions[0];
      setSelectedEventId(activeEv.eventId);
      const activeSess =
        activeEv.sessions.find(s => s.sessionId === selectedSessionId && !s.isSessionEnded) ||
        activeEv.sessions.find(s => !s.isSessionEnded) ||
        activeEv.sessions[0];
      if (activeSess) {
        setSelectedSessionId(activeSess.sessionId);
      }
    }

    setIsIssueModalOpen(true);
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEvent || !currentSession) {
      triggerToast({ type: 'error', message: 'กรุณาเลือกคอนเสิร์ตและรอบการแสดง' });
      return;
    }
    if (currentSession.isSessionEnded) {
      triggerToast({ type: 'error', message: 'ไม่สามารถออกบัตรตรงสำหรับรอบการแสดงที่สิ้นสุดไปแล้วได้' });
      return;
    }
    if (totalSelectedTickets <= 0) {
      triggerToast({ type: 'error', message: 'กรุณาระบุจำนวนบัตรที่ต้องการดึงอย่างน้อย 1 ใบ' });
      return;
    }
    if (recipientMode === 'custom') {
      if (!customRecipientName.trim() || !customRecipientEmail.trim()) {
        triggerToast({ type: 'error', message: 'กรุณาระบุชื่อและอีเมลของผู้รับมอบให้ครบถ้วน' });
        return;
      }
      if (!customRecipientEmail.includes('@') || !customRecipientEmail.includes('.')) {
        triggerToast({ type: 'error', message: 'รูปแบบอีเมลของผู้รับมอบไม่ถูกต้อง' });
        return;
      }
    }
    setIssueStep('confirm');
  };

  const handleConfirmSubmitIssue = async () => {
    if (!currentSession || !currentEvent) return;

    const items = Object.entries(ticketQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

    if (items.length === 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/owner/direct-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: currentEvent.eventId,
          sessionId: currentSession.sessionId,
          items,
          recipientMode,
          recipientName: recipientMode === 'custom' ? customRecipientName.trim() : undefined,
          recipientEmail: recipientMode === 'custom' ? customRecipientEmail.trim() : undefined,
          customRecipientName: recipientMode === 'custom' ? customRecipientName.trim() : undefined,
          customRecipientEmail: recipientMode === 'custom' ? customRecipientEmail.trim() : undefined,
          priceDisplayMode,
          referenceNote: referenceNote.trim() || undefined,
          sendEmail,
          deferEmail: sendEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'ออกบัตรตรงไม่สำเร็จ');
      }

      if (sendEmail && data.orderId) {
        const masterTemplate = await loadOwnerMasterTemplate().catch(() => null);
        const issuedTickets: TicketDetail[] = Array.isArray(data.tickets) ? data.tickets : [];
        const renderedImages: Array<{ ticketId: string; dataUrl: string }> = [];
        for (const t of issuedTickets.slice(0, 20)) {
          try {
            const dataUrl = await generateTicketDataUrl(
              { ...t, priceDisplayMode } as TicketDetail,
              masterTemplate ?? undefined,
            );
            if (dataUrl) renderedImages.push({ ticketId: t.id, dataUrl });
          } catch {
            // Skip failed browser render; server fallback handles missing entries
          }
        }
        await fetch(`/api/owner/direct-tickets/${data.orderId}/resend-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ renderedImages }),
        });
      }

      triggerToast({
        type: 'success',
        message: `ออกบัตรตรงสำเร็จ (${data.totalTickets} ใบ) รหัส #${data.orderId}`,
      });

      setIsIssueModalOpen(false);
      setIssueStep('form');
      setTicketQuantities({});
      setReferenceNote('');
      await loadData();
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการออกบัตร',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenBatch = async (orderId: string) => {
    setIsLoadingBatchDetail(true);
    try {
      const res = await fetch(`/api/owner/direct-tickets/${orderId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('โหลดรายละเอียดไม่สำเร็จ');
      const data = await res.json();
      setViewingBatch(data.batch || null);
      setBatchTickets(data.tickets || []);
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดรายละเอียด',
      });
    } finally {
      setIsLoadingBatchDetail(false);
    }
  };

  const handleDirectRowZipDownload = async (batch: DirectTicketBatchSummary) => {
    setDownloadingRowId(batch.orderId);
    try {
      const res = await fetch(`/api/owner/direct-tickets/${batch.orderId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('ไม่สามารถโหลดรายการบัตรได้');
      const data = await res.json();
      const tickets: TicketDetail[] = data.tickets || [];
      if (tickets.length === 0) {
        throw new Error('ไม่พบข้อมูลบัตรในรายการนี้');
      }
      const zipName = `tickets-${batch.orderId}-${batch.eventTitle.slice(0, 20)}`;
      await downloadAllTicketsAsZip(tickets, zipName, {
        priceDisplayMode: batch.priceDisplayMode,
      });
      triggerToast({
        type: 'success',
        message: `ดาวน์โหลดไฟล์ .zip (${tickets.length} ใบ + CSV) เรียบร้อยแล้ว`,
      });
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการดาวน์โหลด .zip',
      });
    } finally {
      setDownloadingRowId(null);
    }
  };

  const handleDownloadZip = async () => {
    if (!viewingBatch || batchTickets.length === 0) return;
    setZipProgress({ current: 0, total: batchTickets.length });
    try {
      const zipName = `tickets-${viewingBatch.orderId}-${viewingBatch.eventTitle.slice(0, 20)}`;
      await downloadAllTicketsAsZip(batchTickets, zipName, {
        priceDisplayMode: viewingBatch.priceDisplayMode,
        onProgress: (current, total) => setZipProgress({ current, total }),
      });
      triggerToast({
        type: 'success',
        message: `ดาวน์โหลด .zip (${batchTickets.length} ใบ + tickets-summary.csv) เรียบร้อยแล้ว`,
      });
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างไฟล์ .zip',
      });
    } finally {
      setZipProgress(null);
    }
  };

  const handleResendEmail = async () => {
    if (!viewingBatch) return;
    setIsResendingEmail(true);
    try {
      const masterTemplate = await loadOwnerMasterTemplate().catch(() => null);
      const renderedImages: Array<{ ticketId: string; dataUrl: string }> = [];
      for (const t of batchTickets.slice(0, 20)) {
        try {
          const dataUrl = await generateTicketDataUrl(
            {
              ...t,
              priceDisplayMode: viewingBatch.priceDisplayMode,
            } as TicketDetail,
            masterTemplate ?? undefined,
          );
          if (dataUrl) renderedImages.push({ ticketId: t.id, dataUrl });
        } catch {
          // Fallback to server-side render if canvas fails
        }
      }

      const res = await fetch(`/api/owner/direct-tickets/${viewingBatch.orderId}/resend-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderedImages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ส่งอีเมลไม่สำเร็จ');
      triggerToast({
        type: 'success',
        message: `ส่งอีเมลรายการ #${viewingBatch.orderId} ไปยัง ${viewingBatch.buyerEmail} เรียบร้อยแล้ว`,
      });
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งอีเมล',
      });
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!viewingBatch) return;
    const isSingle = Boolean(revokingTicketId);
    const targetIds = isSingle && revokingTicketId ? [revokingTicketId] : undefined;

    setIsSubmittingRevoke(true);
    try {
      const res = await fetch(`/api/owner/direct-tickets/${viewingBatch.orderId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketIds: targetIds,
          reason: revokeReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'ยกเลิกบัตรไม่สำเร็จ');

      triggerToast({
        type: 'success',
        message: `เพิกถอนบัตร ${data.revokedCount} ใบ และคืนโควตากลับสู่คอนเสิร์ตเรียบร้อยแล้ว`,
      });

      setRevokingTicketId(null);
      setIsRevokingBatch(false);
      setRevokeReason('');

      await handleOpenBatch(viewingBatch.orderId);
      await loadData();
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเพิกถอนบัตร',
      });
    } finally {
      setIsSubmittingRevoke(false);
    }
  };

  const revocableTicketsCount = useMemo(
    () => batchTickets.filter(t => t.status === 'valid' && t.admissionStatus !== 'inside').length,
    [batchTickets],
  );

  const handleManualRefresh = async () => {
    await loadData();
    triggerRefreshToast('ออกบัตรตรง');
  };

  return (
    <div className="direct-tickets-container">
      {/* 1. Clean White Top Header + Primary CTA */}
      <div className="hub-top-bar">
        <div className="hub-header-left">
          <h2 className="pipeline-title">ออกบัตรตรงจากโควตาคอนเสิร์ต</h2>
          <p className="pipeline-subtitle">
            จัดการและดึงบัตรตรงจากโควตาคงเหลือ (กรณีโอนเงินนอกระบบ) พร้อมบันทึกประวัติ หลักฐานอ้างอิง และคืนโควตาเมื่อเพิกถอน
          </p>
        </div>
        <div className="hub-toolbar-tools-right">
          <button
            type="button"
            className="secondary-button hub-refresh-btn"
            onClick={handleManualRefresh}
            disabled={isLoading}
            aria-label="รีเฟรชข้อมูล"
            title="รีเฟรชข้อมูล"
          >
            <RefreshIcon className={`btn-icon ${isLoading ? 'spinning' : ''}`} style={{ width: 16, height: 16 }} />
            <span>รีเฟรช</span>
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleOpenIssueModal}
          >
            <PlusIcon style={{ width: 16, height: 16 }} />
            <span>ออกบัตรตรงใหม่</span>
          </button>
        </div>
      </div>

      {/* 2. 4 Monochrome KPI Summary Cards */}
      <div className="direct-kpi-grid">
        <div className="direct-kpi-card">
          <div className="direct-kpi-head">
            <span className="direct-kpi-label">รายการออกบัตรทั้งหมด</span>
            <ReceiptIcon style={{ width: 17, height: 17, color: '#64748b' }} />
          </div>
          <div className="direct-kpi-value">{kpiStats.totalBatches.toLocaleString()}</div>
          <div className="direct-kpi-sub">ชุดคำสั่งซื้อ #DIR-</div>
        </div>

        <div className="direct-kpi-card">
          <div className="direct-kpi-head">
            <span className="direct-kpi-label">จำนวนบัตรออกตรงรวม</span>
            <QrCodeIcon style={{ width: 17, height: 17, color: '#0f172a' }} />
          </div>
          <div className="direct-kpi-value">{kpiStats.totalTickets.toLocaleString()}</div>
          <div className="direct-kpi-sub">หักจากโควตาจริงของคอนเสิร์ต</div>
        </div>

        <div className="direct-kpi-card">
          <div className="direct-kpi-head">
            <span className="direct-kpi-label">สแกนเข้างานแล้ว</span>
            <CheckCircleIcon style={{ width: 17, height: 17, color: '#166534' }} />
          </div>
          <div className="direct-kpi-value" style={{ color: '#166534' }}>
            {kpiStats.totalAdmitted.toLocaleString()}
          </div>
          <div className="direct-kpi-sub">นับรวมในยอดผู้เข้างานจริง</div>
        </div>

        <div className="direct-kpi-card">
          <div className="direct-kpi-head">
            <span className="direct-kpi-label">เพิกถอนคืนโควตาแล้ว</span>
            <AlertTriangleIcon style={{ width: 17, height: 17, color: '#991b1b' }} />
          </div>
          <div className="direct-kpi-value" style={{ color: kpiStats.totalRevoked > 0 ? '#991b1b' : '#0f172a' }}>
            {kpiStats.totalRevoked.toLocaleString()}
          </div>
          <div className="direct-kpi-sub">บัตรที่ถูกยกเลิกสิทธิ์</div>
        </div>
      </div>

      {/* 3. Balanced Filter Toolbar */}
      <div className="hub-toolbar-row">
        <div className="hub-filter-tabs-bar" role="tablist" aria-label="ตัวกรองสถานะชุดบัตร">
          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'all'}
            className={`hub-filter-tab ${statusTab === 'all' ? 'active is-active' : ''}`}
            onClick={() => setStatusTab('all')}
          >
            <span>ทั้งหมด</span>
            <span className="hub-tab-badge status-counter-pill">{kpiStats.totalBatches}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'active'}
            className={`hub-filter-tab ${statusTab === 'active' ? 'active is-active' : ''}`}
            onClick={() => setStatusTab('active')}
          >
            <span>ใช้งานอยู่</span>
            <span className="hub-tab-badge status-counter-pill">{kpiStats.activeBatches}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'revoked'}
            className={`hub-filter-tab ${statusTab === 'revoked' ? 'active is-active' : ''}`}
            onClick={() => setStatusTab('revoked')}
          >
            <span>เพิกถอนทั้งชุดแล้ว</span>
            <span className="hub-tab-badge status-counter-pill">{kpiStats.revokedBatches}</span>
          </button>
        </div>

        <div className="hub-toolbar-tools-right">
          <div className="hub-search-box">
            <SearchIcon className="hub-search-icon" />
            <input
              type="text"
              placeholder="ค้นหา #DIR-, คอนเสิร์ต, ผู้รับ, หลักฐาน..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="hub-search-input"
              aria-label="ค้นหาประวัติการออกบัตรตรง"
            />
            {searchQuery && (
              <button
                type="button"
                className="hub-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="ล้างคำค้นหา"
              >
                <XIcon style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>

          <select
            value={filterEventId}
            onChange={e => setFilterEventId(e.target.value)}
            className="hub-sort-select"
            aria-label="กรองตามคอนเสิร์ต"
          >
            <option value="all">ทุกคอนเสิร์ต ({eventsOptions.length})</option>
            {eventsOptions.map(ev => (
              <option key={ev.eventId} value={ev.eventId}>
                {ev.eventTitle}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Dense Monochrome History & Evidence Table */}
      <div className="direct-table-wrap">
        <table className="direct-data-table">
          <thead>
            <tr>
              <th>รหัสรายการ</th>
              <th>คอนเสิร์ต / รอบการแสดง</th>
              <th>ผู้รับมอบบัตร</th>
              <th className="align-right">จำนวน / รูปแบบ</th>
              <th>หลักฐาน / ผู้ออกบัตร</th>
              <th className="align-center">สถานะ</th>
              <th>วันที่ออกบัตร / วันที่เพิกถอน</th>
              <th className="align-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filteredBatches.length > 0 ? (
              filteredBatches.map(batch => {
                const isFullyRevoked = batch.cancelledTickets === batch.totalTickets && batch.totalTickets > 0;
                const isDownloadingThisRow = downloadingRowId === batch.orderId;
                return (
                  <tr key={batch.orderId}>
                    <td className="nowrap-cell">
                      <span className="direct-order-code">#{batch.orderId}</span>
                    </td>
                    <td className="nowrap-cell">
                      <span style={{ color: '#0f172a', fontWeight: 400 }}>{batch.eventTitle}</span>
                      <span style={{ color: '#94a3b8', margin: '0 0.35rem' }}>•</span>
                      <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                        {formatDate(new Date(batch.sessionStartTime))} {formatTime(new Date(batch.sessionStartTime))}
                      </span>
                    </td>
                    <td className="nowrap-cell">
                      <span style={{ color: '#0f172a', fontWeight: 400 }}>{batch.buyerName}</span>
                      <span style={{ color: '#64748b', fontSize: '0.74rem', marginLeft: '0.35rem' }}>
                        ({batch.buyerEmail})
                      </span>
                    </td>
                    <td className="align-right nowrap-cell">
                      <span style={{ color: '#0f172a', fontWeight: 400 }}>{batch.totalTickets} ใบ</span>
                      <span style={{ color: '#94a3b8', margin: '0 0.35rem' }}>•</span>
                      <span style={{ color: '#64748b', fontSize: '0.74rem' }}>
                        {batch.priceDisplayMode === 'complimentary' ? 'บัตรเชิญ' : 'ราคาจริง'}
                      </span>
                    </td>
                    <td className="nowrap-cell">
                      {batch.referenceNote ? (
                        <span className="direct-evidence-pill" title={batch.referenceNote}>
                          {batch.referenceNote}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>ไม่มีหมายเหตุ</span>
                      )}
                      <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '0.35rem' }}>
                        (โดย {batch.issuedByName || 'Owner'})
                      </span>
                    </td>
                    <td className="align-center nowrap-cell">
                      {isFullyRevoked ? (
                        <span className="direct-status-badge revoked">
                          เพิกถอนแล้ว
                        </span>
                      ) : batch.admittedTickets > 0 ? (
                        <span className="direct-status-badge valid">
                          เข้างานแล้ว {batch.admittedTickets}/{batch.totalTickets}
                        </span>
                      ) : (
                        <span className="direct-status-badge valid">
                          พร้อมใช้งาน ({batch.validTickets})
                        </span>
                      )}
                    </td>
                    <td className="nowrap-cell" style={{ fontSize: '0.76rem' }}>
                      {isFullyRevoked && batch.revokedAt ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ color: '#dc2626', fontWeight: 400 }}>
                            เพิกถอน: {formatDate(new Date(batch.revokedAt))} {formatTime(new Date(batch.revokedAt))}
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                            ออกบัตร: {formatDate(new Date(batch.createdAt))} {formatTime(new Date(batch.createdAt))}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b' }}>
                          {formatDate(new Date(batch.createdAt))} {formatTime(new Date(batch.createdAt))}
                        </span>
                      )}
                    </td>
                    <td className="align-center nowrap-cell">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="secondary-button direct-btn-sm"
                          style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box' }}
                          onClick={() => handleOpenBatch(batch.orderId)}
                        >
                          <EyeIcon style={{ width: 13, height: 13 }} />
                          <span>รายละเอียด</span>
                        </button>

                        {!isFullyRevoked && (
                          <button
                            type="button"
                            className="secondary-button direct-btn-sm"
                            style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box' }}
                            disabled={isDownloadingThisRow}
                            onClick={() => handleDirectRowZipDownload(batch)}
                            title="ดาวน์โหลดไฟล์ .zip รวม PNG และ CSV"
                          >
                            <DownloadIcon style={{ width: 13, height: 13 }} />
                            <span>{isDownloadingThisRow ? 'กำลังโหลด...' : '.ZIP'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: '3.5rem 1.5rem', textAlign: 'center', background: '#ffffff' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
                    <ReceiptIcon style={{ width: 32, height: 32, color: '#94a3b8' }} />
                    <p style={{ margin: 0, fontSize: '0.94rem', fontWeight: 400, color: '#334155' }}>
                      {searchQuery || filterEventId !== 'all' || statusTab !== 'all'
                        ? 'ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา'
                        : 'ยังไม่มีประวัติการออกบัตรตรง'}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                      กดปุ่ม &quot;ออกบัตรตรงใหม่&quot; ด้านบนเพื่อสร้างชุดบัตรจากโควตาคงเหลือและบันทึกหลักฐาน
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
          POPUP 1: Sequential Form Modal for Direct Ticket Issuance
         ========================================================================= */}
      {isIssueModalOpen && (
        <div
          className="direct-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-modal-title"
        >
          <div className="direct-modal-card">
            <div className="direct-modal-header">
              <div>
                <h3 id="issue-modal-title" className="direct-modal-title">
                  {issueStep === 'form' ? 'สร้างรายการออกบัตรตรงจากโควตา' : 'ยืนยันการตัดโควตาและออกบัตรตรง'}
                </h3>
                <p className="direct-modal-subtitle">
                  {issueStep === 'form'
                    ? 'กรอกข้อมูลตามลำดับเพื่อดึงบัตรออกจากโควตาคงเหลือ (ไม่นับรวมในยอดขายหน้าเว็บ)'
                    : 'กรุณาตรวจสอบรายละเอียดให้ถูกต้องก่อนยืนยัน ระบบจะหักโควตาทันที'}
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsIssueModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {issueStep === 'form' ? (
              <form onSubmit={handleProceedToConfirm} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="direct-modal-body">
                  {/* Section 1: Select Concert */}
                  <div className="direct-form-section">
                    <div className="direct-form-section-head">
                      <span className="direct-step-num">1</span>
                      <h4 className="direct-form-section-title">เลือกคอนเสิร์ต (Concert)</h4>
                    </div>
                    <div className="direct-field">
                      <label htmlFor="popup-select-event" className="direct-field-label">
                        เลือกคอนเสิร์ต (Concert)
                      </label>
                      <select
                        id="popup-select-event"
                        value={selectedEventId}
                        onChange={e => handleEventChange(e.target.value)}
                        className="form-select-control"
                        disabled={eventsOptions.length === 0}
                      >
                        {eventsOptions.length === 0 ? (
                          <option value="">ไม่มีคอนเสิร์ตที่เปิดขาย</option>
                        ) : (
                          eventsOptions.map(ev => (
                            <option key={ev.eventId} value={ev.eventId}>
                              {ev.eventTitle} — ผู้จัด: {ev.organizerName} {ev.isSalesEnded ? '(ปิดขายหน้าเว็บแล้ว)' : '(เปิดขายหน้าเว็บ)'}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Section 2: Select Session */}
                  <div className="direct-form-section">
                    <div className="direct-form-section-head">
                      <span className="direct-step-num">2</span>
                      <h4 className="direct-form-section-title">เลือกรอบการแสดง (Session)</h4>
                    </div>
                    <div className="direct-field">
                      <label htmlFor="popup-select-session" className="direct-field-label">
                        รอบวันและเวลาที่ต้องการดึงบัตร
                      </label>
                      <select
                        id="popup-select-session"
                        value={selectedSessionId}
                        onChange={e => handleSessionChange(e.target.value)}
                        className="form-select-control"
                        disabled={!currentEvent || currentEvent.sessions.length === 0}
                      >
                        {!currentEvent || currentEvent.sessions.length === 0 ? (
                          <option value="">ไม่มีรอบการแสดง</option>
                        ) : (
                          currentEvent.sessions.map(s => (
                            <option key={s.sessionId} value={s.sessionId} disabled={Boolean(s.isSessionEnded)}>
                              {formatDate(new Date(s.startTime))} เวลา {formatTime(new Date(s.startTime))} -{' '}
                              {formatTime(new Date(s.endTime))}
                              {s.isSessionEnded ? ' [การแสดงสิ้นสุดแล้ว - ปิดรับการออกบัตร]' : s.isSalesEnded ? ' (ปิดขายหน้าเว็บ)' : ''}
                            </option>
                          ))
                        )}
                      </select>
                      {currentEvent?.isSalesEnded && !currentSession?.isSessionEnded && (
                        <div
                          style={{
                            padding: '10px 14px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '13px',
                            color: '#334155',
                            marginTop: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <InfoIcon style={{ width: 16, height: 16, flexShrink: 0, color: '#475569' }} />
                          <span>
                            คอนเสิร์ตนี้สิ้นสุดการจำหน่ายบัตรบนหน้าเว็บแล้ว แต่คุณยังสามารถออกบัตรตรง (บัตรเชิญ/สปอนเซอร์/หน้างาน) จากโควตาคงเหลือได้จนกว่าจะถึงเวลาสิ้นสุดการแสดง
                          </span>
                        </div>
                      )}
                      {currentSession?.isSessionEnded && (
                        <div
                          style={{
                            padding: '10px 14px',
                            backgroundColor: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            fontSize: '13px',
                            color: '#991b1b',
                            marginTop: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <AlertTriangleIcon style={{ width: 16, height: 16, flexShrink: 0, color: '#dc2626' }} />
                          <span>
                            รอบการแสดงนี้สิ้นสุดลงแล้ว ระบบปิดรับการออกบัตรตรงทุกกรณีเพื่อความถูกต้องของข้อมูล
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 3: Select Ticket Types & Quantities */}
                  <div className="direct-form-section">
                    <div className="direct-form-section-head">
                      <span className="direct-step-num">3</span>
                      <h4 className="direct-form-section-title">เลือกประเภทบัตรและจำนวนที่ต้องการดึง</h4>
                    </div>

                    {currentSession && currentSession.ticketTypes.length > 0 ? (
                      <div className="direct-tier-list">
                        {currentSession.ticketTypes.map(tt => {
                          const qty = ticketQuantities[tt.ticketTypeId] || 0;
                          const isSoldOut = tt.remainingQuota <= 0;
                          return (
                            <div
                              key={tt.ticketTypeId}
                              className={`direct-tier-row ${qty > 0 ? 'is-selected' : ''}`}
                            >
                              <div className="direct-tier-info">
                                <span className="direct-tier-name">{tt.name}</span>
                                <div className="direct-tier-meta">
                                  <span>ราคา {formatBaht(tt.price)} บาท</span>
                                  <span>•</span>
                                  <span>โควตา {tt.totalQuota.toLocaleString()}</span>
                                  <span>•</span>
                                  <span>ขายเว็บ {tt.webSold.toLocaleString()}</span>
                                  <span>•</span>
                                  <span>ดึงตรง {tt.directIssued.toLocaleString()}</span>
                                  {Boolean(tt.returnedQuota && tt.returnedQuota > 0) && (
                                    <>
                                      <span>•</span>
                                      <span style={{ color: '#16a34a' }}>คืนโควตาแล้ว {tt.returnedQuota?.toLocaleString()} ใบ</span>
                                    </>
                                  )}
                                  <span>•</span>
                                  {isSoldOut ? (
                                    <span className="direct-status-badge revoked">หมด (0 ใบ)</span>
                                  ) : tt.remainingQuota <= 10 ? (
                                    <span className="direct-status-badge warning">
                                      เหลือ {tt.remainingQuota} ใบ
                                    </span>
                                  ) : (
                                    <span className="direct-status-badge valid">
                                      คงเหลือ {tt.remainingQuota.toLocaleString()} ใบ
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="direct-stepper">
                                <button
                                  type="button"
                                  className="secondary-button direct-btn-sm"
                                  disabled={isSoldOut || qty <= 0}
                                  onClick={() =>
                                    handleQuantityChange(tt.ticketTypeId, qty - 1, tt.remainingQuota)
                                  }
                                  aria-label={`ลดจำนวน ${tt.name}`}
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={tt.remainingQuota}
                                  value={qty === 0 ? '' : qty}
                                  placeholder="0"
                                  disabled={isSoldOut}
                                  onChange={e =>
                                    handleQuantityChange(
                                      tt.ticketTypeId,
                                      Number(e.target.value),
                                      tt.remainingQuota,
                                    )
                                  }
                                  className="direct-qty-input"
                                  aria-label={`จำนวนบัตร ${tt.name}`}
                                />
                                <button
                                  type="button"
                                  className="secondary-button direct-btn-sm"
                                  disabled={isSoldOut || qty >= tt.remainingQuota}
                                  onClick={() =>
                                    handleQuantityChange(tt.ticketTypeId, qty + 1, tt.remainingQuota)
                                  }
                                  aria-label={`เพิ่มจำนวน ${tt.name}`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="direct-field-hint">ไม่พบประเภทบัตรในรอบการแสดงนี้</p>
                    )}
                  </div>

                  {/* Section 4: Recipient Account */}
                  <div className="direct-form-section">
                    <div className="direct-form-section-head">
                      <span className="direct-step-num">4</span>
                      <h4 className="direct-form-section-title">ระบุบัญชีผู้รับมอบบัตร</h4>
                    </div>

                    <div className="direct-radio-stack">
                      <label className={`direct-radio-option ${recipientMode === 'organizer' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="recipientMode"
                          checked={recipientMode === 'organizer'}
                          onChange={() => setRecipientMode('organizer')}
                          className="direct-radio-input"
                        />
                        <div className="direct-radio-content">
                          <span className="direct-radio-title">
                            <UsersIcon style={{ width: 16, height: 16, color: '#0f172a' }} />
                            <span>บัญชีผู้จัดงานของคอนเสิร์ตนี้</span>
                          </span>
                          <span className="direct-radio-desc">
                            {currentEvent
                              ? `${currentEvent.organizerName} (${currentEvent.organizerEmail})`
                              : 'ผู้จัดงานเจ้าของคอนเสิร์ต'}
                          </span>
                        </div>
                      </label>

                      <label className={`direct-radio-option ${recipientMode === 'owner' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="recipientMode"
                          checked={recipientMode === 'owner'}
                          onChange={() => setRecipientMode('owner')}
                          className="direct-radio-input"
                        />
                        <div className="direct-radio-content">
                          <span className="direct-radio-title">
                            <ShieldCheckIcon style={{ width: 16, height: 16, color: '#0f172a' }} />
                            <span>บัญชีผู้ดูแลระบบ (Owner)</span>
                          </span>
                          <span className="direct-radio-desc">
                            ออกในนามผู้ดูแลระบบส่วนกลางสำหรับสำรองหรือบริหารจัดการภายใน
                          </span>
                        </div>
                      </label>

                      <label className={`direct-radio-option ${recipientMode === 'custom' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="recipientMode"
                          checked={recipientMode === 'custom'}
                          onChange={() => setRecipientMode('custom')}
                          className="direct-radio-input"
                        />
                        <div className="direct-radio-content">
                          <span className="direct-radio-title">
                            <UserPlusIcon style={{ width: 16, height: 16, color: '#0f172a' }} />
                            <span>ระบุชื่อและอีเมลผู้รับเอง</span>
                          </span>
                          <span className="direct-radio-desc">
                            กำหนดชื่อและอีเมลของผู้รับมอบโดยตรง (เช่น แขก VIP หรือสปอนเซอร์)
                          </span>
                        </div>
                      </label>
                    </div>

                    {recipientMode === 'custom' && (
                      <div className="direct-form-grid-2" style={{ marginTop: '0.35rem' }}>
                        <div className="direct-field">
                          <label htmlFor="popup-custom-name" className="direct-field-label">
                            ชื่อ-นามสกุล ผู้รับมอบ
                          </label>
                          <input
                            id="popup-custom-name"
                            type="text"
                            value={customRecipientName}
                            onChange={e => setCustomRecipientName(e.target.value)}
                            placeholder="เช่น คุณสมศักดิ์ สุขใจ"
                            className="form-input-text"
                            required
                          />
                        </div>
                        <div className="direct-field">
                          <label htmlFor="popup-custom-email" className="direct-field-label">
                            อีเมลผู้รับมอบ (สำหรับส่งบัตร)
                          </label>
                          <input
                            id="popup-custom-email"
                            type="email"
                            value={customRecipientEmail}
                            onChange={e => setCustomRecipientEmail(e.target.value)}
                            placeholder="recipient@example.com"
                            className="form-input-text"
                            required
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section 5: Price Display Mode */}
                  <div className="direct-form-section">
                    <div className="direct-form-section-head">
                      <span className="direct-step-num">5</span>
                      <h4 className="direct-form-section-title">รูปแบบการแสดงราคาบนรูปบัตร (PNG)</h4>
                    </div>

                    <div className="direct-radio-grid-2">
                      <label
                        className={`direct-radio-option ${priceDisplayMode === 'face_value' ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="priceDisplayMode"
                          checked={priceDisplayMode === 'face_value'}
                          onChange={() => setPriceDisplayMode('face_value')}
                          className="direct-radio-input"
                        />
                        <div className="direct-radio-content">
                          <span className="direct-radio-title">แสดงราคาหน้าบัตรจริง</span>
                          <span className="direct-radio-desc">แสดงตัวเลขราคาปกติของบัตร (เช่น THB 500)</span>
                        </div>
                      </label>

                      <label
                        className={`direct-radio-option ${priceDisplayMode === 'complimentary' ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="priceDisplayMode"
                          checked={priceDisplayMode === 'complimentary'}
                          onChange={() => setPriceDisplayMode('complimentary')}
                          className="direct-radio-input"
                        />
                        <div className="direct-radio-content">
                          <span className="direct-radio-title">แสดงเป็น &quot;บัตรเชิญ&quot;</span>
                          <span className="direct-radio-desc">แสดงข้อความ บัตรเชิญ (COMPLIMENTARY)</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Section 6: Evidence / Reference Note & Email */}
                  <div className="direct-form-section">
                    <div className="direct-form-section-head">
                      <span className="direct-step-num">6</span>
                      <h4 className="direct-form-section-title">บันทึกหลักฐานอ้างอิงและการจัดส่ง</h4>
                    </div>

                    <div className="direct-field">
                      <label htmlFor="popup-ref-note" className="direct-field-label">
                        หลักฐานการโอน / หมายเหตุอ้างอิง (Reference Note)
                      </label>
                      <input
                        id="popup-ref-note"
                        type="text"
                        value={referenceNote}
                        onChange={e => setReferenceNote(e.target.value)}
                        placeholder="เช่น ผู้จัดโอนเงินตรงยอด 50,000 บาท เข้าบัญชีธนาคาร วันที่ 23/11 เวลา 14:30"
                        className="form-input-text"
                      />
                      <span className="direct-field-hint">
                        ข้อมูลนี้จะถูกเก็บเป็นหลักฐานในตารางประวัติและแสดงในอีเมลแจ้งเตือน
                      </span>
                    </div>

                    <label className="direct-radio-option" htmlFor="popup-send-email">
                      <input
                        id="popup-send-email"
                        type="checkbox"
                        checked={sendEmail}
                        onChange={e => setSendEmail(e.target.checked)}
                        className="direct-radio-input"
                      />
                      <div className="direct-radio-content">
                        <span className="direct-radio-title">จัดส่งอีเมลบัตรไปยังผู้รับมอบทันที</span>
                        <span className="direct-radio-desc">
                          หากไม่เกิน 20 ใบจะฝังภาพ QR Code ในอีเมล / หากเกิน 20 ใบจะส่งตารางสรุปรหัสบัตร
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="direct-modal-footer">
                  <div style={{ fontSize: '0.88rem', color: '#0f172a' }}>
                    รวมที่เลือก: <strong>{totalSelectedTickets.toLocaleString()} ใบ</strong> (มูลค่าหน้าบัตร{' '}
                    <strong>{formatBaht(totalSelectedValue)}</strong> บาท)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setIsIssueModalOpen(false)}
                      style={{ minHeight: 40, padding: '0.45rem 1rem' }}
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={totalSelectedTickets <= 0 || Boolean(currentSession?.isSessionEnded)}
                      style={{ minHeight: 40, padding: '0.45rem 1.2rem' }}
                    >
                      <span>
                        {currentSession?.isSessionEnded
                          ? 'รอบการแสดงสิ้นสุดแล้ว'
                          : `ตรวจสอบและออกบัตร (${totalSelectedTickets} ใบ)`}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              /* Confirmation Step inside Issue Modal */
              <>
                <div className="direct-modal-body">
                  <div className="direct-evidence-grid">
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">คอนเสิร์ต</span>
                      <span className="direct-evidence-value">{currentEvent?.eventTitle}</span>
                    </div>
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">รอบการแสดง</span>
                      <span className="direct-evidence-value">
                        {currentSession
                          ? `${formatDate(new Date(currentSession.startTime))} ${formatTime(new Date(currentSession.startTime))}`
                          : '-'}
                      </span>
                    </div>
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">ผู้รับมอบ</span>
                      <span className="direct-evidence-value">
                        {recipientMode === 'organizer'
                          ? `${currentEvent?.organizerName} (${currentEvent?.organizerEmail})`
                          : recipientMode === 'owner'
                            ? 'บัญชีผู้ดูแลระบบ (Owner)'
                            : `${customRecipientName} (${customRecipientEmail})`}
                      </span>
                    </div>
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">รูปแบบราคา</span>
                      <span className="direct-evidence-value">
                        {priceDisplayMode === 'face_value' ? 'แสดงราคาจริง' : 'บัตรเชิญ (COMPLIMENTARY)'}
                      </span>
                    </div>
                    <div className="direct-evidence-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="direct-evidence-label">หลักฐาน / หมายเหตุอ้างอิง</span>
                      <span className="direct-evidence-value">{referenceNote.trim() || '-'}</span>
                    </div>
                  </div>

                  <div className="direct-tier-list">
                    {Object.entries(ticketQuantities)
                      .filter(([_, qty]) => qty > 0)
                      .map(([tId, qty]) => {
                        const tt = currentSession?.ticketTypes.find(t => t.ticketTypeId === tId);
                        return (
                          <div key={tId} className="direct-tier-row">
                            <span style={{ fontWeight: 400 }}>{tt?.name || tId}</span>
                            <strong>{qty.toLocaleString()} ใบ</strong>
                          </div>
                        );
                      })}
                  </div>

                  <div
                    style={{
                      padding: '0.85rem 1rem',
                      background: '#fafafa',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      fontSize: '0.84rem',
                      color: '#334155',
                    }}
                  >
                    ระบบจะหักโควตาคงเหลือทันทีจำนวน <strong>{totalSelectedTickets} ใบ</strong>{' '}
                    และแยกยอดนี้ออกจากรายงานยอดขายและการเงินหน้าเว็บ
                  </div>
                </div>

                <div className="direct-modal-footer">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIssueStep('form')}
                    disabled={isSubmitting}
                    style={{ minHeight: 40, padding: '0.45rem 1rem' }}
                  >
                    ย้อนกลับไปแก้ไข
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleConfirmSubmitIssue}
                    disabled={isSubmitting}
                    style={{ minHeight: 40, padding: '0.45rem 1.25rem' }}
                  >
                    <CheckCircleIcon style={{ width: 16, height: 16 }} />
                    <span>{isSubmitting ? 'กำลังออกบัตร...' : 'ยืนยันตัดโควตาและออกบัตร'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          POPUP 2: Batch Detail, Evidence Audit & Tickets Modal
         ========================================================================= */}
      {viewingBatch && (
        <div
          className="direct-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
        >
          <div className="direct-modal-card wide">
            <div className="direct-modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span className="direct-order-code" style={{ fontSize: '1.05rem', fontWeight: 400 }}>
                    #{viewingBatch.orderId}
                  </span>
                  <h3 id="detail-modal-title" className="direct-modal-title" style={{ fontSize: '1.05rem', fontWeight: 400, margin: 0 }}>
                    {viewingBatch.eventTitle}
                  </h3>
                </div>
                <p className="direct-modal-subtitle">
                  รายละเอียดชุดบัตร หลักฐานอ้างอิง และการจัดการบัตรรายใบ
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setViewingBatch(null);
                  setBatchTickets([]);
                }}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div className="direct-modal-body">
              {isLoadingBatchDetail ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                  <RefreshIcon className="spinning" style={{ width: 24, height: 24, margin: '0 auto 0.5rem' }} />
                  <p>กำลังโหลดรายละเอียดและหลักฐาน...</p>
                </div>
              ) : (
                <>
                  {/* Evidence & Audit Summary */}
                  <div className="direct-evidence-grid">
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">ผู้รับมอบบัตร</span>
                      <span className="direct-evidence-value">{viewingBatch.buyerName}</span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{viewingBatch.buyerEmail}</span>
                    </div>
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">รอบการแสดง / สถานที่</span>
                      <span className="direct-evidence-value">
                        {formatDate(new Date(viewingBatch.sessionStartTime))}{' '}
                        {formatTime(new Date(viewingBatch.sessionStartTime))}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{viewingBatch.location}</span>
                    </div>
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">
                        {viewingBatch.cancelledTickets > 0 && viewingBatch.validTickets === 0
                          ? 'ผู้เพิกถอน / วันที่เพิกถอน'
                          : viewingBatch.cancelledTickets > 0
                            ? 'ผู้ออกบัตร / วันที่ออกบัตร / วันที่เพิกถอน'
                            : 'ผู้ออกบัตร / วันที่ออกบัตร'}
                      </span>
                      <span className="direct-evidence-value">{viewingBatch.issuedByName || 'Owner'}</span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        ออกบัตร: {formatDate(new Date(viewingBatch.createdAt))}{' '}
                        {formatTime(new Date(viewingBatch.createdAt))}
                        {viewingBatch.revokedAt && (
                          <>
                            <br />
                            <span style={{ color: '#dc2626' }}>
                              เพิกถอน: {formatDate(new Date(viewingBatch.revokedAt))}{' '}
                              {formatTime(new Date(viewingBatch.revokedAt))}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">จำนวนและรูปแบบราคา</span>
                      <span className="direct-evidence-value">
                        {batchTickets.length} ใบ (
                        {viewingBatch.priceDisplayMode === 'complimentary' ? 'บัตรเชิญ' : 'ราคาจริง'})
                      </span>
                    </div>
                    <div className="direct-evidence-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="direct-evidence-label">หลักฐาน / หมายเหตุอ้างอิง</span>
                      <span className="direct-evidence-value">
                        {viewingBatch.referenceNote || 'ไม่มีการบันทึกหมายเหตุเพิ่มเติม'}
                      </span>
                    </div>
                  </div>

                  {/* Batch Action Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 400, color: '#0f172a' }}>
                      รายการบัตรในชุด ({batchTickets.length} ใบ)
                    </h4>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {batchTickets.length > 0 && (batchTickets.every(t => t.status === 'cancelled') || (viewingBatch && viewingBatch.validTickets === 0 && viewingBatch.cancelledTickets > 0)) ? (
                        <span style={{ color: '#dc2626', fontSize: '0.82rem', padding: '0.2rem 0' }}>
                          ชุดบัตรนี้ถูกเพิกถอนสิทธิ์แล้วทั้งหมด (ไม่อนุญาตให้ดาวน์โหลดไฟล์)
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="secondary-button direct-btn-sm"
                            style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box' }}
                            onClick={handleResendEmail}
                            disabled={isResendingEmail}
                          >
                            <MailIcon style={{ width: 13, height: 13 }} />
                            <span>{isResendingEmail ? 'กำลังส่ง...' : 'ส่งอีเมลซ้ำ'}</span>
                          </button>

                          {revocableTicketsCount > 0 && (
                            <button
                              type="button"
                              className="secondary-button direct-btn-sm"
                              style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box', color: '#991b1b', borderColor: '#fecaca' }}
                              onClick={() => {
                                setRevokingTicketId(null);
                                setIsRevokingBatch(true);
                              }}
                            >
                              <span>เพิกถอนทั้งชุด ({revocableTicketsCount} ใบ)</span>
                            </button>
                          )}

                          <button
                            type="button"
                            className="primary-button direct-btn-sm"
                            style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box' }}
                            onClick={handleDownloadZip}
                            disabled={Boolean(zipProgress) || batchTickets.length === 0}
                          >
                            <DownloadIcon style={{ width: 13, height: 13 }} />
                            <span>
                              {zipProgress
                                ? `กำลังแพ็ก ZIP (${zipProgress.current}/${zipProgress.total})...`
                                : 'ดาวน์โหลด .ZIP + CSV'}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tickets Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {batchTickets.map((t, idx) => {
                      const isAdmitted = t.admissionStatus === 'inside' || t.status === 'used';
                      const isCancelled = t.status === 'cancelled';
                      return (
                        <div key={t.id} className="direct-ticket-row">
                          <div className="direct-ticket-row-left">
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8', width: 24 }}>#{idx + 1}</span>
                            <span className="direct-ticket-code">{t.ticketCode}</span>
                            <span style={{ fontSize: '0.84rem', color: '#475569' }}>
                              ประเภท: <strong>{t.ticketTypeName}</strong>
                            </span>
                            {isAdmitted ? (
                              <span className="direct-status-badge valid">
                                <QrCodeIcon style={{ width: 13, height: 13 }} />
                                <span>เข้างานแล้ว</span>
                              </span>
                            ) : isCancelled ? (
                              <span className="direct-status-badge revoked">เพิกถอนแล้ว</span>
                            ) : (
                              <span className="direct-status-badge valid">พร้อมใช้งาน</span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            {!isCancelled ? (
                              <button
                                type="button"
                                className="secondary-button direct-btn-sm"
                                style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box' }}
                                onClick={() => downloadTicketAsPng(t)}
                              >
                                <DownloadIcon style={{ width: 13, height: 13 }} />
                                <span>PNG</span>
                              </button>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>สิทธิ์ถูกเพิกถอน</span>
                            )}

                            {!isCancelled && (
                              <button
                                type="button"
                                className="secondary-button direct-btn-sm"
                                style={{
                                  color: isAdmitted ? '#94a3b8' : '#991b1b',
                                  borderColor: isAdmitted ? '#e2e8f0' : '#fecaca',
                                }}
                                disabled={isAdmitted}
                                title={
                                  isAdmitted
                                    ? 'บัตรถูกสแกนเข้างานแล้ว ไม่สามารถเพิกถอนได้'
                                    : 'เพิกถอนสิทธิ์บัตรใบนี้และคืนโควตา'
                                }
                                onClick={() => {
                                  setRevokingTicketId(t.id);
                                  setIsRevokingBatch(false);
                                }}
                              >
                                <span>เพิกถอน</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="direct-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setViewingBatch(null);
                  setBatchTickets([]);
                }}
                style={{ minHeight: 38, padding: '0.45rem 1rem' }}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          POPUP 3: Revoke Confirmation & Evidence Reason Modal
         ========================================================================= */}
      {(revokingTicketId || isRevokingBatch) && viewingBatch && (
        <div
          className="direct-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-modal-title"
        >
          <div className="direct-modal-card compact">
            <div className="direct-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangleIcon style={{ width: 20, height: 20, color: '#991b1b' }} />
                <h3 id="revoke-modal-title" className="direct-modal-title" style={{ color: '#991b1b' }}>
                  {revokingTicketId ? 'ยืนยันเพิกถอนบัตรรายใบ' : 'ยืนยันเพิกถอนบัตรทั้งชุด'}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setRevokingTicketId(null);
                  setIsRevokingBatch(false);
                }}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div className="direct-modal-body">
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#475569', lineHeight: 1.55 }}>
                {revokingTicketId
                  ? 'เมื่อเพิกถอนแล้ว บัตรใบนี้จะไม่สามารถสแกนเข้างานได้อีก และระบบจะคืนโควตา 1 ใบกลับเข้าสู่รอบการแสดงทันที'
                  : `ระบบจะเพิกถอนบัตรที่ยังไม่เข้างานทั้งหมด (${revocableTicketsCount} ใบ) และคืนโควตากลับเข้าสู่คอนเสิร์ตทันที`}
              </p>

              <div className="direct-field">
                <label htmlFor="revoke-reason-input" className="direct-field-label">
                  บันทึกเหตุผลการเพิกถอน (เก็บเป็นหลักฐาน)
                </label>
                <input
                  id="revoke-reason-input"
                  type="text"
                  value={revokeReason}
                  onChange={e => setRevokeReason(e.target.value)}
                  placeholder="เช่น ผู้จัดงานขอยกเลิก / ออกบัตรผิดประเภท"
                  className="form-input-text"
                />
              </div>
            </div>

            <div className="direct-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setRevokingTicketId(null);
                  setIsRevokingBatch(false);
                }}
                disabled={isSubmittingRevoke}
                style={{ minHeight: 38, padding: '0.45rem 1rem' }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleConfirmRevoke}
                disabled={isSubmittingRevoke}
                style={{
                  minHeight: 38,
                  padding: '0.45rem 1.1rem',
                  background: '#991b1b',
                  borderColor: '#991b1b',
                  color: '#ffffff',
                }}
              >
                {isSubmittingRevoke ? 'กำลังดำเนินการ...' : 'ยืนยันเพิกถอนและคืนโควตา'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
