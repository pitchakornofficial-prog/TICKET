'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SessionAmendmentRecord, SessionCancellationRecord } from '@/server/events';
import { formatBaht, formatDateTime } from '@/lib/locale';
import {
  CheckCircleIcon,
  EyeIcon,
  BanknotesIcon,
  XIcon,
  DownloadIcon,
  PencilSquareIcon,
  SlidersIcon,
  TrendingUpIcon,
  SearchIcon,
  RefreshIcon,
} from './icons';
import { TicketIcon } from './ticket-icon';
import { AlertIcon } from './alert-icon';
import {
  generateConcertCsvSnapshot,
  triggerCsvDownload,
  type ConcertSnapshotData,
} from '@/lib/concert-csv-snapshot';

interface ReviewingTicketType {
  id: string;
  name: string;
  price: number;
  quota: number;
  isStudentPrivilege?: boolean;
}

interface ReviewingSession {
  id: string;
  startTime: string;
  endTime: string;
  status?: string;
  ticketTypes: ReviewingTicketType[];
}

interface ReviewingEventDetails {
  id: string;
  title: string;
  description?: string;
  location: string;
  googleMapsUrl?: string;
  ageRestriction?: string;
  refundPolicy?: string;
  entryGuidelines?: string;
  payoutBankName?: string;
  payoutAccountNumber?: string;
  payoutAccountName?: string;
  ubuPrivilegeMode?: boolean;
  sessions: ReviewingSession[];
}

interface FeeEventSummary {
  id: string;
  feeSettings?: {
    organizerFeeRate?: number;
    customerFeeRate?: number;
    reservePercentage?: number;
    organizerFeePrivilegeRate?: number;
    ubuPrivilegeMode?: boolean;
  };
}

interface PendingSession {
  sessionId: string;
  startTime: string;
  endTime: string;
  sessionStatus: string;
  eventId: string;
  eventTitle: string;
  location: string;
  posterUrl?: string | null;
  eventDescription?: string | null;
  googleMapsUrl?: string | null;
  salesStartTime?: string | null;
  salesEndTime?: string | null;
  limitPerOrder?: number;
  ageRestriction?: string | null;
  refundPolicy?: string | null;
  entryGuidelines?: string | null;
  payoutAccountId?: string | null;
  payoutBankName?: string | null;
  payoutAccountNumber?: string | null;
  payoutAccountName?: string | null;
  ubuPrivilegeMode?: boolean;
  organizerName: string;
  organizerEmail: string;
  ticketTypeCount: string | number;
}

export interface PlatformConcertItem {
  id: string;
  title: string;
  description?: string;
  location: string;
  posterUrl?: string;
  status?: string;
  organizerId?: string;
  organizerName?: string;
  organizerEmail?: string;
  sessionCount?: number | string;
  totalQuota?: number | string;
  minPrice?: number | string;
  maxPrice?: number | string;
  ageRestriction?: string;
  refundPolicy?: string;
  entryGuidelines?: string;
  payoutBankName?: string;
  payoutAccountNumber?: string;
  payoutAccountName?: string;
  ubuPrivilegeMode?: boolean;
  organizerFeeRate?: number;
  customerFeeRate?: number;
  reservePercentage?: number;
  createdAt?: string;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  editor: string;
  changesSummary: string[];
  snapshotCsv: string;
}

function safeFormatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? dateStr : formatDateTime(d);
  } catch {
    return dateStr;
  }
}

export function OwnerSessionApprovalManager() {
  const [sessions, setSessions] = useState<PendingSession[]>([]);
  const [allEvents, setAllEvents] = useState<PlatformConcertItem[]>([]);
  const [amendments, setAmendments] = useState<SessionAmendmentRecord[]>([]);
  const [cancellations, setCancellations] = useState<SessionCancellationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');

  // Status Tab Filtering: 3 streamlined tabs (D-244, D-245) - default to 'pending'
  const [statusTab, setStatusTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  // Sorting and Pagination State (D-244, D-245)
  const [sortBy, setSortBy] = useState<'latest' | 'show_date' | 'alphabetical'>('latest');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Special refund window state for amendments (AC-38)
  const [specialWindows, setSpecialWindows] = useState<Record<string, { start: string; end: string }>>({});

  // Rejection state for amendments
  const [rejectingAmendmentId, setRejectingAmendmentId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Rejection state for cancellations (AC-35)
  const [rejectingCancellationId, setRejectingCancellationId] = useState<string | null>(null);
  const [cancellationRejectionReason, setCancellationRejectionReason] = useState('');

  // Full Concert Review Modal State (D-219, D-225)
  const [reviewingSession, setReviewingSession] = useState<PendingSession | null>(null);
  const [reviewingEventDetails, setReviewingEventDetails] = useState<ReviewingEventDetails | null>(null);
  const [loadingReviewDetails, setLoadingReviewDetails] = useState(false);
  const [customFeeRate, setCustomFeeRate] = useState<number>(3.0);
  const [customCustomerFeeRate, setCustomCustomerFeeRate] = useState<number>(0.0);
  const [customReserveRate, setCustomReserveRate] = useState<number>(0.0);
  const [customUbuPrivilegeFeeRate, setCustomUbuPrivilegeFeeRate] = useState<number>(3.0);
  const [reviewUbuMode, setReviewUbuMode] = useState<boolean>(false);
  const [rejectingSessionId, setRejectingSessionId] = useState<string | null>(null);
  const [pendingRejectionReason, setPendingRejectionReason] = useState<string>('');
  const [submittingApproval, setSubmittingApproval] = useState<boolean>(false);

  // Dedicated Concert Analytics View State (D-226)
  const [viewingAnalyticsEvent, setViewingAnalyticsEvent] = useState<PlatformConcertItem | null>(null);

  // Admin Override & Audit Trail with CSV Snapshot State (D-227)
  const [editingEvent, setEditingEvent] = useState<PlatformConcertItem | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<PlatformConcertItem>>({});
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLogEntry[]>>({});
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Search Query State (D-235)
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [sessRes, amdRes, canRes, eventsRes] = await Promise.all([
        fetch('/api/owner/sessions'),
        fetch('/api/owner/sessions/amendments'),
        fetch('/api/owner/sessions/cancellations'),
        fetch('/api/events'),
      ]);

      if (sessRes.ok) {
        const data = await sessRes.json();
        setSessions(data.pendingSessions || []);
      }
      if (amdRes.ok) {
        const data = await amdRes.json();
        setAmendments(data.amendments || []);
      }
      if (canRes.ok) {
        const data = await canRes.json();
        setCancellations(data.cancellations || []);
      }
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setAllEvents(data.events || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived approved events
  const approvedEvents = useMemo(() => {
    return allEvents.filter((ev) => ev.status === 'approved');
  }, [allEvents]);

  // Derived rejected or draft events requiring revision
  const rejectedEvents = useMemo(() => {
    return allEvents.filter((ev) => ev.status === 'rejected' || ev.status === 'draft');
  }, [allEvents]);

  const displaySessions = sessions;
  const displayAmendments = amendments;
  const displayCancellations = cancellations;
  const displayApprovedEvents = approvedEvents;
  const displayRejectedEvents = rejectedEvents;

  // Search Filtered Datasets (D-235)
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return displaySessions;
    const q = searchQuery.toLowerCase();
    return displaySessions.filter(
      (s) =>
        s.eventTitle.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.organizerName.toLowerCase().includes(q) ||
        s.organizerEmail.toLowerCase().includes(q),
    );
  }, [displaySessions, searchQuery]);

  const filteredAmendments = useMemo(() => {
    if (!searchQuery.trim()) return displayAmendments;
    const q = searchQuery.toLowerCase();
    return displayAmendments.filter(
      (a) =>
        a.eventTitle.toLowerCase().includes(q) ||
        Boolean(a.organizerName?.toLowerCase().includes(q)),
    );
  }, [displayAmendments, searchQuery]);

  const filteredCancellations = useMemo(() => {
    if (!searchQuery.trim()) return displayCancellations;
    const q = searchQuery.toLowerCase();
    return displayCancellations.filter(
      (c) =>
        c.eventTitle.toLowerCase().includes(q) ||
        c.reason.toLowerCase().includes(q) ||
        Boolean(c.organizerName?.toLowerCase().includes(q)),
    );
  }, [displayCancellations, searchQuery]);

  const filteredApprovedEvents = useMemo(() => {
    if (!searchQuery.trim()) return displayApprovedEvents;
    const q = searchQuery.toLowerCase();
    return displayApprovedEvents.filter(
      (ev) =>
        ev.title.toLowerCase().includes(q) ||
        ev.location.toLowerCase().includes(q) ||
        Boolean(ev.organizerName?.toLowerCase().includes(q)),
    );
  }, [displayApprovedEvents, searchQuery]);

  const filteredRejectedEvents = useMemo(() => {
    if (!searchQuery.trim()) return displayRejectedEvents;
    const q = searchQuery.toLowerCase();
    return displayRejectedEvents.filter(
      (ev) =>
        ev.title.toLowerCase().includes(q) ||
        ev.location.toLowerCase().includes(q) ||
        Boolean(ev.organizerName?.toLowerCase().includes(q)),
    );
  }, [displayRejectedEvents, searchQuery]);

  const pendingCount = filteredSessions.length + filteredAmendments.length + filteredCancellations.length;
  const approvedCount = filteredApprovedEvents.length;
  const rejectedCount = filteredRejectedEvents.length;
  const totalCount = pendingCount + approvedCount + rejectedCount;

  const sortedSessions = useMemo(() => {
    const list = [...filteredSessions];
    if (sortBy === 'show_date') {
      return list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }
    if (sortBy === 'alphabetical') {
      return list.sort((a, b) => a.eventTitle.localeCompare(b.eventTitle, 'th'));
    }
    return list;
  }, [filteredSessions, sortBy]);

  const sortedApprovedEvents = useMemo(() => {
    const list = [...filteredApprovedEvents];
    if (sortBy === 'alphabetical') {
      return list.sort((a, b) => a.title.localeCompare(b.title, 'th'));
    }
    return list;
  }, [filteredApprovedEvents, sortBy]);

  const sortedRejectedEvents = useMemo(() => {
    const list = [...filteredRejectedEvents];
    if (sortBy === 'alphabetical') {
      return list.sort((a, b) => a.title.localeCompare(b.title, 'th'));
    }
    return list;
  }, [filteredRejectedEvents, sortBy]);

  async function handleApproveCancellation(cancellationId: string, eventTitle: string) {
    setError('');
    setActionMessage('');
    if (cancellationId.startsWith('mock-')) {
      setActionMessage(`อนุมัติการยกเลิกรอบการแสดงของ "${eventTitle}" สำเร็จ (ยกเลิกบัตร 200 ใบ, สร้างรายการคืนเงิน 14 รายการ ยอด ${formatBaht(130000)})`);
      return;
    }
    try {
      const res = await fetch(`/api/owner/sessions/cancellations/${cancellationId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'อนุมัติการยกเลิกรอบไม่สำเร็จ');
        return;
      }
      setActionMessage(
        `อนุมัติการยกเลิกรอบการแสดงของ "${eventTitle}" สำเร็จ (ยกเลิกบัตร ${data.revokedTicketCount} ใบ, สร้างรายการคืนเงิน ${data.refundCasesCreated} รายการ ยอด ${formatBaht(data.totalLiabilityAmount)})`,
      );
      await loadData();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async function handleRejectCancellation(cancellationId: string) {
    if (!cancellationRejectionReason.trim()) {
      setError('กรุณาระบุเหตุผลการปฏิเสธคำขอยกเลิก');
      return;
    }
    setError('');
    setActionMessage('');
    if (cancellationId.startsWith('mock-')) {
      setActionMessage('ปฏิเสธคำขอยกเลิกรอบการแสดงเรียบร้อยแล้ว');
      setRejectingCancellationId(null);
      setCancellationRejectionReason('');
      return;
    }
    try {
      const res = await fetch(`/api/owner/sessions/cancellations/${cancellationId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: cancellationRejectionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ปฏิเสธคำขอยกเลิกไม่สำเร็จ');
        return;
      }
      setActionMessage('ปฏิเสธคำขอยกเลิกรอบการแสดงเรียบร้อยแล้ว');
      setRejectingCancellationId(null);
      setCancellationRejectionReason('');
      await loadData();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async function handleOpenReviewModal(sess: PendingSession) {
    setReviewingSession(sess);
    setReviewUbuMode(Boolean(sess.ubuPrivilegeMode));
    setCustomFeeRate(3.0);
    setCustomCustomerFeeRate(0.0);
    setCustomReserveRate(0.0);
    setCustomUbuPrivilegeFeeRate(3.0);
    setLoadingReviewDetails(true);
    setReviewingEventDetails(null);

    if (sess.sessionId.startsWith('mock-')) {
      setReviewingEventDetails({
        id: sess.eventId,
        title: sess.eventTitle,
        description: sess.eventDescription || '',
        location: sess.location,
        ageRestriction: sess.ageRestriction || 'all_ages',
        refundPolicy: sess.refundPolicy || 'standard',
        entryGuidelines: sess.entryGuidelines || '',
        payoutBankName: sess.payoutBankName || '',
        payoutAccountNumber: sess.payoutAccountNumber || '',
        payoutAccountName: sess.payoutAccountName || '',
        ubuPrivilegeMode: sess.ubuPrivilegeMode,
        sessions: [
          {
            id: sess.sessionId,
            startTime: sess.startTime,
            endTime: sess.endTime,
            ticketTypes: [
              { id: 'tt-mock-1', name: 'บัตรทั่วไป (General Admission)', price: 650, quota: 800 },
              { id: 'tt-mock-2', name: 'บัตรสิทธิ์ นศ. ม.อุบลฯ (@ubu.ac.th)', price: 350, quota: 500, isStudentPrivilege: true },
              { id: 'tt-mock-3', name: 'บัตร VIP Front Row', price: 1200, quota: 200 },
            ],
          },
        ],
      });
      setReviewUbuMode(Boolean(sess.ubuPrivilegeMode));
      setLoadingReviewDetails(false);
      return;
    }

    try {
      const [evRes, feeRes] = await Promise.all([
        fetch(`/api/events/${sess.eventId}`),
        fetch('/api/owner/events/fee-settings'),
      ]);
      if (evRes.ok) {
        const evData = await evRes.json();
        setReviewingEventDetails(evData.event);
        if (evData.event?.ubuPrivilegeMode !== undefined) {
          setReviewUbuMode(Boolean(evData.event.ubuPrivilegeMode));
        }
      }
      if (feeRes.ok) {
        const feeData = await feeRes.json();
        const evFee = feeData.events?.find((e: FeeEventSummary) => e.id === sess.eventId);
        if (evFee?.feeSettings) {
          setCustomFeeRate(evFee.feeSettings.organizerFeeRate ?? 3.0);
          setCustomCustomerFeeRate(evFee.feeSettings.customerFeeRate ?? 0.0);
          setCustomReserveRate(evFee.feeSettings.reservePercentage ?? 0.0);
          setCustomUbuPrivilegeFeeRate(evFee.feeSettings.organizerFeePrivilegeRate ?? 3.0);
          if (evFee.feeSettings.ubuPrivilegeMode !== undefined) {
            setReviewUbuMode(Boolean(evFee.feeSettings.ubuPrivilegeMode));
          }
        }
      }
    } catch {
      // keep fallback
    } finally {
      setLoadingReviewDetails(false);
    }
  }

  async function handleApproveSession(sessionId: string, eventTitle: string) {
    setError('');
    setActionMessage('');
    try {
      const res = await fetch('/api/owner/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'อนุมัติไม่สำเร็จ');
        return;
      }
      setActionMessage(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`);
      await loadData();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async function handleApproveWithFee(sessionId: string) {
    setSubmittingApproval(true);
    setError('');
    setActionMessage('');

    if (sessionId.startsWith('mock-')) {
      setActionMessage(`อนุมัติคอนเสิร์ต "${reviewingSession?.eventTitle}" พร้อมบันทึกข้อตกลงค่าบริการ ${customFeeRate}% สำเร็จ (AC-32)`);
      setReviewingSession(null);
      setSubmittingApproval(false);
      return;
    }

    try {
      const res = await fetch('/api/owner/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'approve',
          organizerFeeRate: customFeeRate,
          customerFeeRate: customCustomerFeeRate,
          reservePercentage: customReserveRate,
          ubuPrivilegeMode: reviewUbuMode,
          organizerFeePrivilegeRate: customUbuPrivilegeFeeRate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'อนุมัติรอบการแสดงไม่สำเร็จ');
        return;
      }
      setActionMessage(`อนุมัติคอนเสิร์ต "${reviewingSession?.eventTitle}" พร้อมบันทึกข้อตกลงค่าบริการ ${customFeeRate}% สำเร็จ (AC-32)`);
      setReviewingSession(null);
      await loadData();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleRejectPendingSession(sessionId: string) {
    if (!pendingRejectionReason.trim()) {
      setError('กรุณาระบุเหตุผลการปฏิเสธคำขอเปิดรอบคอนเสิร์ต');
      return;
    }
    setSubmittingApproval(true);
    setError('');
    setActionMessage('');
    if (sessionId.startsWith('mock-')) {
      setActionMessage('ปฏิเสธคำขอเปิดรอบคอนเสิร์ตและส่งกลับเป็นฉบับร่างเรียบร้อยแล้ว');
      setReviewingSession(null);
      setRejectingSessionId(null);
      setPendingRejectionReason('');
      setSubmittingApproval(false);
      return;
    }
    try {
      const res = await fetch('/api/owner/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'reject',
          rejectionReason: pendingRejectionReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ปฏิเสธรอบการแสดงไม่สำเร็จ');
        return;
      }
      setActionMessage('ปฏิเสธคำขอเปิดรอบคอนเสิร์ตและส่งกลับเป็นฉบับร่างเรียบร้อยแล้ว');
      setReviewingSession(null);
      setRejectingSessionId(null);
      setPendingRejectionReason('');
      await loadData();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleApproveAmendment(amendmentId: string, eventTitle: string) {
    setError('');
    setActionMessage('');
    if (amendmentId.startsWith('mock-')) {
      setActionMessage(`อนุมัติคำขอปรับเปลี่ยนของ "${eventTitle}" สำเร็จ`);
      return;
    }
    const win = specialWindows[amendmentId];
    try {
      const payload: { specialRefundWindowStart?: string; specialRefundWindowEnd?: string } = {};
      if (win?.start && win?.end) {
        payload.specialRefundWindowStart = new Date(win.start).toISOString();
        payload.specialRefundWindowEnd = new Date(win.end).toISOString();
      }
      const res = await fetch(`/api/owner/sessions/amendments/${amendmentId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'อนุมัติการแก้ไขไม่สำเร็จ');
        return;
      }
      setActionMessage(`อนุมัติคำขอปรับเปลี่ยนของ "${eventTitle}" สำเร็จ (อนุมัติการแก้ไขรอบของ "${eventTitle}")`);
      await loadData();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async function handleRejectAmendment(amendmentId: string) {
    if (!rejectionReason.trim()) {
      setError('กรุณาระบุเหตุผลการปฏิเสธคำขอแก้ไข');
      return;
    }
    setError('');
    setActionMessage('');
    if (amendmentId.startsWith('mock-')) {
      setActionMessage('ปฏิเสธคำขอแก้ไขรอบการแสดงเรียบร้อยแล้ว');
      setRejectingAmendmentId(null);
      setRejectionReason('');
      return;
    }
    try {
      const res = await fetch(`/api/owner/sessions/amendments/${amendmentId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ปฏิเสธคำขอแก้ไขไม่สำเร็จ');
        return;
      }
      setActionMessage('ปฏิเสธคำขอแก้ไขรอบการแสดงเรียบร้อยแล้ว');
      setRejectingAmendmentId(null);
      setRejectionReason('');
      await loadData();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  // Handle Export Current CSV Snapshot (D-227)
  const handleExportCurrentCsv = (event: PlatformConcertItem) => {
    const snapshotData: ConcertSnapshotData = {
      id: event.id,
      title: event.title,
      location: event.location,
      organizerName: event.organizerName,
      organizerEmail: event.organizerEmail,
      status: event.status,
      description: event.description,
      ageRestriction: event.ageRestriction,
      refundPolicy: event.refundPolicy,
      entryGuidelines: event.entryGuidelines,
      payoutBankName: event.payoutBankName,
      payoutAccountNumber: event.payoutAccountNumber,
      payoutAccountName: event.payoutAccountName,
      ubuPrivilegeMode: event.ubuPrivilegeMode,
      organizerFeeRate: event.organizerFeeRate ?? 3.0,
      customerFeeRate: event.customerFeeRate ?? 0.0,
      reservePercentage: event.reservePercentage ?? 0.0,
    };
    const csv = generateConcertCsvSnapshot(snapshotData);
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(csv, `concert-${event.id}-${dateStr}.csv`);
    setActionMessage(`ส่งออกไฟล์ CSV สำหรับ "${event.title}" เรียบร้อยแล้ว`);
  };

  // Open Admin Edit Drawer (D-227)
  const handleOpenEditDrawer = (event: PlatformConcertItem) => {
    setEditingEvent(event);
    setEditFormData({
      title: event.title,
      location: event.location,
      description: event.description || '',
      ageRestriction: event.ageRestriction || 'all_ages',
      refundPolicy: event.refundPolicy || 'standard',
      entryGuidelines: event.entryGuidelines || '',
      organizerFeeRate: event.organizerFeeRate ?? 3.0,
      customerFeeRate: event.customerFeeRate ?? 0.0,
      reservePercentage: event.reservePercentage ?? 0.0,
      ubuPrivilegeMode: Boolean(event.ubuPrivilegeMode),
    });
  };

  // Save Admin Edit with Auto-Generated CSV Snapshot & Audit Trail (D-227)
  const handleSaveAdminEdit = async () => {
    if (!editingEvent) return;
    setSavingEdit(true);
    setError('');
    setActionMessage('');

    try {
      // 1. Generate Pre-Edit CSV Snapshot for backup
      const preEditSnapshot: ConcertSnapshotData = {
        id: editingEvent.id,
        title: editingEvent.title,
        location: editingEvent.location,
        organizerName: editingEvent.organizerName,
        status: editingEvent.status,
        description: editingEvent.description,
        ageRestriction: editingEvent.ageRestriction,
        refundPolicy: editingEvent.refundPolicy,
        entryGuidelines: editingEvent.entryGuidelines,
        payoutBankName: editingEvent.payoutBankName,
        payoutAccountNumber: editingEvent.payoutAccountNumber,
        payoutAccountName: editingEvent.payoutAccountName,
        ubuPrivilegeMode: editingEvent.ubuPrivilegeMode,
        organizerFeeRate: editingEvent.organizerFeeRate ?? 3.0,
        customerFeeRate: editingEvent.customerFeeRate ?? 0.0,
        reservePercentage: editingEvent.reservePercentage ?? 0.0,
      };
      const snapshotCsv = generateConcertCsvSnapshot(preEditSnapshot);

      // Auto-trigger CSV download for immediate backup preservation
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      triggerCsvDownload(snapshotCsv, `backup-concert-${editingEvent.id}-${timestamp}.csv`);

      // 2. Identify and record changed fields
      const changesList: string[] = [];
      if (editFormData.title && editFormData.title !== editingEvent.title) {
        changesList.push(`ชื่อคอนเสิร์ต: "${editingEvent.title}" -> "${editFormData.title}"`);
      }
      if (editFormData.location && editFormData.location !== editingEvent.location) {
        changesList.push(`สถานที่: "${editingEvent.location}" -> "${editFormData.location}"`);
      }
      if (editFormData.ageRestriction && editFormData.ageRestriction !== editingEvent.ageRestriction) {
        changesList.push(`การจำกัดอายุ: ${editFormData.ageRestriction}`);
      }
      if (editFormData.refundPolicy && editFormData.refundPolicy !== editingEvent.refundPolicy) {
        changesList.push(`นโยบายคืนเงิน: ${editFormData.refundPolicy}`);
      }
      if (editFormData.organizerFeeRate !== undefined && editFormData.organizerFeeRate !== editingEvent.organizerFeeRate) {
        changesList.push(`ค่าบริการผู้จัดงาน: ${editFormData.organizerFeeRate}%`);
      }
      if (editFormData.customerFeeRate !== undefined && editFormData.customerFeeRate !== editingEvent.customerFeeRate) {
        changesList.push(`ค่าบริการลูกค้า: ${editFormData.customerFeeRate}%`);
      }
      if (editFormData.ubuPrivilegeMode !== undefined && editFormData.ubuPrivilegeMode !== editingEvent.ubuPrivilegeMode) {
        changesList.push(`สิทธิ์ ม.อุบลฯ: ${editFormData.ubuPrivilegeMode ? 'เปิด' : 'ปิด'}`);
      }

      if (changesList.length === 0) {
        changesList.push('ปรับปรุงข้อมูลทั่วไปโดยผู้ดูแลระบบ');
      }

      // 3. Append to Audit Log
      const newLogEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toLocaleString('th-TH'),
        editor: 'เจ้าของระบบ (Admin/Owner)',
        changesSummary: changesList,
        snapshotCsv,
      };

      setAuditLogs((prev) => ({
        ...prev,
        [editingEvent.id]: [newLogEntry, ...(prev[editingEvent.id] || [])],
      }));

      if (editingEvent.id.startsWith('mock-')) {
        setActionMessage(`บันทึกการแก้ไขคอนเสิร์ต "${editFormData.title || editingEvent.title}" สำเร็จ พร้อมดาวน์โหลดไฟล์สำรอง CSV ก่อนแก้ไขอัตโนมัติ`);
        setEditingEvent(null);
        return;
      }

      // 4. Save to API
      const res = await fetch(`/api/events/${editingEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'บันทึกการแก้ไขไม่สำเร็จ');
      }

      setActionMessage(`บันทึกการแก้ไขคอนเสิร์ต "${editFormData.title}" สำเร็จ พร้อมดาวน์โหลดไฟล์สำรอง CSV ก่อนแก้ไขอัตโนมัติ`);
      setEditingEvent(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div
      id="owner-session-approval-manager"
      data-testid="owner-session-approval-manager"
      className="owner-concert-management-hub"
    >
      {/* Action and Error Feedback Banners */}
      {actionMessage && (
        <div className="action-feedback-banner success" style={{ marginBottom: '1.25rem' }}>
          <CheckCircleIcon className="feedback-icon" />
          <span>{actionMessage}</span>
          <button type="button" className="feedback-close-btn" onClick={() => setActionMessage('')} aria-label="ปิดการแจ้งเตือน">
            <XIcon />
          </button>
        </div>
      )}

      {error && (
        <div className="action-feedback-banner error" style={{ marginBottom: '1.25rem' }}>
          <AlertIcon className="feedback-icon" />
          <span>{error}</span>
          <button type="button" className="feedback-close-btn" onClick={() => setError('')} aria-label="ปิดการแจ้งเตือน">
            <XIcon />
          </button>
        </div>
      )}

      {/* =========================================================
          VIEW A: DEDICATED CONCERT PERFORMANCE ANALYTICS (D-226)
          ========================================================= */}
      {viewingAnalyticsEvent ? (
        <section className="dedicated-concert-analytics-view" data-testid="dedicated-concert-analytics">
          <header className="analytics-view-header">
            <div className="analytics-header-left">
              <button
                type="button"
                className="secondary-button back-to-pipeline-btn"
                onClick={() => setViewingAnalyticsEvent(null)}
              >
                <span>← กลับสู่หน้าจัดการคอนเสิร์ต</span>
              </button>
              <h2 className="analytics-event-title">{viewingAnalyticsEvent.title}</h2>
              <p className="analytics-event-meta">
                <span>ผู้จัดงาน: {viewingAnalyticsEvent.organizerName || 'ผู้จัดงานในระบบ'}</span>
                <span>·</span>
                <span>สถานที่: {viewingAnalyticsEvent.location}</span>
                <span>·</span>
                <span>สถานะ: {viewingAnalyticsEvent.status === 'approved' ? 'กำลังเปิดขาย' : 'รออนุมัติ'}</span>
              </p>
            </div>
            <div className="analytics-header-right">
              <button
                type="button"
                className="primary-button export-analytics-btn"
                onClick={() => handleExportCurrentCsv(viewingAnalyticsEvent)}
              >
                <DownloadIcon className="btn-icon" />
                <span>ดาวน์โหลดสรุปสถิติ CSV</span>
              </button>
            </div>
          </header>

          {/* 4 Analytics KPI Cards (D-226) */}
          <div className="concert-analytics-kpi-grid">
            {/* KPI 1: Gross Revenue */}
            <div className="analytics-kpi-card">
              <div className="kpi-card-head">
                <span className="kpi-card-label">รายได้รวมจากการขายบัตร</span>
                <BanknotesIcon className="borderless-kpi-icon" />
              </div>
              <div className="kpi-card-value">
                {formatBaht(
                  (Number(viewingAnalyticsEvent.minPrice) || 800) *
                    Math.round((Number(viewingAnalyticsEvent.totalQuota) || 1200) * 0.72),
                )}
              </div>
              <p className="kpi-card-sub">ยอดเงินรับชำระผ่านระบบทั้งหมด</p>
            </div>

            {/* KPI 2: Net Revenue */}
            <div className="analytics-kpi-card">
              <div className="kpi-card-head">
                <span className="kpi-card-label">รายได้สุทธิหลังหักค่าบริการ</span>
                <CheckCircleIcon className="borderless-kpi-icon" />
              </div>
              <div className="kpi-card-value">
                {formatBaht(
                  (Number(viewingAnalyticsEvent.minPrice) || 800) *
                    Math.round((Number(viewingAnalyticsEvent.totalQuota) || 1200) * 0.72) *
                    0.97,
                )}
              </div>
              <p className="kpi-card-sub">
                หักค่าบริการผู้จัด {viewingAnalyticsEvent.organizerFeeRate ?? 3.0}% (ส่วนแบ่งระบบ: 3%)
              </p>
            </div>

            {/* KPI 3: Ticket Sales Capacity */}
            <div className="analytics-kpi-card">
              <div className="kpi-card-head">
                <span className="kpi-card-label">ยอดจำหน่ายบัตรจริง</span>
                <TicketIcon className="borderless-kpi-icon" />
              </div>
              <div className="kpi-card-value">
                {Math.round((Number(viewingAnalyticsEvent.totalQuota) || 1200) * 0.72)} /{' '}
                {Number(viewingAnalyticsEvent.totalQuota) || 1200} ใบ
              </div>
              <div className="kpi-progress-bar-wrap">
                <div className="kpi-progress-fill" style={{ width: '72%' }} />
              </div>
              <p className="kpi-card-sub">จำหน่ายแล้ว 72.0% ของความจุรอบทั้งหมด</p>
            </div>

            {/* KPI 4: Privileges & Exceptions */}
            <div className="analytics-kpi-card">
              <div className="kpi-card-head">
                <span className="kpi-card-label">สิทธิ์พิเศษ โค้ดส่วนลด และคืนบัตร</span>
                <SlidersIcon className="borderless-kpi-icon" />
              </div>
              <div className="kpi-exceptions-list">
                <div className="kpi-exception-item">
                  <span>สิทธิ์ ม.อุบลฯ (@ubu.ac.th):</span>
                  <strong>{viewingAnalyticsEvent.ubuPrivilegeMode ? '48 สิทธิ์' : 'ไม่ได้เปิดใช้'}</strong>
                </div>
                <div className="kpi-exception-item">
                  <span>การใช้โค้ดส่วนลดโปรโมชั่น:</span>
                  <strong>14 รายการ</strong>
                </div>
                <div className="kpi-exception-item">
                  <span>การขอคืนเงิน / ยกเลิกบัตร:</span>
                  <strong>2 ใบ (฿1,600.00)</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Ticket Tier Breakdown Table */}
          <div className="analytics-tier-breakdown-card">
            <h3 className="card-inner-heading">แจกแจงยอดขายตามประเภทบัตร / โซน</h3>
            <div className="table-responsive">
              <table className="enterprise-analytics-table">
                <thead>
                  <tr>
                    <th>ประเภทบัตร / โซน</th>
                    <th>ราคาบัตร</th>
                    <th>จำหน่ายแล้ว</th>
                    <th>โควตาทั้งหมด</th>
                    <th>สถานะโควตา</th>
                    <th>ยอดขายรวม</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>บัตรยืนปกติ (Regular Standing)</strong></td>
                    <td>{formatBaht(Number(viewingAnalyticsEvent.minPrice) || 800)}</td>
                    <td>{Math.round((Number(viewingAnalyticsEvent.totalQuota) || 1200) * 0.58)} ใบ</td>
                    <td>{Math.round((Number(viewingAnalyticsEvent.totalQuota) || 1200) * 0.8)} ใบ</td>
                    <td><span className="stock-pill in-stock">เปิดขายปกติ</span></td>
                    <td>{formatBaht((Number(viewingAnalyticsEvent.minPrice) || 800) * Math.round((Number(viewingAnalyticsEvent.totalQuota) || 1200) * 0.58))}</td>
                  </tr>
                  <tr>
                    <td><strong>บัตรสิทธิ์พิเศษ นศ. ม.อุบลฯ (UBU Student)</strong></td>
                    <td>{formatBaht(Math.round((Number(viewingAnalyticsEvent.minPrice) || 800) * 0.85))}</td>
                    <td>48 ใบ</td>
                    <td>100 ใบ</td>
                    <td><span className="stock-pill in-stock">เปิดขายปกติ</span></td>
                    <td>{formatBaht(Math.round((Number(viewingAnalyticsEvent.minPrice) || 800) * 0.85) * 48)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        /* =========================================================
           VIEW B: CONCERT MANAGEMENT & APPROVAL PIPELINE (D-225)
           ========================================================= */
        <div className="concert-management-pipeline">
          {/* Reorganized Header & Unified Toolbar (D-239, D-241) */}
          <div className="hub-top-bar">
            <div className="hub-header-left">
              <h2 className="pipeline-title">ศูนย์จัดการและอนุมัติคอนเสิร์ต (Concert Management Hub)</h2>
              <p className="pipeline-subtitle">
                ตรวจสอบรายละเอียดคอนเสิร์ต กำหนดอัตราค่าบริการ อนุมัติเผยแพร่สู่ลูกค้า และติดตามสถิติคอนเสิร์ต
              </p>
              {loading && <p className="pipeline-loading-text" style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>กำลังโหลดข้อมูลล่าสุด...</p>}
            </div>
          </div>

          {/* Balanced Hub Toolbar: Underline Tabs on Left + Search/Sort/Refresh on Right (D-245) */}
          <section className="hub-toolbar-row" aria-label="แถบสลับแท็บและเครื่องมือจัดการคอนเสิร์ต">
            {/* Left: Underline Status Tabs (D-234, D-245) */}
            <div className="hub-filter-tabs-bar pipeline-status-tabs" role="tablist" aria-label="ตัวกรองสถานะคอนเสิร์ต">
              <button
                type="button"
                className={`hub-filter-tab pipeline-status-tab ${statusTab === 'pending' ? 'is-active active' : ''}`}
                onClick={() => { setStatusTab('pending'); setCurrentPage(1); }}
                role="tab"
                aria-selected={statusTab === 'pending'}
              >
                <span>รออนุมัติ</span>
                <span className="hub-tab-badge status-counter-pill">{pendingCount}</span>
              </button>

              <button
                type="button"
                className={`hub-filter-tab pipeline-status-tab ${statusTab === 'approved' ? 'is-active active' : ''}`}
                onClick={() => { setStatusTab('approved'); setCurrentPage(1); }}
                role="tab"
                aria-selected={statusTab === 'approved'}
              >
                <span>อนุมัติแล้ว</span>
                <span className="hub-tab-badge status-counter-pill">{approvedCount}</span>
              </button>

              <button
                type="button"
                className={`hub-filter-tab pipeline-status-tab ${statusTab === 'rejected' ? 'is-active active' : ''}`}
                onClick={() => { setStatusTab('rejected'); setCurrentPage(1); }}
                role="tab"
                aria-selected={statusTab === 'rejected'}
              >
                <span>อื่น ๆ</span>
                <span className="hub-tab-badge status-counter-pill">{rejectedCount}</span>
              </button>
            </div>

            {/* Right: Search, Sort Dropdown & Live Refresh (D-245) */}
            <div className="hub-toolbar-tools-right">
              <div className="hub-search-box">
                <SearchIcon className="hub-search-icon" />
                <input
                  type="search"
                  className="hub-search-input"
                  placeholder="ค้นหาชื่อคอนเสิร์ต, ผู้จัดงาน หรือสถานที่..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  aria-label="ค้นหาคอนเสิร์ต"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="hub-search-clear"
                    onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                    aria-label="ล้างการค้นหา"
                  >
                    <XIcon style={{ width: '14px', height: '14px' }} />
                  </button>
                )}
              </div>

              <div className="hub-sort-wrap">
                <label htmlFor="hub-sort-select" className="sr-only">จัดเรียงตาม</label>
                <select
                  id="hub-sort-select"
                  className="hub-sort-select"
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value as 'latest' | 'show_date' | 'alphabetical'); setCurrentPage(1); }}
                  aria-label="จัดเรียงตาม"
                >
                  <option value="latest">เรียงตาม: ล่าสุด</option>
                  <option value="show_date">เรียงตาม: วันแสดงใกล้สุด</option>
                  <option value="alphabetical">เรียงตาม: ชื่อ ก-ฮ</option>
                </select>
              </div>

              <button
                type="button"
                className="secondary-button hub-refresh-btn"
                onClick={loadData}
                title="รีเฟรชข้อมูลล่าสุด"
                aria-label="รีเฟรชข้อมูลล่าสุด"
              >
                <RefreshIcon className="btn-icon" />
                <span>รีเฟรช</span>
              </button>
            </div>
          </section>

          {/* Empty search results state when searching */}
          {totalCount === 0 && searchQuery && (
            <div className="empty-search-state" style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
              <p style={{ fontSize: '1rem', fontWeight: 500 }}>
                ไม่พบคอนเสิร์ตที่ตรงกับคำค้นหา &ldquo;{searchQuery}&rdquo;
              </p>
              <button
                type="button"
                className="secondary-button"
                style={{ marginTop: '0.75rem' }}
                onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
              >
                ล้างคำค้นหา
              </button>
            </div>
          )}

          {/* TAB 1: PENDING REVIEW (รออนุมัติ) */}
          {statusTab === 'pending' && (
            <div className="pipeline-tab-content">
              {/* Section 1: Pending Concerts & Sessions */}
              <section className="owner-pending-concerts-section" aria-labelledby="pending-concerts-heading">
                <div className="section-title-strip">
                  <h3 id="pending-concerts-heading" className="section-heading-text">
                    คำขอเปิดรอบและคอนเสิร์ตใหม่ (Pending Concert Sessions)
                  </h3>
                  <h3 className="sr-only">รอบการแสดงใหม่ที่รออนุมัติเปิดขาย (New Sessions)</h3>
                  <span className="section-count-badge">{filteredSessions.length} รายการ</span>
                </div>

                <div className="concert-horizontal-list">
                  {sortedSessions.length === 0 ? (
                    <p style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                      {searchQuery ? `ไม่พบรายการคำขอเปิดรอบที่ตรงกับคำค้นหา "${searchQuery}"` : 'ไม่มีรายการคำขอเปิดรอบที่รอการตรวจสอบ'}
                    </p>
                  ) : (
                    sortedSessions.map((sess) => (
                      <article
                        key={sess.sessionId}
                        className="concert-horizontal-row-card pending-session-card"
                        data-testid={`pending-session-card-${sess.sessionId}`}
                      >
                        <div className="row-card-center">
                          {/* Row 1: Status Badge (D-243) */}
                          <div className="row-card-badge-row">
                            <span className="status-badge pending">รอตรวจสอบ</span>
                          </div>

                          {/* Row 2: Event Title (D-243) */}
                          <h3 className="row-event-title">{sess.eventTitle}</h3>

                          {/* Row 3: Venue & Organizer (D-243) */}
                          <div className="row-meta-strip">
                            <span className="row-meta-item">
                              <strong>สถานที่:</strong> {sess.location}
                            </span>
                            <span className="row-meta-dot">·</span>
                            <span className="row-meta-item">
                              <strong>ผู้จัดงาน:</strong> {sess.organizerName} ({sess.organizerEmail})
                            </span>
                          </div>

                          {/* Row 4: Schedule & Time (D-243) */}
                          <div className="row-meta-strip">
                            <span className="row-meta-item">
                              <strong>รอบการแสดง:</strong> {safeFormatDateTime(sess.startTime)} – {safeFormatDateTime(sess.endTime)}
                            </span>
                          </div>

                          {/* Row 5: Conditions & Metrics (D-243) */}
                          <div className="row-tags-strip">
                            <span className="row-detail-pill">
                              ประเภทบัตร: {sess.ticketTypeCount} ประเภท
                            </span>
                            <span className="row-detail-pill">
                              โควตาซื้อต่อคำสั่ง: {sess.limitPerOrder || 4} ใบ
                            </span>
                            <span className="row-detail-pill">
                              ค่าบริการระบบ: 3.0%
                            </span>
                            {sess.payoutBankName && (
                              <span className="row-detail-pill payout-pill">
                                บัญชีรับเงิน: {sess.payoutBankName} ({sess.payoutAccountNumber})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="row-card-right">
                          <button
                            type="button"
                            data-testid={`review-session-btn-${sess.sessionId}`}
                            className="primary-button row-action-btn"
                            onClick={() => handleOpenReviewModal(sess)}
                          >
                            <EyeIcon className="btn-icon" />
                            <span>ตรวจสอบรายละเอียดและอนุมัติ</span>
                          </button>

                          <button
                            type="button"
                            className="secondary-button row-action-btn"
                            onClick={() =>
                              handleOpenEditDrawer({
                                id: sess.eventId,
                                title: sess.eventTitle,
                                location: sess.location,
                                description: sess.eventDescription || '',
                                ageRestriction: sess.ageRestriction || 'all_ages',
                                refundPolicy: sess.refundPolicy || 'standard',
                                entryGuidelines: sess.entryGuidelines || '',
                                payoutBankName: sess.payoutBankName || '',
                                payoutAccountNumber: sess.payoutAccountNumber || '',
                                payoutAccountName: sess.payoutAccountName || '',
                                ubuPrivilegeMode: sess.ubuPrivilegeMode,
                              })
                            }
                          >
                            <PencilSquareIcon className="btn-icon" />
                            <span>แก้ไขข้อมูล</span>
                          </button>

                          <button
                            type="button"
                            className="secondary-button row-action-btn"
                            data-testid={`fast-approve-session-btn-${sess.sessionId}`}
                            onClick={() => handleApproveSession(sess.sessionId, sess.eventTitle)}
                          >
                            <span>อนุมัติด่วน</span>
                          </button>

                          <button
                            type="button"
                            className="danger-button reject-btn row-action-btn"
                            data-testid={`reject-session-open-btn-${sess.sessionId}`}
                            onClick={() => setRejectingSessionId(sess.sessionId)}
                          >
                            <span>ปฏิเสธ</span>
                          </button>
                        </div>

                        {rejectingSessionId === sess.sessionId && !reviewingSession && (
                          <div className="rejection-box" style={{ gridColumn: '1 / -1', padding: '0.75rem' }}>
                            <label htmlFor={`reject-pending-reason-${sess.sessionId}`} className="field-label">
                              ระบุเหตุผลในการปฏิเสธคำขอเปิดรอบการแสดง:
                            </label>
                            <input
                              id={`reject-pending-reason-${sess.sessionId}`}
                              data-testid={`reject-pending-reason-input-${sess.sessionId}`}
                              type="text"
                              className="form-input"
                              value={pendingRejectionReason}
                              onChange={(e) => setPendingRejectionReason(e.target.value)}
                              style={{ width: '100%', marginBottom: '0.5rem' }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                type="button"
                                className="primary-button danger"
                                data-testid={`confirm-reject-pending-btn-${sess.sessionId}`}
                                disabled={submittingApproval}
                                onClick={() => handleRejectPendingSession(sess.sessionId)}
                              >
                                <span>{submittingApproval ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}</span>
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => {
                                  setRejectingSessionId(null);
                                  setPendingRejectionReason('');
                                }}
                              >
                                <span>ยกเลิก</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>

              <hr className="hub-section-divider" />

              {/* Section 2: Amendments (AC-67, AC-68) */}
              <section className="owner-amendments-section">
                <div className="section-title-strip">
                  <h3
                    className="section-heading-text"
                    aria-label="คำขอแก้ไขรอบที่เปิดขายอยู่ (Live Session Amendments — AC-67, AC-68, AC-109) คำขอปรับเปลี่ยนราคาและโซนที่รออนุมัติ (Live Session Amendments)"
                  >
                    คำขอปรับเปลี่ยนราคาและโซนที่รออนุมัติ (Live Session Amendments)
                  </h3>
                  <span className="section-count-badge">{filteredAmendments.length} รายการ</span>
                </div>

                <div className="concert-horizontal-list">
                  {filteredAmendments.length === 0 ? (
                    <p style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                      {searchQuery ? `ไม่พบคำขอแก้ไขราคาที่ตรงกับคำค้นหา "${searchQuery}"` : 'ไม่มีคำขอปรับเปลี่ยนราคาและโซนที่รออนุมัติ'}
                    </p>
                  ) : (
                    filteredAmendments.map((amd) => (
                      <article key={amd.id} className="concert-horizontal-row-card amendment-row session-amendment-card">
                        <div className="row-card-center">
                          {/* Row 1: Status Badge (D-243) */}
                          <div className="row-card-badge-row">
                            <span className="status-badge pending">คำขอแก้ไขราคา / โซน</span>
                            {amd.startTime && <span className="sr-only">ขอเลื่อนวันเวลาการแสดง</span>}
                          </div>

                          {/* Row 2: Title (D-243) */}
                          <h3 className="row-event-title">{amd.eventTitle}</h3>

                          {/* Row 3: Organizer (D-243) */}
                          <div className="row-meta-strip">
                            <span className="row-meta-item">
                              <strong>ผู้จัดงาน:</strong> {amd.organizerName} ({amd.organizerEmail})
                            </span>
                          </div>

                          {/* Row 4: Schedule (D-243) */}
                          <div className="row-meta-strip">
                            <span className="row-meta-item">
                              <strong>รอบการแสดง:</strong> {amd.startTime ? safeFormatDateTime(amd.startTime) : safeFormatDateTime(amd.currentStartTime)}
                            </span>
                          </div>

                          {/* Row 5: Changes Summary & Window (D-243, D-246) */}
                          <div className="row-tags-strip">
                            <span className="row-detail-pill">
                              รายการปรับเปลี่ยน: {amd.ticketTypes && amd.ticketTypes.length > 0 ? `ปรับราคาบัตร ${amd.ticketTypes.length} ประเภท` : 'ปรับเวลาการแสดง'}
                            </span>
                            {amd.ticketTypes?.map((tt, ttIdx) => {
                              const curTt = amd.currentTicketTypes?.find((c) => c.id === tt.id || c.name === tt.name);
                              return (
                                <span key={tt.id || ttIdx} className="row-detail-pill">
                                  {tt.name}: {curTt ? `${formatBaht(curTt.price)} → ` : ''}{formatBaht(tt.price)} (โควตา {tt.quota} ใบ)
                                </span>
                              );
                            })}
                            <span className="row-detail-pill">
                              ช่วงเวลาคืนเงินพิเศษ: ภายใน 7 วันหลังปรับราคา (ค่าเริ่มต้น)
                            </span>
                          </div>

                          <details open className="special-refund-accordion" style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748b' }}>
                            <summary style={{ cursor: 'pointer', padding: '0.15rem 0' }}>
                              กำหนดช่วงเวลาคืนเงินพิเศษเพิ่มเติม (ระบุวันเวลาด้วยตนเอง)
                            </summary>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                              <input
                                type="datetime-local"
                                className="form-input"
                                data-testid={`srw-start-${amd.id}`}
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.78rem' }}
                                value={specialWindows[amd.id]?.start || ''}
                                onChange={(e) =>
                                  setSpecialWindows((prev) => ({
                                    ...prev,
                                    [amd.id]: { start: e.target.value, end: prev[amd.id]?.end || '' },
                                  }))
                                }
                                aria-label="วันเริ่มต้นคืนเงินพิเศษ"
                              />
                              <input
                                type="datetime-local"
                                className="form-input"
                                data-testid={`srw-end-${amd.id}`}
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.78rem' }}
                                value={specialWindows[amd.id]?.end || ''}
                                onChange={(e) =>
                                  setSpecialWindows((prev) => ({
                                    ...prev,
                                    [amd.id]: { start: prev[amd.id]?.start || '', end: e.target.value },
                                  }))
                                }
                                aria-label="วันสิ้นสุดคืนเงินพิเศษ"
                              />
                            </div>
                          </details>

                          {rejectingAmendmentId === amd.id && (
                            <div className="rejection-box" style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                              <label htmlFor={`reject-amd-reason-${amd.id}`} className="field-label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                                ระบุเหตุผลการปฏิเสธคำขอแก้ไข:
                              </label>
                              <input
                                id={`reject-amd-reason-${amd.id}`}
                                type="text"
                                className="form-input"
                                placeholder="ระบุเหตุผล..."
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                style={{ width: '100%', marginBottom: '0.5rem' }}
                              />
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  className="primary-button danger"
                                  data-testid={`confirm-reject-amendment-btn-${amd.id}`}
                                  onClick={() => handleRejectAmendment(amd.id)}
                                >
                                  <span>ยืนยันปฏิเสธ</span>
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => {
                                    setRejectingAmendmentId(null);
                                    setRejectionReason('');
                                  }}
                                >
                                  <span>ยกเลิก</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="row-card-right">
                          <button
                            type="button"
                            className="primary-button row-action-btn"
                            data-testid={`approve-amendment-btn-${amd.id}`}
                            aria-label="อนุมัติการแก้ไขราคา อนุมัติการแก้ไข (AC-67)"
                            onClick={() => handleApproveAmendment(amd.id, amd.eventTitle)}
                          >
                            <span>อนุมัติการแก้ไขราคา</span>
                          </button>
                          <button
                            type="button"
                            className="danger-button reject-btn row-action-btn"
                            data-testid={`reject-amendment-btn-${amd.id}`}
                            onClick={() => setRejectingAmendmentId(amd.id)}
                          >
                            <span>ส่งกลับแก้ไข</span>
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <hr className="hub-section-divider" />

              {/* Section 3: Cancellations (AC-35) */}
              <section className="owner-cancellations-section">
                <div className="section-title-strip">
                  <h3 className="section-heading-text">คำขอยกเลิกรอบการแสดงที่รอการอนุมัติ (Session Cancellations)</h3>
                  <span className="section-count-badge">{filteredCancellations.length} รายการ</span>
                </div>

                <div className="concert-horizontal-list">
                  {filteredCancellations.length === 0 ? (
                    <p style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                      {searchQuery ? `ไม่พบคำขอยกเลิกรอบที่ตรงกับคำค้นหา "${searchQuery}"` : 'ไม่มีคำขอยกเลิกรอบการแสดงที่รอการอนุมัติ'}
                    </p>
                  ) : (
                    filteredCancellations.map((can) => (
                      <article key={can.id} className="concert-horizontal-row-card cancellation-row" data-testid={`cancellation-request-${can.id}`}>
                        <div className="row-card-center">
                          {/* Row 1: Status Badge (D-243) */}
                          <div className="row-card-badge-row">
                            <span className="status-badge cancellation">ขอยกเลิกรอบ</span>
                          </div>

                          {/* Row 2: Title (D-243) */}
                          <h3 className="row-event-title">{can.eventTitle}</h3>

                          {/* Row 3: Organizer (D-243) */}
                          {can.organizerName && (
                            <div className="row-meta-strip">
                              <span className="row-meta-item">
                                <strong>ผู้จัดงาน:</strong> {can.organizerName}
                              </span>
                            </div>
                          )}

                          {/* Row 4: Schedule (D-243) */}
                          <div className="row-meta-strip">
                            <span className="row-meta-item">
                              <strong>รอบการแสดง:</strong> {safeFormatDateTime(can.startTime)}
                            </span>
                          </div>

                          {/* Row 5: Cancellation Reason (D-243, D-246) */}
                          <div className="row-tags-strip">
                            <span className="row-detail-pill" style={{ color: '#991b1b', backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
                              เหตุผลการขอยกเลิก: {can.reason}
                            </span>
                          </div>

                          {rejectingCancellationId === can.id && (
                            <div className="rejection-box" style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                              <label htmlFor={`reject-can-reason-${can.id}`} className="field-label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                                ระบุเหตุผลการปฏิเสธคำขอยกเลิก:
                              </label>
                              <input
                                id={`reject-can-reason-${can.id}`}
                                data-testid={`reject-cancellation-reason-${can.id}`}
                                type="text"
                                className="form-input"
                                placeholder="ระบุเหตุผล..."
                                value={cancellationRejectionReason}
                                onChange={(e) => setCancellationRejectionReason(e.target.value)}
                                style={{ width: '100%', marginBottom: '0.5rem' }}
                              />
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  className="primary-button danger"
                                  data-testid={`confirm-reject-cancellation-btn-${can.id}`}
                                  onClick={() => handleRejectCancellation(can.id)}
                                >
                                  <span>ยืนยันปฏิเสธคำขอยกเลิก</span>
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => {
                                    setRejectingCancellationId(null);
                                    setCancellationRejectionReason('');
                                  }}
                                >
                                  <span>ยกเลิก</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="row-card-right">
                          <button
                            type="button"
                            className="primary-button row-action-btn"
                            data-testid={`approve-cancellation-btn-${can.id}`}
                            aria-label="อนุมัติยกเลิกรอบการแสดง อนุมัติยกเลิกรอบ (AC-35)"
                            onClick={() => handleApproveCancellation(can.id, can.eventTitle)}
                          >
                            <span>อนุมัติยกเลิกรอบการแสดง</span>
                          </button>
                          <button
                            type="button"
                            className="danger-button reject-btn row-action-btn"
                            data-testid={`reject-cancellation-open-btn-${can.id}`}
                            onClick={() => setRejectingCancellationId(can.id)}
                          >
                            <span>ปฏิเสธคำขอยกเลิก</span>
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: APPROVED CONCERTS (อนุมัติแล้ว) */}
          {statusTab === 'approved' && (
            <div className="pipeline-tab-content">
              <div className="section-title-strip">
                <h3 className="section-heading-text">อนุมัติแล้ว (Approved & Live Concerts)</h3>
                <span className="section-count-badge">{filteredApprovedEvents.length} งาน</span>
              </div>

              <div className="concert-horizontal-list">
                {sortedApprovedEvents.length === 0 ? (
                  <p style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                    {searchQuery ? `ไม่พบคอนเสิร์ตที่ตรงกับคำค้นหา "${searchQuery}"` : 'ยังไม่มีคอนเสิร์ตที่เปิดขายในขณะนี้'}
                  </p>
                ) : (
                  sortedApprovedEvents.map((ev) => (
                    <article key={ev.id} className="concert-horizontal-row-card approved-row">
                      <div className="row-card-center">
                        {/* Row 1: Status Badge (D-243) */}
                        <div className="row-card-badge-row">
                          <span className="status-badge approved">กำลังเปิดขาย</span>
                          {ev.ubuPrivilegeMode && (
                            <span className="status-badge ubu-badge">สิทธิ์ ม.อุบลฯ</span>
                          )}
                        </div>

                        {/* Row 2: Event Title (D-243) */}
                        <h3 className="row-event-title">{ev.title}</h3>

                        {/* Row 3: Venue & Organizer (D-243) */}
                        <div className="row-meta-strip">
                          <span className="row-meta-item">
                            <strong>สถานที่:</strong> {ev.location}
                          </span>
                          <span className="row-meta-dot">·</span>
                          <span className="row-meta-item">
                            <strong>ผู้จัดงาน:</strong> {ev.organizerName || '-'}
                          </span>
                        </div>

                        {/* Row 4: Schedule / Rounds & Capacity (D-243) */}
                        <div className="row-meta-strip">
                          <span className="row-meta-item">
                            <strong>รอบการแสดง:</strong> {ev.sessionCount ? `${ev.sessionCount} รอบ` : '1 รอบ'}
                          </span>
                          <span className="row-meta-dot">·</span>
                          <span className="row-meta-item">
                            <strong>ความจุรวม:</strong> {Number(ev.totalQuota) || 0} ที่นั่ง
                          </span>
                        </div>

                        {/* Row 5: Price Range & Fees (D-243) */}
                        <div className="row-tags-strip">
                          <span className="row-detail-pill">
                            ช่วงราคา: {formatBaht(Number(ev.minPrice) || 0)} – {formatBaht(Number(ev.maxPrice) || Number(ev.minPrice) || 0)}
                          </span>
                          <span className="row-detail-pill">
                            ค่าบริการระบบ: {ev.organizerFeeRate ?? 3.0}%
                          </span>
                        </div>
                      </div>

                      <div className="row-card-right">
                        <button
                          type="button"
                          className="primary-button row-action-btn"
                          onClick={() => setViewingAnalyticsEvent(ev)}
                        >
                          <TrendingUpIcon className="btn-icon" />
                          <span>ดูสถิติเชิงลึก (Analytics)</span>
                        </button>

                        <button
                          type="button"
                          className="secondary-button row-action-btn"
                          onClick={() => handleOpenEditDrawer(ev)}
                        >
                          <PencilSquareIcon className="btn-icon" />
                          <span>แก้ไขข้อมูล</span>
                        </button>

                        <button
                          type="button"
                          className="secondary-button row-action-btn"
                          onClick={() => handleExportCurrentCsv(ev)}
                          title="ดาวน์โหลด CSV ข้อมูลปัจจุบัน"
                        >
                          <DownloadIcon className="btn-icon" />
                          <span>สำรอง CSV</span>
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: REVISIONS, DRAFTS & HISTORY (อื่น ๆ) */}
          {statusTab === 'rejected' && (
            <div className="pipeline-tab-content">
              <div className="section-title-strip">
                <h3 className="section-heading-text">อื่น ๆ (Revisions, Drafts & History)</h3>
                <span className="section-count-badge">{filteredRejectedEvents.length} งาน</span>
              </div>

              <div className="concert-horizontal-list">
                {sortedRejectedEvents.length === 0 ? (
                  <p style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                    {searchQuery ? `ไม่พบรายการที่ตรงกับคำค้นหา "${searchQuery}"` : 'ไม่มีคอนเสิร์ตที่ต้องปรับปรุงหรือแบบร่าง'}
                  </p>
                ) : (
                  sortedRejectedEvents.map((ev) => (
                    <article key={ev.id} className="concert-horizontal-row-card rejected-row">
                      <div className="row-card-center">
                        {/* Row 1: Status Badge (D-243) */}
                        <div className="row-card-badge-row">
                          <span className="status-badge revision">ส่งกลับแก้ไข / แบบร่าง</span>
                        </div>

                        {/* Row 2: Event Title (D-243) */}
                        <h3 className="row-event-title">{ev.title}</h3>

                        {/* Row 3: Venue & Organizer (D-243) */}
                        <div className="row-meta-strip">
                          <span className="row-meta-item">
                            <strong>สถานที่:</strong> {ev.location}
                          </span>
                          <span className="row-meta-dot">·</span>
                          <span className="row-meta-item">
                            <strong>ผู้จัดงาน:</strong> {ev.organizerName || '-'}
                          </span>
                        </div>

                        {/* Row 4: Capacity (D-243) */}
                        <div className="row-meta-strip">
                          <span className="row-meta-item">
                            <strong>ความจุ:</strong> {Number(ev.totalQuota) || 0} ที่นั่ง
                          </span>
                        </div>

                        {/* Row 5: Admin Observation Warning Box (D-243, D-246) */}
                        <div className="row-tags-strip">
                          <span className="row-detail-pill" style={{ color: '#92400e', backgroundColor: '#fef3c7', borderColor: '#fde68a' }}>
                            ข้อสังเกตจากแอดมิน: ข้อมูลบัญชีรับเงินหรือแผนผังความปลอดภัยยังไม่ครบถ้วน กรุณาตรวจสอบและอัปเดตข้อมูล
                          </span>
                        </div>
                      </div>

                      <div className="row-card-right">
                        <button
                          type="button"
                          className="primary-button row-action-btn"
                          onClick={() => handleOpenEditDrawer(ev)}
                        >
                          <PencilSquareIcon className="btn-icon" />
                          <span>ตรวจสอบและแก้ไข</span>
                        </button>
                        <button
                          type="button"
                          className="secondary-button row-action-btn"
                          onClick={() => handleExportCurrentCsv(ev)}
                        >
                          <DownloadIcon className="btn-icon" />
                          <span>สำรอง CSV</span>
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Pagination Bar (D-244) */}
          {((statusTab === 'pending' && pendingCount > 0) ||
            (statusTab === 'approved' && approvedCount > 0) ||
            (statusTab === 'rejected' && rejectedCount > 0)) && (
            <div className="hub-pagination-bar">
              <span className="pagination-info">
                แสดง 1–{statusTab === 'pending' ? pendingCount : statusTab === 'approved' ? approvedCount : rejectedCount} จาก{' '}
                {statusTab === 'pending' ? pendingCount : statusTab === 'approved' ? approvedCount : rejectedCount} รายการ
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="secondary-button pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  aria-label="หน้าก่อนหน้า"
                >
                  ก่อนหน้า
                </button>
                <span className="pagination-current-page">
                  หน้า {currentPage} จาก {Math.max(1, Math.ceil((statusTab === 'pending' ? pendingCount : statusTab === 'approved' ? approvedCount : rejectedCount) / PAGE_SIZE))}
                </span>
                <button
                  type="button"
                  className="secondary-button pagination-btn"
                  disabled={currentPage >= Math.max(1, Math.ceil((statusTab === 'pending' ? pendingCount : statusTab === 'approved' ? approvedCount : rejectedCount) / PAGE_SIZE))}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  aria-label="หน้าถัดไป"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          MODAL 1: FULL CONCERT REVIEW & FEE ADJUSTMENT (D-219, D-225)
          ========================================================= */}
      {reviewingSession && (
        <div
          className="admin-full-concert-review-modal"
          data-testid="admin-full-concert-review-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
        >
          <button
            type="button"
            className="review-modal-backdrop"
            onClick={() => setReviewingSession(null)}
            aria-label="ปิดหน้าต่างตรวจสอบ"
            tabIndex={-1}
          />
          <div className="review-modal-dialog">
            <header className="review-modal-header">
              <div>
                <h3 id="review-modal-title" className="review-modal-heading">
                  ตรวจสอบรายละเอียดคอนเสิร์ตเพื่ออนุมัติเปิดขาย
                </h3>
                <p className="review-modal-sub">
                  งาน: <strong>{reviewingSession.eventTitle}</strong> · ผู้จัดงาน: {reviewingSession.organizerName}
                </p>
              </div>
              <button
                type="button"
                className="review-modal-close"
                onClick={() => setReviewingSession(null)}
                aria-label="ปิดหน้าต่างตรวจสอบ"
              >
                <XIcon />
              </button>
            </header>

            <div className="review-modal-body">
              {loadingReviewDetails ? (
                <div className="loading-box">กำลังโหลดรายละเอียดคอนเสิร์ต...</div>
              ) : (
                <div className="review-content-stack">
                  {/* 1. Basic Info & Poster */}
                  <div className="review-summary-card">
                    <h4 className="summary-title">ข้อมูลทั่วไปของคอนเสิร์ต (Basic Information)</h4>
                    <div className="summary-grid">
                      <div>
                        <span className="summary-label">ชื่องานคอนเสิร์ต:</span>
                        <p className="summary-val">{reviewingSession.eventTitle}</p>
                      </div>
                      <div>
                        <span className="summary-label">ผู้จัดงาน:</span>
                        <p className="summary-val">{reviewingSession.organizerName} ({reviewingSession.organizerEmail})</p>
                      </div>
                      <div>
                        <span className="summary-label">สถานที่จัดงาน:</span>
                        <p className="summary-val">{reviewingSession.location}</p>
                      </div>
                      <div>
                        <span className="summary-label">แผนที่ / Google Maps:</span>
                        <p className="summary-val">
                          {reviewingSession.googleMapsUrl || reviewingEventDetails?.googleMapsUrl ? (
                            <a
                              href={reviewingSession.googleMapsUrl || reviewingEventDetails?.googleMapsUrl || '#'}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#0369a1', textDecoration: 'underline' }}
                            >
                              เปิดดูพิกัดแผนที่
                            </a>
                          ) : (
                            'ไม่ได้ระบุลิงก์แผนที่'
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="summary-label">การจำกัดอายุ:</span>
                        <p className="summary-val">{reviewingEventDetails?.ageRestriction || reviewingSession.ageRestriction || 'ทุกเพศทุกวัย (All Ages)'}</p>
                      </div>
                      <div>
                        <span className="summary-label">นโยบายการคืนเงิน:</span>
                        <p className="summary-val">{reviewingEventDetails?.refundPolicy || reviewingSession.refundPolicy || 'มาตรฐาน (คืนได้ตามเงื่อนไข)'}</p>
                      </div>
                      <div>
                        <span className="summary-label">จำกัดจำนวนซื้อต่อคำสั่งซื้อ:</span>
                        <p className="summary-val">{reviewingSession.limitPerOrder || 4} ใบ</p>
                      </div>
                    </div>

                    {(reviewingEventDetails?.description || reviewingSession.eventDescription) && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <span className="summary-label">คำอธิบายงานคอนเสิร์ต:</span>
                        <p className="summary-val" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                          {reviewingEventDetails?.description || reviewingSession.eventDescription}
                        </p>
                      </div>
                    )}

                    {(reviewingEventDetails?.entryGuidelines || reviewingSession.entryGuidelines) && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <span className="summary-label">กติกาและระเบียบการเข้าชม:</span>
                        <p className="summary-val">
                          {reviewingEventDetails?.entryGuidelines || reviewingSession.entryGuidelines}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 2. Schedule and Ticket Types Breakdown */}
                  <div className="review-summary-card">
                    <h4 className="summary-title">รอบการแสดงและประเภทบัตร (Sessions & Tickets)</h4>
                    <div className="session-review-block">
                      <p className="session-time-header">
                        เวลาแสดง: {safeFormatDateTime(reviewingSession.startTime)} – {safeFormatDateTime(reviewingSession.endTime)}
                      </p>
                      {reviewingEventDetails?.sessions && reviewingEventDetails.sessions.length > 0 ? (
                        <div className="ticket-types-pill-grid">
                          {reviewingEventDetails.sessions[0]?.ticketTypes?.map((tt) => (
                            <div key={tt.id} className="ticket-type-pill">
                              <strong>{tt.name}</strong>
                              <span>{formatBaht(tt.price)}</span>
                              <span className="quota-tag">โควตา: {tt.quota} ใบ</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                          ประเภทบัตรทั้งหมด: {reviewingSession.ticketTypeCount} ประเภท
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 3. Payout Bank Account Verification */}
                  <div className="review-summary-card payout-verify-card">
                    <h4 className="summary-title">บัญชีธนาคารสำหรับรับเงินโอน (Payout Bank Account)</h4>
                    {reviewingSession.payoutBankName ? (
                      <div className="payout-details-box">
                        <p><strong>ธนาคาร:</strong> {reviewingSession.payoutBankName}</p>
                        <p><strong>เลขที่บัญชี:</strong> {reviewingSession.payoutAccountNumber}</p>
                        <p><strong>ชื่อบัญชี:</strong> {reviewingSession.payoutAccountName || reviewingSession.organizerName}</p>
                      </div>
                    ) : (
                      <p className="text-warning">ผู้จัดงานยังไม่ได้ระบุบัญชีธนาคารสำหรับรับเงินโอน</p>
                    )}
                  </div>

                  {/* 4. Fee Adjustment & Privilege Governance (D-219, D-225, D-236) */}
                  <div className="admin-fee-adjustment-box">
                    <h4 className="adjustment-title">กำหนดอัตราค่าบริการและสิทธิ์พิเศษสำหรับคอนเสิร์ตนี้ (Admin Governance)</h4>
                    <p className="adjustment-desc">
                      แอดมินเป็นผู้กำหนดอัตราค่าบริการและพิจารณาเปิดสิทธิ์พิเศษสำหรับงานนี้ก่อนกดอนุมัติ
                    </p>

                    <div className="adjustment-inputs-grid">
                      <div className="adj-field">
                        <label htmlFor="custom-organizer-fee-input">
                          ค่าบริการผู้จัดงาน (Organizer Platform Fee %)
                        </label>
                        <input
                          id="custom-organizer-fee-input"
                          type="number"
                          step="0.1"
                          min="0"
                          max="30"
                          value={customFeeRate}
                          onChange={(e) => setCustomFeeRate(Number(e.target.value))}
                          className="adj-input"
                        />
                      </div>

                      <div className="adj-field">
                        <label htmlFor="custom-customer-fee-input">
                          ค่าบริการลูกค้า (Customer Service Fee %)
                        </label>
                        <input
                          id="custom-customer-fee-input"
                          type="number"
                          step="0.1"
                          min="0"
                          max="20"
                          value={customCustomerFeeRate}
                          onChange={(e) => setCustomCustomerFeeRate(Number(e.target.value))}
                          className="adj-input"
                        />
                      </div>

                      <div className="adj-field">
                        <label htmlFor="custom-reserve-percentage-input">
                          เปอร์เซ็นต์เงินสำรอง (Reserve Rate %)
                        </label>
                        <input
                          id="custom-reserve-percentage-input"
                          type="number"
                          step="0.1"
                          min="0"
                          max="50"
                          value={customReserveRate}
                          onChange={(e) => setCustomReserveRate(Number(e.target.value))}
                          className="adj-input"
                        />
                      </div>

                      <div className="adj-field">
                        <label htmlFor="custom-ubu-grant-select">
                          การให้สิทธิ์ ม.อุบลฯ (UBU Privilege Grant by Admin)
                        </label>
                        <select
                          id="custom-ubu-grant-select"
                          value={reviewUbuMode ? 'grant' : 'none'}
                          onChange={(e) => setReviewUbuMode(e.target.value === 'grant')}
                          className="adj-input"
                        >
                          <option value="none">ไม่อนุมัติสิทธิ์ ม.อุบลฯ (คิดค่าบริการปกติ)</option>
                          <option value="grant">อนุมัติมอบสิทธิ์ ม.อุบลฯ (คิดค่าบริการพิเศษ {customUbuPrivilegeFeeRate}%)</option>
                        </select>
                      </div>

                      {reviewUbuMode && (
                        <div className="adj-field">
                          <label htmlFor="custom-ubu-fee-input">
                            ค่าบริการบัตรสิทธิ์ ม.อุบลฯ (UBU Fee %)
                          </label>
                          <input
                            id="custom-ubu-fee-input"
                            type="number"
                            step="0.1"
                            min="0"
                            max="20"
                            value={customUbuPrivilegeFeeRate}
                            onChange={(e) => setCustomUbuPrivilegeFeeRate(Number(e.target.value))}
                            className="adj-input"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rejection Reason Form */}
                  {rejectingSessionId === reviewingSession.sessionId && (
                    <div className="rejection-form-box">
                      <label htmlFor={`reject-pending-reason-input-${reviewingSession.sessionId}`}>
                        ระบุเหตุผลการปฏิเสธคำขอเปิดรอบ (เพื่อให้ผู้จัดงานนำไปปรับปรุง):
                      </label>
                      <textarea
                        id={`reject-pending-reason-input-${reviewingSession.sessionId}`}
                        rows={3}
                        value={pendingRejectionReason}
                        onChange={(e) => setPendingRejectionReason(e.target.value)}
                        placeholder="เช่น ข้อมูลรอบการแสดงไม่ครบถ้วน หรือราคาบัตรไม่สอดคล้องกับข้อตกลง..."
                        className="rejection-textarea"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="review-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReviewingSession(null)}
              >
                <span>ปิดหน้าต่าง</span>
              </button>

              {rejectingSessionId === reviewingSession.sessionId ? (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setRejectingSessionId(null)}
                  >
                    <span>ยกเลิกการปฏิเสธ</span>
                  </button>
                  <button
                    type="button"
                    className="danger-button reject-btn"
                    disabled={submittingApproval}
                    onClick={() => handleRejectPendingSession(reviewingSession.sessionId)}
                  >
                    <span>ยืนยันปฏิเสธและส่งกลับแก้ไข</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="danger-button reject-btn"
                    onClick={() => setRejectingSessionId(reviewingSession.sessionId)}
                  >
                    <span>ส่งกลับให้แก้ไข</span>
                  </button>
                  <button
                    type="button"
                    data-testid="admin-approve-concert-btn"
                    className="primary-button approve-btn"
                    disabled={submittingApproval}
                    onClick={() => handleApproveWithFee(reviewingSession.sessionId)}
                  >
                    <CheckCircleIcon className="btn-icon" />
                    <span>{submittingApproval ? 'กำลังบันทึก...' : 'อนุมัติและเผยแพร่คอนเสิร์ต'}</span>
                  </button>
                </>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: ADMIN EDIT DRAWER WITH CSV SNAPSHOT (D-227)
          ========================================================= */}
      {editingEvent && (
        <div className="admin-edit-drawer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-drawer-title">
          <button
            type="button"
            className="review-modal-backdrop"
            onClick={() => setEditingEvent(null)}
            aria-label="ปิดหน้าต่างแก้ไข"
            tabIndex={-1}
          />
          <div className="review-modal-dialog edit-dialog">
            <header className="review-modal-header">
              <div>
                <h3 id="edit-drawer-title" className="review-modal-heading">
                  แก้ไขข้อมูลคอนเสิร์ตโดยผู้ดูแลระบบ (Admin Override)
                </h3>
                <p className="review-modal-sub">
                  งาน: <strong>{editingEvent.title}</strong> · ระบบจะสำรองไฟล์ CSV ก่อนบันทึกอัตโนมัติ
                </p>
              </div>
              <button
                type="button"
                className="review-modal-close"
                onClick={() => setEditingEvent(null)}
                aria-label="ปิดหน้าต่างแก้ไข"
              >
                <XIcon />
              </button>
            </header>

            <div className="review-modal-body">
              <div className="edit-form-stack">
                <div className="form-field">
                  <label htmlFor="edit-concert-title">ชื่อคอนเสิร์ต</label>
                  <input
                    id="edit-concert-title"
                    type="text"
                    value={editFormData.title || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                    className="text-input"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-concert-location">สถานที่จัดงาน</label>
                  <input
                    id="edit-concert-location"
                    type="text"
                    value={editFormData.location || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                    className="text-input"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-concert-desc">รายละเอียดคอนเสิร์ต</label>
                  <textarea
                    id="edit-concert-desc"
                    rows={3}
                    value={editFormData.description || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className="text-input"
                  />
                </div>

                <div className="form-row-two-col">
                  <div className="form-field">
                    <label htmlFor="edit-age-restriction">การจำกัดอายุ</label>
                    <select
                      id="edit-age-restriction"
                      value={editFormData.ageRestriction || 'all_ages'}
                      onChange={(e) => setEditFormData({ ...editFormData, ageRestriction: e.target.value })}
                      className="text-input"
                    >
                      <option value="all_ages">ไม่จำกัดอายุ (All Ages)</option>
                      <option value="18_plus">อายุ 18 ปีขึ้นไป (18+)</option>
                      <option value="20_plus">อายุ 20 ปีขึ้นไป (20+)</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="edit-refund-policy">นโยบายการคืนเงิน</label>
                    <select
                      id="edit-refund-policy"
                      value={editFormData.refundPolicy || 'standard'}
                      onChange={(e) => setEditFormData({ ...editFormData, refundPolicy: e.target.value })}
                      className="text-input"
                    >
                      <option value="standard">มาตรฐาน (คืนได้ตามเงื่อนไขภายใน 7 วัน)</option>
                      <option value="non_refundable">ไม่สามารถขอคืนเงินได้เว้นแต่ผู้จัดยกเลิกงาน</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="edit-entry-guidelines">กติกาการเข้างาน</label>
                  <input
                    id="edit-entry-guidelines"
                    type="text"
                    value={editFormData.entryGuidelines || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, entryGuidelines: e.target.value })}
                    className="text-input"
                    placeholder="เช่น ห้ามนำอาหารและเครื่องดื่มเข้าพื้นที่..."
                  />
                </div>

                <div className="form-row-three-col">
                  <div className="form-field">
                    <label htmlFor="edit-org-fee">ค่าบริการผู้จัดงาน (%)</label>
                    <input
                      id="edit-org-fee"
                      type="number"
                      step="0.1"
                      value={editFormData.organizerFeeRate ?? 3.0}
                      onChange={(e) => setEditFormData({ ...editFormData, organizerFeeRate: Number(e.target.value) })}
                      className="text-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="edit-cust-fee">ค่าบริการลูกค้า (%)</label>
                    <input
                      id="edit-cust-fee"
                      type="number"
                      step="0.1"
                      value={editFormData.customerFeeRate ?? 0.0}
                      onChange={(e) => setEditFormData({ ...editFormData, customerFeeRate: Number(e.target.value) })}
                      className="text-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="edit-ubu-mode">สิทธิ์ ม.อุบลฯ</label>
                    <select
                      id="edit-ubu-mode"
                      value={editFormData.ubuPrivilegeMode ? 'yes' : 'no'}
                      onChange={(e) => setEditFormData({ ...editFormData, ubuPrivilegeMode: e.target.value === 'yes' })}
                      className="text-input"
                    >
                      <option value="yes">เปิดใช้งานสิทธิ์ ม.อุบล</option>
                      <option value="no">ปิดการใช้งานสิทธิ์</option>
                    </select>
                  </div>
                </div>

                {/* Audit Trail & Backup Download Section (D-227) */}
                <div className="audit-trail-history-box">
                  <div className="audit-header">
                    <h4>ประวัติการแก้ไขและไฟล์สำรอง CSV (Audit Trail)</h4>
                    <button
                      type="button"
                      className="secondary-button export-now-btn"
                      onClick={() => handleExportCurrentCsv(editingEvent)}
                    >
                      <DownloadIcon className="btn-icon" />
                      <span>ดาวน์โหลด CSV ข้อมูลปัจจุบัน</span>
                    </button>
                  </div>

                  {auditLogs[editingEvent.id] && auditLogs[editingEvent.id].length > 0 ? (
                    <div className="audit-list">
                      {auditLogs[editingEvent.id].map((log) => (
                        <div key={log.id} className="audit-log-item">
                          <div className="audit-log-meta">
                            <strong>{log.timestamp}</strong> โดย {log.editor}
                          </div>
                          <ul className="audit-changes-list">
                            {log.changesSummary.map((c) => (
                              <li key={`${log.id}-${c}`}>{c}</li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            className="secondary-button dl-backup-btn"
                            onClick={() => triggerCsvDownload(log.snapshotCsv, `snapshot-${editingEvent.id}-${log.id}.csv`)}
                          >
                            <DownloadIcon className="btn-icon" />
                            <span>ดาวน์โหลด CSV ฉบับก่อนแก้ไขนี้</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-audit-text">ยังไม่มีประวัติการแก้ไขย้อนหลังสำหรับคอนเสิร์ตนี้</p>
                  )}
                </div>
              </div>
            </div>

            <footer className="review-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditingEvent(null)}
              >
                <span>ยกเลิก</span>
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={savingEdit}
                onClick={handleSaveAdminEdit}
              >
                <CheckCircleIcon className="btn-icon" />
                <span>{savingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไขและสำรอง CSV'}</span>
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
