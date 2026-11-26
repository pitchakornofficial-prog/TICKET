'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import type { SessionAmendmentRecord, SessionCancellationRecord } from '@/server/events';
import type { OrganizerFeeMode, CustomerFeeMode } from '@/server/fees';
import { formatBaht, formatDateTime, toLocalDatetimeInputString } from '@/lib/locale';
import { getEventSalesStatus } from '@/lib/sales-window';
import { sanitizeGoogleMapsUrl } from '@/lib/google-maps-url';
import { triggerToast, triggerRefreshToast } from './toast-notification';
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
  PlusIcon,
  TrashIcon,
  AlertTriangleIcon,
} from './icons';
import { TicketIcon } from './ticket-icon';
import { AlertIcon } from './alert-icon';
import { DateTimePicker24h } from './datetime-picker-24h';
import { UbuPrivilegeSwitchField } from './ubu-privilege-switch-field';
import {
  generateConcertCsvSnapshot,
  triggerCsvDownload,
  type ConcertSnapshotData,
} from '@/lib/concert-csv-snapshot';

export interface EditableTicketType {
  id?: string;
  name: string;
  price: number;
  quota: number;
  soldCount?: number;
  isStudentPrivilege?: boolean;
  studentPrice?: number | null;
  description?: string;
}

export interface EditableSession {
  id?: string;
  startTime: string;
  endTime: string;
  admissionStartTime?: string;
  admissionEndTime?: string;
  ticketTypes: EditableTicketType[];
  soldCount?: number;
}

export interface AdminOverrideFormState {
  title: string;
  artists: string;
  location: string;
  googleMapsUrl: string;
  description: string;
  salesStartTime: string;
  salesEndTime: string;
  limitPerOrder: number;
  isSalesPaused: boolean;
  salesPausedReason: string;
  ageRestriction: string;
  refundPolicy: string;
  entryGuidelines: string;
  posterUrl: string;
  coverBannerUrl: string;
  ticketTemplateUrl: string;
  payoutBankName: string;
  payoutAccountNumber: string;
  payoutAccountName: string;
  organizerFeeMode?: 'percentage' | 'per_ticket' | 'flat_fee';
  organizerFeeRate: number;
  customerFeeMode?: 'per_ticket' | 'per_order' | 'percentage';
  customerFeeRate: number;
  reservePercentage: number;
  ubuPrivilegeMode: boolean;
  sessions: EditableSession[];
}

interface ReviewingTicketType {
  id: string;
  name: string;
  price: number;
  quota: number;
  isStudentPrivilege?: boolean;
  studentPrice?: number | null;
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
    organizerFeeMode?: OrganizerFeeMode;
    organizerFeeRate?: number;
    customerFeeMode?: CustomerFeeMode;
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
  artists?: string;
  salesStartTime?: string;
  salesEndTime?: string;
  isSalesPaused?: boolean;
  salesPausedReason?: string;
  organizerId?: string;
  organizerName?: string;
  organizerEmail?: string;
  sessionCount?: number | string;
  approvedSessionCount?: number;
  cancelledSessionCount?: number;
  lastApprovedSessionEndTime?: string | null;
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
  organizerFeeMode?: OrganizerFeeMode;
  organizerFeeRate?: number;
  customerFeeMode?: CustomerFeeMode;
  customerFeeRate?: number;
  reservePercentage?: number;
  createdAt?: string;
}

interface ConcertAnalytics {
  grossSales: number;
  netEntitlement: number;
  organizerFee: number;
  issuedTickets: number;
  refundedTickets: number;
  approvedRefunds: number;
  ubuOrders: number;
  discountedOrders: number;
  tiers: {
    id: string; name: string; price: number; quota: number; sold: number;
    gross: number; status: string; startTime: string;
  }[];
}

function concertSalesStatus(event: PlatformConcertItem) {
  if (event.status !== 'approved') return { label: 'รออนุมัติ', open: false };
  if (event.isSalesPaused) return { label: 'ระงับการขายด่วน', open: false };
  if (!event.approvedSessionCount) {
    return {
      label: event.cancelledSessionCount && Number(event.sessionCount) === event.cancelledSessionCount
        ? 'ยกเลิกทุกรอบแล้ว' : 'ไม่มีรอบที่อนุมัติ',
      open: false,
    };
  }

  const sales = getEventSalesStatus({
    ...event,
    sessions: [{ endTime: event.lastApprovedSessionEndTime }],
  });
  return { label: sales.message ?? 'กำลังเปิดขาย', open: sales.isOpen };
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  editor: string;
  changesSummary: string[];
  snapshotCsv: string | null;
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

  // Status Tab Filtering: 4 tabs (Pending, Approved, Rejected, Analytics)
  // useState<'pending' | 'approved' | 'rejected'>('pending')
  const [statusTab, setStatusTab] = useState<'pending' | 'approved' | 'rejected' | 'analytics'>('pending');

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
  const [customOrganizerFeeMode, setCustomOrganizerFeeMode] = useState<OrganizerFeeMode>('percentage');
  const [customFeeRate, setCustomFeeRate] = useState<number>(3.0);
  const [customCustomerFeeMode, setCustomCustomerFeeMode] = useState<CustomerFeeMode>('percentage');
  const [customCustomerFeeRate, setCustomCustomerFeeRate] = useState<number>(0.0);
  const [customReserveRate, setCustomReserveRate] = useState<number>(0.0);
  const [customUbuPrivilegeFeeRate, setCustomUbuPrivilegeFeeRate] = useState<number>(3.0);
  const [reviewUbuMode, setReviewUbuMode] = useState<boolean>(false);
  const [rejectingSessionId, setRejectingSessionId] = useState<string | null>(null);
  const [pendingRejectionReason, setPendingRejectionReason] = useState<string>('');
  const [submittingApproval, setSubmittingApproval] = useState<boolean>(false);

  // Dedicated Concert Analytics View State (D-226)
  const [viewingAnalyticsEvent, setViewingAnalyticsEvent] = useState<PlatformConcertItem | null>(null);
  const analyticsEventId = viewingAnalyticsEvent?.id;
  const [analytics, setAnalytics] = useState<ConcertAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    if (!analyticsEventId) return;
    const controller = new AbortController();
    fetch(`/api/owner/events/${encodeURIComponent(analyticsEventId)}/analytics`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('โหลดสถิติคอนเสิร์ตไม่สำเร็จ');
        const data: ConcertAnalytics = await response.json();
        if (!controller.signal.aborted) setAnalytics(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAnalyticsError('โหลดสถิติคอนเสิร์ตไม่สำเร็จ');
      });
    return () => controller.abort();
  }, [analyticsEventId]);


  // Admin Override & Audit Trail with CSV Snapshot State (D-227)
  const [editingEvent, setEditingEvent] = useState<PlatformConcertItem | null>(null);
  const [editFormData, setEditFormData] = useState<AdminOverrideFormState | null>(null);
  const [originalEventData, setOriginalEventData] = useState<AdminOverrideFormState | null>(null);
  const [loadingEditData, setLoadingEditData] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLogEntry[]>>({});
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [uploadingPoster, setUploadingPoster] = useState<boolean>(false);
  const [uploadingCover, setUploadingCover] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [pendingChangesList, setPendingChangesList] = useState<string[]>([]);

  // Emergency Sales Toggle State (D-278)
  const [togglingEvent, setTogglingEvent] = useState<PlatformConcertItem | null>(null);
  const [toggleReason, setToggleReason] = useState<string>('');
  const [isSubmittingToggle, setIsSubmittingToggle] = useState<boolean>(false);

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
          setCustomOrganizerFeeMode(evFee.feeSettings.organizerFeeMode || 'percentage');
          setCustomCustomerFeeMode(evFee.feeSettings.customerFeeMode || 'percentage');
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

    try {
      const res = await fetch('/api/owner/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'approve',
          organizerFeeMode: customOrganizerFeeMode,
          organizerFeeRate: customFeeRate,
          customerFeeMode: customCustomerFeeMode,
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
      setActionMessage(`อนุมัติคอนเสิร์ต "${reviewingSession?.eventTitle}" พร้อมบันทึกข้อตกลงค่าบริการ ${customFeeRate}% สำเร็จ`);
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

  // Open Admin Edit Drawer with full details (D-227, D-278)
  const handleOpenEditDrawer = async (event: PlatformConcertItem) => {
    setEditingEvent(event);
    setLoadingEditData(true);
    setError('');
    setActionMessage('');

    try {
      const [res, auditRes] = await Promise.all([
        fetch(`/api/events/${event.id}`),
        fetch(`/api/owner/events/${event.id}/audit-logs`),
      ]);
      if (!res.ok) throw new Error('ไม่สามารถโหลดรายละเอียดคอนเสิร์ตได้');
      const data = await res.json();
      const ev = data.event || {};

      if (auditRes.ok) {
        const auditData = await auditRes.json();
        interface RawAuditRecord {
          id: string;
          createdAt: string;
          editorName?: string;
          changesSummary?: string[];
          snapshotCsv?: string | null;
        }
        const mappedLogs: AuditLogEntry[] = (auditData.logs || []).map((l: RawAuditRecord) => ({
          id: l.id,
          timestamp: safeFormatDateTime(l.createdAt),
          editor: l.editorName || 'เจ้าของระบบ (Admin/Owner)',
          changesSummary: Array.isArray(l.changesSummary) ? l.changesSummary : [],
          snapshotCsv: l.snapshotCsv || null,
        }));
        setAuditLogs((prev) => ({ ...prev, [event.id]: mappedLogs }));
      }

      interface FetchedSession {
        id?: string;
        startTime?: string;
        endTime?: string;
        admissionStartTime?: string;
        admissionEndTime?: string;
        ticketTypes?: Array<{
          id?: string;
          name?: string;
          price?: number;
          quota?: number;
          soldCount?: number;
          isStudentPrivilege?: boolean;
          studentPrice?: number | null;
          description?: string;
        }>;
      }

      const rawSessions: FetchedSession[] = Array.isArray(ev.sessions) ? ev.sessions : [];
      const loadedSessions: EditableSession[] = rawSessions.length > 0
        ? rawSessions.map((s) => ({
            id: s.id,
            startTime: toLocalDatetimeInputString(s.startTime),
            endTime: toLocalDatetimeInputString(s.endTime),
            admissionStartTime: toLocalDatetimeInputString(s.admissionStartTime),
            admissionEndTime: toLocalDatetimeInputString(s.admissionEndTime),
            soldCount: s.ticketTypes?.reduce((acc, t) => acc + (Number(t.soldCount) || 0), 0) || 0,
            ticketTypes: Array.isArray(s.ticketTypes)
              ? s.ticketTypes.map((tt) => ({
                  id: tt.id,
                  name: tt.name || '',
                  price: Number(tt.price) || 0,
                  quota: Number(tt.quota) || 0,
                  soldCount: Number(tt.soldCount) || 0,
                  isStudentPrivilege: Boolean(tt.isStudentPrivilege),
                  studentPrice: tt.studentPrice != null ? Number(tt.studentPrice) : null,
                  description: tt.description || '',
                }))
              : [],
          }))
        : [
            {
              startTime: toLocalDatetimeInputString(event.salesStartTime),
              endTime: toLocalDatetimeInputString(event.salesEndTime),
              admissionStartTime: '',
              admissionEndTime: '',
              soldCount: 0,
              ticketTypes: [
                {
                  name: 'บัตรทั่วไป',
                  price: Number(event.minPrice) || 500,
                  quota: Number(event.totalQuota) || 100,
                  soldCount: 0,
                  isStudentPrivilege: false,
                  studentPrice: null,
                },
              ],
            },
          ];

      const stateObj: AdminOverrideFormState = {
        title: ev.title || event.title || '',
        artists: ev.artists || event.artists || '',
        location: ev.location || event.location || '',
        googleMapsUrl: ev.googleMapsUrl || '',
        description: ev.description || event.description || '',
        salesStartTime: toLocalDatetimeInputString(ev.salesStartTime || event.salesStartTime),
        salesEndTime: toLocalDatetimeInputString(ev.salesEndTime || event.salesEndTime),
        limitPerOrder: typeof ev.limitPerOrder === 'number' ? ev.limitPerOrder : 6,
        isSalesPaused: Boolean(ev.isSalesPaused ?? event.isSalesPaused),
        salesPausedReason: ev.salesPausedReason || event.salesPausedReason || '',
        ageRestriction: ev.ageRestriction || event.ageRestriction || 'all_ages',
        refundPolicy: ev.refundPolicy || event.refundPolicy || 'standard',
        entryGuidelines: ev.entryGuidelines || event.entryGuidelines || '',
        posterUrl: ev.posterUrl || event.posterUrl || '',
        coverBannerUrl: ev.coverBannerUrl || '',
        ticketTemplateUrl: ev.ticketTemplateUrl || '',
        payoutBankName: ev.payoutBankName || event.payoutBankName || '',
        payoutAccountNumber: ev.payoutAccountNumber || event.payoutAccountNumber || '',
        payoutAccountName: ev.payoutAccountName || event.payoutAccountName || '',
        organizerFeeMode: ev.organizerFeeMode || 'percentage',
        organizerFeeRate: typeof ev.organizerFeeRate === 'number' ? ev.organizerFeeRate : (event.organizerFeeRate ?? 3.0),
        customerFeeMode: ev.customerFeeMode || 'percentage',
        customerFeeRate: typeof ev.customerFeeRate === 'number' ? ev.customerFeeRate : (event.customerFeeRate ?? 0.0),
        reservePercentage: typeof ev.reservePercentage === 'number' ? ev.reservePercentage : (event.reservePercentage ?? 0.0),
        ubuPrivilegeMode: Boolean(ev.ubuPrivilegeMode ?? event.ubuPrivilegeMode),
        sessions: loadedSessions,
      };

      setEditFormData(stateObj);
      setOriginalEventData(JSON.parse(JSON.stringify(stateObj)));
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูลคอนเสิร์ต',
      });
      setEditingEvent(null);
    } finally {
      setLoadingEditData(false);
    }
  };

  // Upload image helper
  const handleUploadImage = async (
    file: File,
    field: 'posterUrl' | 'coverBannerUrl' | 'ticketTemplateUrl',
    setUploading: (loading: boolean) => void,
  ) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('visibility', 'public');
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'อัปโหลดรูปภาพไม่สำเร็จ');
      }
      const data = await res.json();
      setEditFormData((prev) => (prev ? { ...prev, [field]: data.url } : prev));
      triggerToast({ type: 'success', message: 'อัปโหลดรูปภาพสำเร็จ' });
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ',
      });
    } finally {
      setUploading(false);
    }
  };

  // Session & Zone mutations
  const handleAddSession = () => {
    if (!editFormData) return;
    const newSession: EditableSession = {
      startTime: '',
      endTime: '',
      admissionStartTime: '',
      admissionEndTime: '',
      soldCount: 0,
      ticketTypes: [
        {
          name: 'บัตรทั่วไป',
          price: 500,
          quota: 100,
          soldCount: 0,
          isStudentPrivilege: false,
          studentPrice: null,
        },
      ],
    };
    setEditFormData({
      ...editFormData,
      sessions: [...editFormData.sessions, newSession],
    });
  };

  const handleRemoveSession = (index: number) => {
    if (!editFormData) return;
    const session = editFormData.sessions[index];
    if (session?.soldCount && session.soldCount > 0) {
      triggerToast({
        type: 'error',
        message: `ไม่สามารถลบรอบการแสดงนี้ได้เนื่องจากมีผู้ซื้อบัตรแล้ว (${session.soldCount} ใบ)`,
      });
      return;
    }
    const updated = editFormData.sessions.filter((_, i) => i !== index);
    setEditFormData({ ...editFormData, sessions: updated });
  };

  const handleUpdateSession = (index: number, field: keyof EditableSession, value: unknown) => {
    if (!editFormData) return;
    const updated = [...editFormData.sessions];
    updated[index] = { ...updated[index], [field]: value };
    setEditFormData({ ...editFormData, sessions: updated });
  };

  const handleAddTicketType = (sessionIndex: number) => {
    if (!editFormData) return;
    const updatedSessions = [...editFormData.sessions];
    const session = updatedSessions[sessionIndex];
    if (!session) return;
    const newTt: EditableTicketType = {
      name: '',
      price: 0,
      quota: 50,
      soldCount: 0,
      isStudentPrivilege: false,
      studentPrice: null,
    };
    session.ticketTypes = [...session.ticketTypes, newTt];
    setEditFormData({ ...editFormData, sessions: updatedSessions });
  };

  const handleRemoveTicketType = (sessionIndex: number, ttIndex: number) => {
    if (!editFormData) return;
    const session = editFormData.sessions[sessionIndex];
    if (!session) return;
    const tt = session.ticketTypes[ttIndex];
    if (tt?.soldCount && tt.soldCount > 0) {
      triggerToast({
        type: 'error',
        message: `ไม่สามารถลบประเภทบัตร "${tt.name}" ได้เนื่องจากมีผู้ซื้อบัตรแล้ว (${tt.soldCount} ใบ)`,
      });
      return;
    }
    const updatedSessions = [...editFormData.sessions];
    updatedSessions[sessionIndex].ticketTypes = session.ticketTypes.filter((_, i) => i !== ttIndex);
    setEditFormData({ ...editFormData, sessions: updatedSessions });
  };

  const handleUpdateTicketType = (
    sessionIndex: number,
    ttIndex: number,
    field: keyof EditableTicketType,
    value: unknown,
  ) => {
    if (!editFormData) return;
    const updatedSessions = [...editFormData.sessions];
    const session = updatedSessions[sessionIndex];
    if (!session) return;
    const updatedTt = [...session.ticketTypes];
    updatedTt[ttIndex] = { ...updatedTt[ttIndex], [field]: value };
    session.ticketTypes = updatedTt;
    setEditFormData({ ...editFormData, sessions: updatedSessions });
  };

  // Emergency Sales Quick Toggle (D-278)
  const handleOpenEmergencyToggle = (event: PlatformConcertItem) => {
    setTogglingEvent(event);
    setToggleReason(event.salesPausedReason || 'ระงับการจำหน่ายบัตรชั่วคราวโดยผู้ดูแลระบบ');
  };

  const handleConfirmEmergencyToggle = async () => {
    if (!togglingEvent) return;
    setIsSubmittingToggle(true);
    const nextPaused = !togglingEvent.isSalesPaused;
    const nextReason = nextPaused ? (toggleReason.trim() || 'ระงับการจำหน่ายบัตรชั่วคราวโดยผู้ดูแลระบบ') : null;

    try {
      const res = await fetch(`/api/events/${togglingEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isSalesPaused: nextPaused,
          salesPausedReason: nextReason,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'เปลี่ยนสถานะการจำหน่ายบัตรไม่สำเร็จ');
      }

      setAllEvents(prev =>
        prev.map(ev =>
          ev.id === togglingEvent.id
            ? { ...ev, isSalesPaused: nextPaused, salesPausedReason: nextReason || undefined }
            : ev
        )
      );

      triggerToast({
        type: 'success',
        message: nextPaused
          ? `ระงับการจำหน่ายบัตรของ "${togglingEvent.title}" ชั่วคราวเรียบร้อยแล้ว`
          : `เปิดการจำหน่ายบัตรของ "${togglingEvent.title}" ตามปกติเรียบร้อยแล้ว`,
      });

      setTogglingEvent(null);
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการปรับสถานะการขายบัตร',
      });
    } finally {
      setIsSubmittingToggle(false);
    }
  };

  // Step 1: Validate and Prepare Double Confirmation Diff ("ถามฉันอีกทีเพื่อความมั่นใจ")
  const handlePrepareSubmitEdit = () => {
    if (!editingEvent || !editFormData) return;

    if (!editFormData.title.trim()) {
      triggerToast({ type: 'error', message: 'กรุณากรอกชื่อคอนเสิร์ต' });
      return;
    }
    if (!editFormData.location.trim()) {
      triggerToast({ type: 'error', message: 'กรุณากรอกสถานที่จัดงาน' });
      return;
    }
    if (editFormData.sessions.length === 0) {
      triggerToast({ type: 'error', message: 'คอนเสิร์ตต้องมีรอบการแสดงอย่างน้อย 1 รอบ' });
      return;
    }

    for (let sIdx = 0; sIdx < editFormData.sessions.length; sIdx++) {
      const s = editFormData.sessions[sIdx];
      if (!s.startTime || !s.endTime) {
        triggerToast({
          type: 'error',
          message: `รอบการแสดงที่ ${sIdx + 1}: กรุณาระบุวันเวลาเริ่มและสิ้นสุดรอบการแสดง`,
        });
        return;
      }
      if (s.ticketTypes.length === 0) {
        triggerToast({
          type: 'error',
          message: `รอบการแสดงที่ ${sIdx + 1}: ต้องมีประเภทบัตร/โซนที่นั่งอย่างน้อย 1 โซน`,
        });
        return;
      }
      for (let tIdx = 0; tIdx < s.ticketTypes.length; tIdx++) {
        const tt = s.ticketTypes[tIdx];
        if (!tt.name.trim()) {
          triggerToast({
            type: 'error',
            message: `รอบการแสดงที่ ${sIdx + 1} โซนที่ ${tIdx + 1}: กรุณากรอกชื่อโซน/ประเภทบัตร`,
          });
          return;
        }
        if (tt.price < 0) {
          triggerToast({
            type: 'error',
            message: `รอบการแสดงที่ ${sIdx + 1} โซน "${tt.name}": ราคาต้องไม่ติดลบ`,
          });
          return;
        }
        if (tt.quota < 1) {
          triggerToast({
            type: 'error',
            message: `รอบการแสดงที่ ${sIdx + 1} โซน "${tt.name}": โควตาต้องอย่างน้อย 1 ใบ`,
          });
          return;
        }
        if (tt.soldCount && tt.quota < tt.soldCount) {
          triggerToast({
            type: 'error',
            message: `รอบการแสดงที่ ${sIdx + 1} โซน "${tt.name}": โควตา (${tt.quota}) น้อยกว่าจำนวนที่ขายแล้ว (${tt.soldCount} ใบ)`,
          });
          return;
        }
      }
    }

    // Compute Itemized Diff against originalEventData
    const changesList: string[] = [];
    const orig = originalEventData;

    if (orig) {
      if (editFormData.title !== orig.title) {
        changesList.push(`ชื่อคอนเสิร์ต: "${orig.title}" -> "${editFormData.title}"`);
      }
      if (editFormData.artists !== orig.artists) {
        changesList.push(`รายชื่อศิลปิน: "${orig.artists || '-'}" -> "${editFormData.artists || '-'}"`);
      }
      if (editFormData.location !== orig.location) {
        changesList.push(`สถานที่: "${orig.location}" -> "${editFormData.location}"`);
      }
      if (editFormData.googleMapsUrl !== orig.googleMapsUrl) {
        changesList.push(`ลิงก์ Google Maps: มีการเปลี่ยนแปลง`);
      }
      if (editFormData.description !== orig.description) {
        changesList.push(`รายละเอียดคอนเสิร์ต: มีการแก้ไขข้อความ`);
      }
      if (editFormData.salesStartTime !== orig.salesStartTime) {
        changesList.push(`เวลาเริ่มขายบัตร: ${orig.salesStartTime || '-'} -> ${editFormData.salesStartTime || '-'}`);
      }
      if (editFormData.salesEndTime !== orig.salesEndTime) {
        changesList.push(`เวลาปิดขายบัตร: ${orig.salesEndTime || '-'} -> ${editFormData.salesEndTime || '-'}`);
      }
      if (editFormData.limitPerOrder !== orig.limitPerOrder) {
        changesList.push(`จำกัดบัตรต่อคำสั่งซื้อ: ${orig.limitPerOrder} -> ${editFormData.limitPerOrder} ใบ`);
      }
      if (editFormData.isSalesPaused !== orig.isSalesPaused) {
        changesList.push(`สถานะขายบัตร: ${editFormData.isSalesPaused ? 'ระงับการขายด่วน' : 'เปิดจำหน่ายปกติ'}`);
      }
      if (editFormData.salesPausedReason !== orig.salesPausedReason) {
        changesList.push(`เหตุผลการระงับขายบัตร: "${editFormData.salesPausedReason || '-'}"`);
      }
      if (editFormData.posterUrl !== orig.posterUrl) {
        changesList.push(`รูปโปสเตอร์หลัก: มีการอัปเดตหรือเปลี่ยนรูปภาพ`);
      }
      if (editFormData.coverBannerUrl !== orig.coverBannerUrl) {
        changesList.push(`แบนเนอร์หน้าปก: มีการอัปเดตหรือเปลี่ยนรูปภาพ`);
      }
      if (editFormData.ticketTemplateUrl !== orig.ticketTemplateUrl) {
        changesList.push(`แผนผังที่นั่ง: มีการอัปเดตหรือเปลี่ยนรูปภาพ`);
      }
      if (editFormData.ageRestriction !== orig.ageRestriction) {
        changesList.push(`การจำกัดอายุ: ${orig.ageRestriction} -> ${editFormData.ageRestriction}`);
      }
      if (editFormData.refundPolicy !== orig.refundPolicy) {
        changesList.push(`นโยบายคืนเงิน: ${orig.refundPolicy} -> ${editFormData.refundPolicy}`);
      }
      if (editFormData.entryGuidelines !== orig.entryGuidelines) {
        changesList.push(`กติกาเข้างาน: มีการแก้ไขข้อกำหนด`);
      }
      if (editFormData.organizerFeeMode !== orig.organizerFeeMode) {
        changesList.push(`รูปแบบค่าบริการผู้จัดงาน: ${orig.organizerFeeMode || 'percentage'} -> ${editFormData.organizerFeeMode || 'percentage'}`);
      }
      if (editFormData.organizerFeeRate !== orig.organizerFeeRate) {
        changesList.push(`ค่าบริการผู้จัดงาน: ${orig.organizerFeeRate}% -> ${editFormData.organizerFeeRate}%`);
      }
      if (editFormData.customerFeeMode !== orig.customerFeeMode) {
        changesList.push(`รูปแบบค่าบริการลูกค้า: ${orig.customerFeeMode || 'percentage'} -> ${editFormData.customerFeeMode || 'percentage'}`);
      }
      if (editFormData.customerFeeRate !== orig.customerFeeRate) {
        changesList.push(`ค่าบริการลูกค้า: ${orig.customerFeeRate}% -> ${editFormData.customerFeeRate}%`);
      }
      if (editFormData.reservePercentage !== orig.reservePercentage) {
        changesList.push(`สัดส่วนเงินสำรอง: ${orig.reservePercentage}% -> ${editFormData.reservePercentage}%`);
      }
      if (editFormData.ubuPrivilegeMode !== orig.ubuPrivilegeMode) {
        changesList.push(`สิทธิ์ ม.อุบลฯ: ${editFormData.ubuPrivilegeMode ? 'เปิดใช้งาน (@ubu.ac.th)' : 'ปิดการใช้งาน'}`);
      }
      if (
        editFormData.payoutBankName !== orig.payoutBankName ||
        editFormData.payoutAccountNumber !== orig.payoutAccountNumber ||
        editFormData.payoutAccountName !== orig.payoutAccountName
      ) {
        changesList.push(`ข้อมูลบัญชีรับเงิน (Payout Bank Account): มีการเปลี่ยนแปลง`);
      }

      // Check Sessions & Zones changes
      if (editFormData.sessions.length !== orig.sessions.length) {
        changesList.push(`จำนวนรอบการแสดง: ${orig.sessions.length} -> ${editFormData.sessions.length} รอบ`);
      }

      for (let i = 0; i < editFormData.sessions.length; i++) {
        const s = editFormData.sessions[i];
        const origS = orig.sessions[i];
        if (!origS) {
          changesList.push(`เพิ่มรอบการแสดงใหม่ (รอบที่ ${i + 1}) พร้อม ${s.ticketTypes.length} โซน`);
        } else {
          if (s.startTime !== origS.startTime || s.endTime !== origS.endTime) {
            changesList.push(`รอบที่ ${i + 1}: เปลี่ยนแปลงวันเวลาแสดง`);
          }
          if (s.admissionStartTime !== origS.admissionStartTime || s.admissionEndTime !== origS.admissionEndTime) {
            changesList.push(`รอบที่ ${i + 1}: เปลี่ยนแปลงเวลาเปิดประตูเข้างาน`);
          }
          if (s.ticketTypes.length !== origS.ticketTypes.length) {
            changesList.push(`รอบที่ ${i + 1}: จำนวนโซนที่นั่ง ${origS.ticketTypes.length} -> ${s.ticketTypes.length} โซน`);
          }
          for (let j = 0; j < s.ticketTypes.length; j++) {
            const tt = s.ticketTypes[j];
            const origTt = origS.ticketTypes[j];
            if (!origTt) {
              changesList.push(`รอบที่ ${i + 1}: เพิ่มโซนใหม่ "${tt.name}" ราคา ${tt.price} บ. โควตา ${tt.quota} ใบ`);
            } else {
              if (tt.name !== origTt.name) {
                changesList.push(`รอบที่ ${i + 1} โซนที่ ${j + 1}: เปลี่ยนชื่อ "${origTt.name}" -> "${tt.name}"`);
              }
              if (tt.price !== origTt.price) {
                changesList.push(`รอบที่ ${i + 1} โซน "${tt.name}": เปลี่ยนราคา ${origTt.price} -> ${tt.price} บาท`);
              }
              if (tt.quota !== origTt.quota) {
                changesList.push(`รอบที่ ${i + 1} โซน "${tt.name}": เปลี่ยนโควตา ${origTt.quota} -> ${tt.quota} ใบ`);
              }
              if (tt.isStudentPrivilege !== origTt.isStudentPrivilege || tt.studentPrice !== origTt.studentPrice) {
                changesList.push(`รอบที่ ${i + 1} โซน "${tt.name}": ปรับปรุงเงื่อนไขสิทธิ์นักศึกษา`);
              }
            }
          }
        }
      }
    }

    if (changesList.length === 0) {
      changesList.push('ไม่มีการแก้ไขข้อมูล (บันทึกข้อมูลเดิม)');
    }

    setPendingChangesList(changesList);
    setShowConfirmModal(true);
  };

  function toSafeIsoString(val?: string | null): string | null {
    if (!val || typeof val !== 'string' || !val.trim()) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Step 2: Final Confirm & Execute Admin Override with Auto CSV Snapshot Backup (D-227, D-278)
  const handleFinalConfirmOverride = async () => {
    if (!editingEvent || !editFormData) return;
    setSavingEdit(true);
    setError('');

    try {
      // 1. Generate Pre-Edit CSV Snapshot for backup and trigger download
      const preEditSnapshot: ConcertSnapshotData = {
        id: editingEvent.id,
        title: editingEvent.title,
        artists: editingEvent.artists,
        location: editingEvent.location,
        organizerName: editingEvent.organizerName,
        status: editingEvent.status,
        description: editingEvent.description,
        salesStartTime: editingEvent.salesStartTime,
        salesEndTime: editingEvent.salesEndTime,
        isSalesPaused: editingEvent.isSalesPaused,
        salesPausedReason: editingEvent.salesPausedReason,
        ageRestriction: editingEvent.ageRestriction,
        refundPolicy: editingEvent.refundPolicy,
        entryGuidelines: editingEvent.entryGuidelines,
        ubuPrivilegeMode: editingEvent.ubuPrivilegeMode,
        organizerFeeRate: editingEvent.organizerFeeRate ?? 3.0,
        customerFeeRate: editingEvent.customerFeeRate ?? 0.0,
        reservePercentage: editingEvent.reservePercentage ?? 0.0,
      };
      const snapshotCsv = generateConcertCsvSnapshot(preEditSnapshot);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      triggerCsvDownload(snapshotCsv, `backup-concert-${editingEvent.id}-${timestamp}.csv`);

      // 2. Prepare API payload
      const payload = {
        title: editFormData.title.trim(),
        artists: editFormData.artists.trim(),
        location: editFormData.location.trim(),
        googleMapsUrl: editFormData.googleMapsUrl.trim(),
        description: editFormData.description.trim(),
        salesStartTime: toSafeIsoString(editFormData.salesStartTime),
        salesEndTime: toSafeIsoString(editFormData.salesEndTime),
        limitPerOrder: Number(editFormData.limitPerOrder) || 6,
        isSalesPaused: Boolean(editFormData.isSalesPaused),
        salesPausedReason: editFormData.isSalesPaused
          ? (editFormData.salesPausedReason.trim() || 'ระงับการจำหน่ายบัตรชั่วคราวโดยผู้ดูแลระบบ')
          : null,
        ageRestriction: editFormData.ageRestriction,
        refundPolicy: editFormData.refundPolicy,
        entryGuidelines: editFormData.entryGuidelines.trim(),
        posterUrl: editFormData.posterUrl.trim() || null,
        coverBannerUrl: editFormData.coverBannerUrl.trim() || null,
        ticketTemplateUrl: null,
        payoutBankName: null,
        payoutAccountNumber: null,
        payoutAccountName: null,
        organizerFeeMode: editFormData.organizerFeeMode || 'percentage',
        organizerFeeRate: Number(editFormData.organizerFeeRate),
        customerFeeMode: editFormData.customerFeeMode || 'percentage',
        customerFeeRate: Number(editFormData.customerFeeRate),
        reservePercentage: Number(editFormData.reservePercentage),
        ubuPrivilegeMode: Boolean(editFormData.ubuPrivilegeMode),
        changesSummary: pendingChangesList.length > 0 ? pendingChangesList : ['แก้ไขและอัปเดตข้อมูลคอนเสิร์ตโดยผู้ดูแลระบบ'],
        snapshotCsv,
        sessions: editFormData.sessions.map((s) => ({
          id: s.id,
          startTime: toSafeIsoString(s.startTime) || new Date().toISOString(),
          endTime: toSafeIsoString(s.endTime) || new Date().toISOString(),
          admissionStartTime: toSafeIsoString(s.admissionStartTime),
          admissionEndTime: toSafeIsoString(s.admissionEndTime),
          ticketTypes: s.ticketTypes.map((tt) => ({
            id: tt.id,
            name: tt.name.trim(),
            price: Number(tt.price),
            quota: Number(tt.quota),
            isStudentPrivilege: Boolean(tt.isStudentPrivilege),
            studentPrice: tt.isStudentPrivilege && tt.studentPrice != null ? Number(tt.studentPrice) : null,
            description: tt.description?.trim() || '',
          })),
        })),
      };

      const res = await fetch(`/api/owner/events/${editingEvent.id}/override`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'บันทึกการแก้ไขคอนเสิร์ตไม่สำเร็จ');
      }

      // 3. Append to Audit Log
      const newLogEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toLocaleString('th-TH'),
        editor: 'เจ้าของระบบ (Admin/Owner)',
        changesSummary: payload.changesSummary,
        snapshotCsv,
      };

      setAuditLogs((prev) => ({
        ...prev,
        [editingEvent.id]: [newLogEntry, ...(prev[editingEvent.id] || [])],
      }));

      triggerToast({
        type: 'success',
        message: `บันทึกการแก้ไขคอนเสิร์ต "${editFormData.title}" สำเร็จ พร้อมดาวน์โหลดไฟล์สำรอง CSV ก่อนแก้ไขอัตโนมัติ`,
      });

      setShowConfirmModal(false);
      setEditingEvent(null);
      setEditFormData(null);
      await loadData();
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // Alias for submit edit triggering Step 1 validation and Double Confirmation modal (D-227, D-278)
  const handleSaveAdminEdit = handlePrepareSubmitEdit;

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

        <div className="concert-management-pipeline">
          {/* Reorganized Header & Unified Toolbar with Refunds Shortcut (D-239, D-241) */}
          <div className="hub-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div className="hub-header-left">
              <h2 className="pipeline-title">ศูนย์จัดการและอนุมัติคอนเสิร์ต (Concert Management Hub)</h2>
              <p className="pipeline-subtitle">
                ตรวจสอบรายละเอียดคอนเสิร์ต กำหนดอัตราค่าบริการ อนุมัติเผยแพร่สู่ลูกค้า และติดตามสถิติคอนเสิร์ต
              </p>
              {loading && <p className="pipeline-loading-text" style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>กำลังโหลดข้อมูลล่าสุด...</p>}
            </div>
            <div className="hub-header-right">
              <a
                href="#refunds"
                className="secondary-button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  padding: '0.5rem 0.85rem',
                }}
              >
                <BanknotesIcon className="btn-icon" style={{ width: '16px', height: '16px' }} />
                <span>จัดการคำขอคืนเงินและการโอนคืน (Refunds & Payouts) &rarr;</span>
              </a>
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

              <button
                type="button"
                className={`hub-filter-tab pipeline-status-tab ${statusTab === 'analytics' ? 'is-active active' : ''}`}
                onClick={() => {
                  setStatusTab('analytics');
                  if (!viewingAnalyticsEvent && allEvents.length > 0) {
                    const def = allEvents.find((e) => e.status === 'approved') || allEvents[0];
                    setViewingAnalyticsEvent(def);
                  }
                }}
                role="tab"
                aria-selected={statusTab === 'analytics'}
              >
                <span>สถิติเชิงลึก (Analytics)</span>
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
                onClick={async () => {
                  await loadData();
                  triggerRefreshToast('จัดการคอนเสิร์ต');
                }}
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
              <p style={{ fontSize: '1rem', fontWeight: 400 }}>
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
                    aria-label="คำขอแก้ไขรอบที่เปิดขายอยู่ คำขอปรับเปลี่ยนราคาและโซนที่รออนุมัติ (Live Session Amendments)"
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

                          {amd.concertDetails && (
                            <div className="row-tags-strip" style={{ marginTop: '0.35rem' }}>
                              <span className="row-detail-pill" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0f172a' }}>
                                <strong>ขอแก้ไขข้อมูลคอนเสิร์ต:</strong>
                                {amd.concertDetails.title ? ` ชื่อ: "${String(amd.concertDetails.title)}"` : ''}
                                {amd.concertDetails.artists ? ` · ศิลปิน: "${String(amd.concertDetails.artists)}"` : ''}
                                {amd.concertDetails.location ? ` · สถานที่: "${String(amd.concertDetails.location)}"` : ''}
                              </span>
                            </div>
                          )}

                          <details open className="special-refund-accordion" style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748b' }}>
                            <summary style={{ cursor: 'pointer', padding: '0.15rem 0' }}>
                              กำหนดช่วงเวลาคืนเงินพิเศษเพิ่มเติม (ระบุวันเวลาด้วยตนเอง)
                            </summary>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                              <DateTimePicker24h
                                data-testid={`srw-start-${amd.id}`}
                                value={specialWindows[amd.id]?.start || ''}
                                onChange={(val) =>
                                  setSpecialWindows((prev) => ({
                                    ...prev,
                                    [amd.id]: { start: val, end: prev[amd.id]?.end || '' },
                                  }))
                                }
                                ariaLabel="วันเริ่มต้นคืนเงินพิเศษ"
                              />
                              <DateTimePicker24h
                                data-testid={`srw-end-${amd.id}`}
                                value={specialWindows[amd.id]?.end || ''}
                                onChange={(val) =>
                                  setSpecialWindows((prev) => ({
                                    ...prev,
                                    [amd.id]: { start: prev[amd.id]?.start || '', end: val },
                                  }))
                                }
                                ariaLabel="วันสิ้นสุดคืนเงินพิเศษ"
                              />
                            </div>
                          </details>

                          {rejectingAmendmentId === amd.id && (
                            <div className="rejection-box" style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                              <label htmlFor={`reject-amd-reason-${amd.id}`} className="field-label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 400, marginBottom: '0.25rem' }}>
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
                            aria-label="อนุมัติการแก้ไขราคา"
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
                              <label htmlFor={`reject-can-reason-${can.id}`} className="field-label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 400, marginBottom: '0.25rem' }}>
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
                            aria-label="อนุมัติยกเลิกรอบการแสดง"
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
                        {/* Row 1: Status Badge (D-243, D-278) */}
                        <div className="row-card-badge-row">
                          <span className={`status-badge ${concertSalesStatus(ev).open ? 'approved' : 'paused'}`}>
                            {concertSalesStatus(ev).label}
                          </span>
                          {ev.isSalesPaused && (
                            <span className="emergency-paused-tag" title={ev.salesPausedReason || undefined}>
                              {ev.salesPausedReason || 'ระงับการขายชั่วคราว'}
                            </span>
                          )}
                          {ev.artists && (
                            <span className="row-artist-tag" title={ev.artists}>
                              ศิลปิน: {ev.artists.length > 25 ? `${ev.artists.slice(0, 25)}...` : ev.artists}
                            </span>
                          )}
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
                            <strong>รอบการแสดง:</strong> {Number(ev.sessionCount ?? 0)} รอบ
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
                        {/* Emergency Sales Quick Toggle (D-278 Q1 -> A1) */}
                        <button
                          type="button"
                          className={`row-action-btn emergency-sales-toggle-btn ${ev.isSalesPaused ? 'sales-paused' : 'sales-active'}`}
                          disabled={!ev.approvedSessionCount}
                          onClick={() => handleOpenEmergencyToggle(ev)}
                          title={ev.isSalesPaused ? 'คลิกเพื่อเปิดการจำหน่ายบัตรตามปกติ' : 'คลิกเพื่อระงับการจำหน่ายบัตรด่วน'}
                          data-testid={`emergency-toggle-btn-${ev.id}`}
                        >
                          <span className="sales-toggle-dot" />
                          <span>{ev.isSalesPaused ? 'เปิดการจำหน่ายบัตร' : 'ระงับการขายด่วน'}</span>
                        </button>

                        <button
                          type="button"
                          className="primary-button row-action-btn"
                          onClick={() => {
                            setAnalytics(null);
                            setAnalyticsError(null);
                            setViewingAnalyticsEvent(ev);
                          }}
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

          {/* TAB 4: DEDICATED CONCERT PERFORMANCE ANALYTICS (D-226) */}
          {statusTab === 'analytics' && (
            <div className="pipeline-tab-content" data-testid="analytics-tab-content">
              {/* Event Selector Top Bar */}
              <div className="analytics-concert-selector-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <label htmlFor="analytics-event-select" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#334155' }}>
                    เลือกคอนเสิร์ตที่ต้องการดูสถิติ:
                  </label>
                  <select
                    id="analytics-event-select"
                    className="hub-sort-select"
                    value={viewingAnalyticsEvent?.id || ''}
                    onChange={(e) => {
                      const selected = allEvents.find((ev) => ev.id === e.target.value);
                      if (selected) {
                        setAnalytics(null);
                        setAnalyticsError(null);
                        setViewingAnalyticsEvent(selected);
                      }
                    }}
                    style={{ minWidth: '280px' }}
                    aria-label="เลือกคอนเสิร์ตเพื่อดูสถิติ"
                  >
                    <option value="" disabled>-- เลือกคอนเสิร์ตที่ต้องการดูสถิติ --</option>
                    {allEvents.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.location})
                      </option>
                    ))}
                  </select>
                </div>
                {viewingAnalyticsEvent && (
                  <button
                    type="button"
                    className="secondary-button export-analytics-btn"
                    onClick={() => handleExportCurrentCsv(viewingAnalyticsEvent)}
                  >
                    <DownloadIcon className="btn-icon" />
                    <span>ดาวน์โหลดข้อมูลคอนเสิร์ต CSV</span>
                  </button>
                )}
              </div>

              {viewingAnalyticsEvent ? (
                <section className="dedicated-concert-analytics-view" data-testid="dedicated-concert-analytics" style={{ border: 'none', padding: 0 }}>
                  <header className="analytics-view-header" style={{ marginBottom: '1.25rem' }}>
                    <div className="analytics-header-left">
                      <button
                        type="button"
                        className="secondary-button back-to-pipeline-btn"
                        onClick={() => {
                          setViewingAnalyticsEvent(null);
                          setStatusTab('approved');
                        }}
                        style={{ marginBottom: '0.5rem', display: 'inline-flex', alignItems: 'center' }}
                      >
                        <span>← กลับสู่หน้าจัดการคอนเสิร์ต</span>
                      </button>
                      <h2 className="analytics-event-title">{viewingAnalyticsEvent.title}</h2>
                      <p className="analytics-event-meta">
                        <span>ผู้จัดงาน: {viewingAnalyticsEvent.organizerName || '-'}</span>
                        <span>·</span>
                        <span>สถานที่: {viewingAnalyticsEvent.location}</span>
                        <span>·</span>
                        <span>สถานะ: {concertSalesStatus(viewingAnalyticsEvent).label}</span>
                      </p>
                    </div>
                  </header>

                  {analyticsError && <p role="alert">{analyticsError}</p>}
                  {!analytics && !analyticsError && <p role="status">กำลังโหลดสถิติคอนเสิร์ต...</p>}
                  {analytics && (
                    <>
                      <div className="concert-analytics-kpi-grid">
                        <div className="analytics-kpi-card">
                          <div className="kpi-card-head">
                            <span className="kpi-card-label">รายได้รวมจากการขายบัตร</span>
                            <BanknotesIcon className="borderless-kpi-icon" />
                          </div>
                          <div className="kpi-card-value">{formatBaht(analytics.grossSales)}</div>
                          <p className="kpi-card-sub">ยอดขายบัตรก่อนหักเงินคืนและค่าบริการ</p>
                        </div>
                        <div className="analytics-kpi-card">
                          <div className="kpi-card-head">
                            <span className="kpi-card-label">รายได้สุทธิหลังหักค่าบริการ</span>
                            <CheckCircleIcon className="borderless-kpi-icon" />
                          </div>
                          <div className="kpi-card-value">{formatBaht(analytics.netEntitlement)}</div>
                          <p className="kpi-card-sub">ค่าบริการผู้จัด {formatBaht(analytics.organizerFee)}</p>
                        </div>
                        <div className="analytics-kpi-card">
                          <div className="kpi-card-head">
                            <span className="kpi-card-label">ยอดจำหน่ายบัตรจริง</span>
                            <TicketIcon className="borderless-kpi-icon" />
                          </div>
                          <div className="kpi-card-value">{analytics.issuedTickets} ใบ</div>
                          <p className="kpi-card-sub">จำนวนบัตรที่ออกทั้งหมด รวมบัตรที่คืนเงินแล้ว</p>
                        </div>
                        <div className="analytics-kpi-card">
                          <div className="kpi-card-head">
                            <span className="kpi-card-label">สิทธิ์พิเศษ โค้ดส่วนลด และคืนบัตร</span>
                            <SlidersIcon className="borderless-kpi-icon" />
                          </div>
                          <div className="kpi-exceptions-list">
                            <div className="kpi-exception-item">
                              <span>คำสั่งซื้อที่ใช้สิทธิ์ ม.อุบลฯ</span><strong>{analytics.ubuOrders} รายการ</strong>
                            </div>
                            <div className="kpi-exception-item">
                              <span>คำสั่งซื้อที่มีส่วนลด</span><strong>{analytics.discountedOrders} รายการ</strong>
                            </div>
                            <div className="kpi-exception-item">
                              <span>คืนเงินแล้ว</span>
                              <strong>{analytics.refundedTickets} ใบ ({formatBaht(analytics.approvedRefunds)})</strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="analytics-tier-breakdown-card">
                        <h3 className="card-inner-heading">แจกแจงยอดขายตามประเภทบัตร / โซน</h3>
                        {analytics.tiers.length === 0 ? <p>ยังไม่มีประเภทบัตร</p> : (
                          <div className="table-responsive">
                            <table className="enterprise-analytics-table">
                              <thead>
                                <tr>
                                  <th>ประเภทบัตร / โซน</th>
                                  <th>รอบการแสดง</th>
                                  <th>ราคาบัตร</th>
                                  <th>บัตรที่ออก</th>
                                  <th>โควตาทั้งหมด</th>
                                  <th>ยอดขายรวม</th>
                                </tr>
                              </thead>
                              <tbody>
                                {analytics.tiers.map((tier) => (
                                  <tr key={tier.id}>
                                    <td><strong>{tier.name}</strong></td>
                                    <td>{safeFormatDateTime(tier.startTime)}{tier.status === 'cancelled' && ' (ยกเลิก)'}</td>
                                    <td>{formatBaht(tier.price)}</td>
                                    <td>{tier.sold} ใบ</td>
                                    <td>{tier.quota} ใบ</td>
                                    <td>{formatBaht(tier.gross)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              ) : (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
                  <p>กรุณาเลือกคอนเสิร์ตจากเมนูด้านบนเพื่อดูสถิติเชิงลึก</p>
                </div>
              )}
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
                          {(() => {
                            const safeMapsUrl = sanitizeGoogleMapsUrl(
                              reviewingSession.googleMapsUrl || reviewingEventDetails?.googleMapsUrl,
                            );
                            return safeMapsUrl ? (
                              <a
                                href={safeMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#0369a1', textDecoration: 'underline' }}
                              >
                                เปิดดูพิกัดแผนที่
                              </a>
                            ) : (
                              'ไม่ได้ระบุลิงก์แผนที่'
                            );
                          })()}
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
                            <div key={tt.id} className="ticket-type-pill" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.65rem 0.85rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <strong>{tt.name}</strong>
                                <span className="quota-tag">โควตารวม: {tt.quota} ใบ</span>
                              </div>
                              {tt.isStudentPrivilege ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', background: '#f8fafc', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px dashed #cbd5e1', width: '100%' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <span style={{ color: '#475569' }}>ราคาคนทั่วไป:</span>
                                    <strong style={{ color: '#0f172a' }}>{formatBaht(tt.price)}</strong>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <span style={{ color: '#1848ed' }}>ราคาสิทธิ์ ม.อุบลฯ (@ubu.ac.th):</span>
                                    <strong style={{ color: '#1848ed' }}>{formatBaht(tt.studentPrice ?? 99)}</strong>
                                  </div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }}>
                                    ใช้โควตาเดียวกัน {tt.quota} ใบ (ไม่แยกโซน)
                                  </span>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', width: '100%' }}>
                                  <span style={{ color: '#475569' }}>ราคาปกติ:</span>
                                  <strong>{formatBaht(tt.price)}</strong>
                                </div>
                              )}
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
                        <label htmlFor="custom-organizer-fee-mode-select">
                          รูปแบบค่าบริการผู้จัดงาน
                        </label>
                        <select
                          id="custom-organizer-fee-mode-select"
                          value={customOrganizerFeeMode}
                          onChange={(e) => setCustomOrganizerFeeMode(e.target.value as OrganizerFeeMode)}
                          className="adj-input"
                        >
                          <option value="percentage">เปอร์เซ็นต์ยอดขาย (%)</option>
                          <option value="per_ticket">บาทต่อใบ (฿/ใบ)</option>
                          <option value="flat_fee">เหมาจ่ายต่องาน (฿)</option>
                        </select>
                      </div>

                      <div className="adj-field">
                        <label htmlFor="custom-organizer-fee-input">
                          {customOrganizerFeeMode === 'percentage'
                            ? 'ค่าบริการผู้จัดงาน (Organizer Platform Fee %)'
                            : 'ค่าบริการผู้จัดงาน (Organizer Platform Fee ฿)'}
                        </label>
                        <input
                          id="custom-organizer-fee-input"
                          type="number"
                          step={customOrganizerFeeMode === 'percentage' ? '0.1' : '1'}
                          min="0"
                          max={customOrganizerFeeMode === 'percentage' ? 30 : 100000}
                          value={customFeeRate}
                          onChange={(e) => setCustomFeeRate(Number(e.target.value))}
                          className="adj-input"
                        />
                      </div>

                      <div className="adj-field">
                        <label htmlFor="custom-customer-fee-mode-select">
                          รูปแบบค่าบริการลูกค้า
                        </label>
                        <select
                          id="custom-customer-fee-mode-select"
                          value={customCustomerFeeMode}
                          onChange={(e) => setCustomCustomerFeeMode(e.target.value as CustomerFeeMode)}
                          className="adj-input"
                        >
                          <option value="percentage">เปอร์เซ็นต์ค่าบัตร (%)</option>
                          <option value="per_ticket">บาทต่อใบ (฿/ใบ)</option>
                          <option value="per_order">บาทต่อคำสั่งซื้อ (฿/คำสั่งซื้อ)</option>
                        </select>
                      </div>

                      <div className="adj-field">
                        <label htmlFor="custom-customer-fee-input">
                          {customCustomerFeeMode === 'percentage'
                            ? 'ค่าบริการลูกค้า (Customer Service Fee %)'
                            : 'ค่าบริการลูกค้า (Customer Service Fee ฿)'}
                        </label>
                        <input
                          id="custom-customer-fee-input"
                          type="number"
                          step={customCustomerFeeMode === 'percentage' ? '0.1' : '1'}
                          min="0"
                          max={customCustomerFeeMode === 'percentage' ? 20 : 1000}
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
          MODAL 2: ADMIN EDIT DRAWER WITH ALL-IN-ONE CAPABILITIES (D-227)
          ========================================================= */}
      {editingEvent && (
        <div className="admin-edit-drawer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-drawer-title">
          <button
            type="button"
            className="review-modal-backdrop"
            onClick={() => {
              if (!savingEdit) {
                setEditingEvent(null);
                setEditFormData(null);
              }
            }}
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
                  งาน: <strong>{editingEvent.title}</strong> · ปรับปรุงข้อมูลได้ครบทุกส่วน พร้อมระบบถามซ้ำและสำรอง CSV อัตโนมัติ
                </p>
              </div>
              <button
                type="button"
                className="review-modal-close"
                onClick={() => {
                  if (!savingEdit) {
                    setEditingEvent(null);
                    setEditFormData(null);
                  }
                }}
                aria-label="ปิดหน้าต่างแก้ไข"
              >
                <XIcon />
              </button>
            </header>

            <div className="review-modal-body">
              {loadingEditData ? (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
                  <RefreshIcon className="spin-icon" style={{ width: '28px', height: '28px', marginBottom: '0.75rem' }} />
                  <p style={{ margin: 0, fontWeight: 400 }}>กำลังโหลดข้อมูลคอนเสิร์ตและรอบการแสดงทั้งหมด...</p>
                </div>
              ) : editFormData ? (
                <div className="edit-form-stack">
                  {/* Section 1: Event Details & Artists */}
                  <div className="admin-override-section">
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h4 className="admin-override-section-title" style={{ borderBottom: 'none', paddingBottom: 0, margin: 0 }}>
                        <span>1. ข้อมูลงาน & ศิลปิน</span>
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        แสดงที่: หน้ารายละเอียดคอนเสิร์ตบนเว็บไซต์ (/events/[id]) และแคตตาล็อกหน้าแรก (/)
                      </span>
                    </div>

                    <div className="form-field">
                      <label htmlFor="edit-concert-title">ชื่อคอนเสิร์ต *</label>
                      <input
                        id="edit-concert-title"
                        type="text"
                        value={editFormData.title}
                        onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                        className="text-input"
                        placeholder="ระบุชื่อคอนเสิร์ต"
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="edit-concert-artists">รายชื่อศิลปิน / ไลน์อัป (Artists Lineup)</label>
                      <input
                        id="edit-concert-artists"
                        type="text"
                        value={editFormData.artists}
                        onChange={(e) => setEditFormData({ ...editFormData, artists: e.target.value })}
                        className="text-input"
                        placeholder="เช่น THE NEON BAND, ELECTRIC DREAMS (คั่นด้วยจุลภาค)"
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="edit-concert-desc">รายละเอียดคอนเสิร์ต</label>
                      <textarea
                        id="edit-concert-desc"
                        rows={3}
                        value={editFormData.description}
                        onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                        className="text-input"
                        placeholder="รายละเอียดงาน กำหนดการ ข้อความประชาสัมพันธ์..."
                      />
                    </div>
                  </div>

                  {/* Section 2: Location & Maps */}
                  <div className="admin-override-section">
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h4 className="admin-override-section-title" style={{ borderBottom: 'none', paddingBottom: 0, margin: 0 }}>
                        <span>2. สถานที่ & แผนที่</span>
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        แสดงที่: ข้อมูลสถานที่จัดงานบนบัตรคอนเสิร์ต หน้างาน และลิงก์นำทาง Google Maps
                      </span>
                    </div>

                    <div className="form-row-two-col">
                      <div className="form-field">
                        <label htmlFor="edit-concert-location">สถานที่จัดงาน *</label>
                        <input
                          id="edit-concert-location"
                          type="text"
                          value={editFormData.location}
                          onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                          className="text-input"
                          placeholder="เช่น ศูนย์ประชุมนานาชาติ ม.อุบลฯ"
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="edit-concert-maps">ลิงก์แผนที่ Google Maps</label>
                        <input
                          id="edit-concert-maps"
                          type="url"
                          value={editFormData.googleMapsUrl}
                          onChange={(e) => setEditFormData({ ...editFormData, googleMapsUrl: e.target.value })}
                          className="text-input"
                          placeholder="https://maps.app.goo.gl/..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Schedule, Limits & Guidelines */}
                  <div className="admin-override-section">
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h4 className="admin-override-section-title" style={{ borderBottom: 'none', paddingBottom: 0, margin: 0 }}>
                        <span>3. กำหนดการ & กติกา</span>
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        แสดงที่: แถบแจ้งเตือนเวลาขายบัตร เงื่อนไขคำสั่งซื้อ กติกาการเข้างาน และนโยบายการคืนเงิน
                      </span>
                    </div>

                    <div className="form-row-three-col">
                      <div className="form-field">
                        <label htmlFor="edit-sales-start">วันเวลาเริ่มจำหน่ายบัตร (24 ชม.)</label>
                        <DateTimePicker24h
                          id="edit-sales-start"
                          value={editFormData.salesStartTime}
                          onChange={(val) => setEditFormData({ ...editFormData, salesStartTime: val })}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="edit-sales-end">วันเวลาปิดจำหน่ายบัตร (24 ชม.)</label>
                        <DateTimePicker24h
                          id="edit-sales-end"
                          value={editFormData.salesEndTime}
                          onChange={(val) => setEditFormData({ ...editFormData, salesEndTime: val })}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="edit-limit-per-order">จำกัดบัตรต่อคำสั่งซื้อ (ใบ)</label>
                        <input
                          id="edit-limit-per-order"
                          type="number"
                          min="1"
                          max="20"
                          value={editFormData.limitPerOrder}
                          onChange={(e) => setEditFormData({ ...editFormData, limitPerOrder: Number(e.target.value) || 1 })}
                          className="text-input"
                        />
                      </div>
                    </div>

                    <div className="form-row-two-col" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                      <div className="form-field">
                        <label htmlFor="edit-age-restriction">การจำกัดอายุ</label>
                        <select
                          id="edit-age-restriction"
                          value={editFormData.ageRestriction}
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
                          value={editFormData.refundPolicy}
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
                        value={editFormData.entryGuidelines}
                        onChange={(e) => setEditFormData({ ...editFormData, entryGuidelines: e.target.value })}
                        className="text-input"
                        placeholder="เช่น ห้ามนำอาหารและเครื่องดื่มเข้าพื้นที่..."
                      />
                    </div>

                    {editFormData.isSalesPaused && (
                      <div className="emergency-pause-control-card form-field" style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px' }}>
                        <label htmlFor="edit-paused-reason" style={{ color: '#991b1b', fontWeight: 500 }}>
                          เหตุผลการระงับการจำหน่ายบัตรชั่วคราว (แสดงให้ลูกค้าทราบบนหน้าเว็บ):
                        </label>
                        <input
                          id="edit-paused-reason"
                          type="text"
                          value={editFormData.salesPausedReason}
                          onChange={(e) => setEditFormData({ ...editFormData, salesPausedReason: e.target.value })}
                          className="text-input"
                          placeholder="เช่น ระงับการจำหน่ายบัตรชั่วคราวเพื่อตรวจสอบความเรียบร้อยของระบบ..."
                        />
                      </div>
                    )}
                  </div>

                  {/* Section 4: Sessions & Zones Builder */}
                  <div className="admin-override-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div>
                        <h4 className="admin-override-section-title" style={{ borderBottom: 'none', paddingBottom: 0, margin: 0 }}>
                          <span>4. รอบ & โซนบัตร</span>
                        </h4>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          จัดการรอบการแสดง วันที่ เวลา และประเภทบัตร/โซนราคา
                        </span>
                      </div>
                      <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                        onClick={handleAddSession}
                      >
                        <PlusIcon className="btn-icon" />
                        <span>เพิ่มรอบการแสดงใหม่</span>
                      </button>
                    </div>

                    {/* Current UBU Privilege Status Banner */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.65rem 0.85rem', backgroundColor: editFormData.ubuPrivilegeMode ? '#f0fdf4' : '#f8fafc', border: `1px solid ${editFormData.ubuPrivilegeMode ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: '6px', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.85rem', color: '#334155' }}>สถานะสิทธิ์ ม.อุบลฯ ของงานนี้:</strong>
                        <span className={`status-badge ${editFormData.ubuPrivilegeMode ? 'approved' : 'paused'}`} style={{ fontSize: '0.75rem' }}>
                          {editFormData.ubuPrivilegeMode ? 'เปิดใช้งานสิทธิ์ (@ubu.ac.th)' : 'ปิดการใช้งานสิทธิ์'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {editFormData.ubuPrivilegeMode ? 'นักศึกษาและบุคลากรซื้อได้ตามราคาสิทธิ์ที่ระบุในแต่ละโซน' : 'ทุกคนซื้อในราคาบุคคลทั่วไป'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {editFormData.sessions.map((sess, sIdx) => (
                        <div key={sess.id || `session-new-${sIdx}`} className="session-editor-card">
                          <div className="session-editor-header">
                            <span className="session-badge">
                              <TicketIcon style={{ width: '18px', height: '18px' }} />
                              <span>รอบการแสดงที่ {sIdx + 1} {sess.soldCount && sess.soldCount > 0 ? `(มีผู้ซื้อแล้ว ${sess.soldCount} ใบ)` : ''}</span>
                            </span>
                            {editFormData.sessions.length > 1 && (
                              <button
                                type="button"
                                className="secondary-button"
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.3rem 0.6rem',
                                  color: sess.soldCount && sess.soldCount > 0 ? '#94a3b8' : '#dc2626',
                                  cursor: sess.soldCount && sess.soldCount > 0 ? 'not-allowed' : 'pointer',
                                }}
                                disabled={Boolean(sess.soldCount && sess.soldCount > 0)}
                                title={sess.soldCount && sess.soldCount > 0 ? 'ไม่สามารถลบรอบการแสดงที่มีผู้ซื้อบัตรแล้ว' : 'ลบรอบการแสดงนี้'}
                                onClick={() => handleRemoveSession(sIdx)}
                              >
                                <TrashIcon className="btn-icon" />
                                <span>ลบรอบนี้</span>
                              </button>
                            )}
                          </div>

                          <div className="form-row-two-col">
                            <div className="form-field">
                              <label htmlFor={`sess-${sIdx}-start`}>วันเวลาเริ่มการแสดง (24 ชม.) *</label>
                              <DateTimePicker24h
                                id={`sess-${sIdx}-start`}
                                value={sess.startTime}
                                onChange={(val) => handleUpdateSession(sIdx, 'startTime', val)}
                              />
                            </div>
                            <div className="form-field">
                              <label htmlFor={`sess-${sIdx}-end`}>วันเวลาสิ้นสุดการแสดง (24 ชม.) *</label>
                              <DateTimePicker24h
                                id={`sess-${sIdx}-end`}
                                value={sess.endTime}
                                onChange={(val) => handleUpdateSession(sIdx, 'endTime', val)}
                              />
                            </div>
                          </div>

                          <div className="form-row-two-col">
                            <div className="form-field">
                              <label htmlFor={`sess-${sIdx}-adm-start`}>เวลาเริ่มเข้างาน (ประตูเปิด 24 ชม.)</label>
                              <DateTimePicker24h
                                id={`sess-${sIdx}-adm-start`}
                                value={sess.admissionStartTime || ''}
                                onChange={(val) => handleUpdateSession(sIdx, 'admissionStartTime', val)}
                              />
                            </div>
                            <div className="form-field">
                              <label htmlFor={`sess-${sIdx}-adm-end`}>เวลาสิ้นสุดการเข้างาน (ประตูปิด 24 ชม.)</label>
                              <DateTimePicker24h
                                id={`sess-${sIdx}-adm-end`}
                                value={sess.admissionEndTime || ''}
                                onChange={(val) => handleUpdateSession(sIdx, 'admissionEndTime', val)}
                              />
                            </div>
                          </div>

                          {/* Ticket Types / Zones */}
                          <div style={{ marginTop: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <strong style={{ fontSize: '0.8125rem', color: '#334155' }}>ประเภทบัตรและโซนที่นั่งในรอบนี้:</strong>
                              <button
                                type="button"
                                className="secondary-button"
                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                                onClick={() => handleAddTicketType(sIdx)}
                              >
                                <PlusIcon className="btn-icon" />
                                <span>เพิ่มโซน/ประเภทบัตร</span>
                              </button>
                            </div>

                            <div className="zone-editor-table-wrap">
                              <table className="zone-editor-table">
                                <thead>
                                  <tr>
                                    <th className="zone-editor-th" style={{ width: '28%' }}>ชื่อโซน/บัตร</th>
                                    <th className="zone-editor-th" style={{ width: '18%' }}>ราคา (บ.)</th>
                                    <th className="zone-editor-th" style={{ width: '18%' }}>โควตา (ใบ)</th>
                                    <th className="zone-editor-th" style={{ width: '22%' }}>สิทธิ์ นศ. ม.อุบลฯ</th>
                                    <th className="zone-editor-th" style={{ width: '14%' }}>การกระทำ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sess.ticketTypes.map((tt, tIdx) => {
                                    const hasSold = Boolean(tt.soldCount && tt.soldCount > 0);
                                    return (
                                      <tr key={tt.id || `tt-${sIdx}-${tIdx}`}>
                                        <td className="zone-editor-td">
                                          <input
                                            type="text"
                                            value={tt.name}
                                            aria-label="ชื่อโซนหรือประเภทบัตร"
                                            onChange={(e) => handleUpdateTicketType(sIdx, tIdx, 'name', e.target.value)}
                                            className="text-input"
                                            placeholder="เช่น VIP, Regular"
                                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.8125rem' }}
                                          />
                                          {hasSold && (
                                            <span className="badge-sold-warning" style={{ marginTop: '0.25rem', display: 'inline-flex' }}>
                                              จำหน่ายแล้ว {tt.soldCount} ใบ
                                            </span>
                                          )}
                                        </td>
                                        <td className="zone-editor-td">
                                          <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={tt.price}
                                            aria-label="ราคาบัตร"
                                            onChange={(e) => handleUpdateTicketType(sIdx, tIdx, 'price', Number(e.target.value))}
                                            className="text-input"
                                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.8125rem' }}
                                          />
                                        </td>
                                        <td className="zone-editor-td">
                                          <input
                                            type="number"
                                            min={tt.soldCount || 1}
                                            step="1"
                                            value={tt.quota}
                                            aria-label="โควตาบัตร"
                                            onChange={(e) => handleUpdateTicketType(sIdx, tIdx, 'quota', Number(e.target.value))}
                                            className="text-input"
                                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.8125rem' }}
                                          />
                                        </td>
                                        <td className="zone-editor-td">
                                          <UbuPrivilegeSwitchField
                                            id={`sess-${sIdx}-tt-${tIdx}-priv`}
                                            priceInputId={`sess-${sIdx}-tt-${tIdx}-priv-price`}
                                            checked={Boolean(tt.isStudentPrivilege)}
                                            onToggle={(nextChecked) => handleUpdateTicketType(sIdx, tIdx, 'isStudentPrivilege', nextChecked)}
                                            studentPrice={tt.studentPrice}
                                            onPriceChange={(nextPrice) => handleUpdateTicketType(sIdx, tIdx, 'studentPrice', nextPrice)}
                                            label="ให้สิทธิ์ ม.อุบล"
                                            compact
                                          />
                                        </td>
                                        <td className="zone-editor-td">
                                          {sess.ticketTypes.length > 1 && (
                                            <button
                                              type="button"
                                              className="secondary-button"
                                              style={{
                                                fontSize: '0.75rem',
                                                padding: '0.3rem 0.5rem',
                                                color: hasSold ? '#94a3b8' : '#dc2626',
                                                cursor: hasSold ? 'not-allowed' : 'pointer',
                                              }}
                                              disabled={hasSold}
                                              title={hasSold ? 'ไม่สามารถลบโซนที่มีผู้ซื้อบัตรแล้ว' : 'ลบโซนนี้'}
                                              onClick={() => handleRemoveTicketType(sIdx, tIdx)}
                                            >
                                              <TrashIcon className="btn-icon" />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 5: Visual Assets */}
                  <div className="admin-override-section">
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h4 className="admin-override-section-title" style={{ borderBottom: 'none', paddingBottom: 0, margin: 0 }}>
                        <span>5. รูปภาพ & สื่อ</span>
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        แสดงที่: โปสเตอร์หลักและแบนเนอร์หน้าปกคอนเสิร์ต
                      </span>
                    </div>

                    <div className="image-upload-grid">
                      {/* Poster */}
                      <div className="image-upload-card">
                        <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: '#334155' }}>
                          รูปโปสเตอร์หลัก (Poster)
                        </span>
                        <div className="image-preview-box">
                          {editFormData.posterUrl ? (
                            <Image
                              src={editFormData.posterUrl}
                              alt="Poster preview"
                              className="image-preview-img"
                              width={240}
                              height={140}
                              unoptimized
                            />
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ไม่มีรูปภาพโปสเตอร์</span>
                          )}
                        </div>
                        <div className="image-upload-actions">
                          <label className="secondary-button" style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                            <span>{uploadingPoster ? 'กำลังอัปโหลด...' : 'เลือกรูปใหม่'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              disabled={uploadingPoster}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadImage(file, 'posterUrl', setUploadingPoster);
                              }}
                            />
                          </label>
                          {editFormData.posterUrl && (
                            <button
                              type="button"
                              className="secondary-button"
                              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', color: '#dc2626' }}
                              onClick={() => setEditFormData({ ...editFormData, posterUrl: '' })}
                            >
                              <span>ลบรูป</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Cover Banner */}
                      <div className="image-upload-card">
                        <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: '#334155' }}>
                          แบนเนอร์หน้าปก (Cover Banner)
                        </span>
                        <div className="image-preview-box">
                          {editFormData.coverBannerUrl ? (
                            <Image
                              src={editFormData.coverBannerUrl}
                              alt="Cover banner preview"
                              className="image-preview-img"
                              width={240}
                              height={140}
                              unoptimized
                            />
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ไม่มีรูปภาพแบนเนอร์</span>
                          )}
                        </div>
                        <div className="image-upload-actions">
                          <label className="secondary-button" style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                            <span>{uploadingCover ? 'กำลังอัปโหลด...' : 'เลือกรูปใหม่'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              disabled={uploadingCover}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadImage(file, 'coverBannerUrl', setUploadingCover);
                              }}
                            />
                          </label>
                          {editFormData.coverBannerUrl && (
                            <button
                              type="button"
                              className="secondary-button"
                              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', color: '#dc2626' }}
                              onClick={() => setEditFormData({ ...editFormData, coverBannerUrl: '' })}
                            >
                              <span>ลบรูป</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 6: Fee Settings */}
                  <div className="admin-override-section">
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h4 className="admin-override-section-title" style={{ borderBottom: 'none', paddingBottom: 0, margin: 0 }}>
                        <span>6. ส่วนแบ่งค่าบริการระบบ</span>
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        กำหนดอัตราค่าบริการแพลตฟอร์ม เงินสำรองความปลอดภัย และสิทธิ์พิเศษ ม.อุบลฯ
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      {/* Organizer Fee */}
                      <div style={{ padding: '0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                        <strong style={{ display: 'block', fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.5rem' }}>
                          ค่าบริการผู้จัดงาน (Organizer Fee)
                        </strong>
                        <div className="form-field" style={{ marginBottom: '0.5rem' }}>
                          <label htmlFor="edit-org-fee-mode">รูปแบบการคิดค่าบริการ</label>
                          <select
                            id="edit-org-fee-mode"
                            value={editFormData.organizerFeeMode || 'percentage'}
                            onChange={(e) => setEditFormData({ ...editFormData, organizerFeeMode: e.target.value as 'percentage' | 'per_ticket' | 'flat_fee' })}
                            className="text-input"
                          >
                            <option value="percentage">คิดเป็นร้อยละจากยอดขาย (%)</option>
                            <option value="per_ticket">คิดเป็นบาทต่อใบ (บาท/ใบ)</option>
                            <option value="flat_fee">เหมาจ่ายต่องาน (บาท)</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label htmlFor="edit-org-fee">
                            อัตราค่าบริการ {editFormData.organizerFeeMode === 'percentage' ? '(%)' : '(บาท)'}
                          </label>
                          <input
                            id="edit-org-fee"
                            type="number"
                            step="0.1"
                            min="0"
                            value={editFormData.organizerFeeRate}
                            onChange={(e) => setEditFormData({ ...editFormData, organizerFeeRate: Number(e.target.value) })}
                            className="text-input"
                          />
                        </div>
                      </div>

                      {/* Customer Fee */}
                      <div style={{ padding: '0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                        <strong style={{ display: 'block', fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.5rem' }}>
                          ค่าบริการลูกค้า (Customer Fee)
                        </strong>
                        <div className="form-field" style={{ marginBottom: '0.5rem' }}>
                          <label htmlFor="edit-cust-fee-mode">รูปแบบการคิดค่าบริการ</label>
                          <select
                            id="edit-cust-fee-mode"
                            value={editFormData.customerFeeMode || 'percentage'}
                            onChange={(e) => setEditFormData({ ...editFormData, customerFeeMode: e.target.value as 'percentage' | 'per_ticket' | 'per_order' })}
                            className="text-input"
                          >
                            <option value="percentage">คิดเป็นร้อยละจากยอดขาย (%)</option>
                            <option value="per_ticket">คิดเป็นบาทต่อใบ (บาท/ใบ)</option>
                            <option value="per_order">คิดเป็นบาทต่อคำสั่งซื้อ (บาท/ออเดอร์)</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label htmlFor="edit-cust-fee">
                            อัตราค่าบริการ {editFormData.customerFeeMode === 'percentage' ? '(%)' : '(บาท)'}
                          </label>
                          <input
                            id="edit-cust-fee"
                            type="number"
                            step="0.1"
                            min="0"
                            value={editFormData.customerFeeRate}
                            onChange={(e) => setEditFormData({ ...editFormData, customerFeeRate: Number(e.target.value) })}
                            className="text-input"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="form-row-two-col" style={{ marginBottom: '0.5rem' }}>
                      <div className="form-field">
                        <label htmlFor="edit-reserve-pct">สัดส่วนเงินสำรองความปลอดภัย (Reserve %)</label>
                        <input
                          id="edit-reserve-pct"
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={editFormData.reservePercentage}
                          onChange={(e) => setEditFormData({ ...editFormData, reservePercentage: Number(e.target.value) })}
                          className="text-input"
                        />
                        <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                          กันเงินสำรองไว้ชะลอการจ่ายให้ผู้จัดงานเพื่อรองรับการคืนเงินหรือข้อพิพาท
                        </span>
                      </div>

                      <div className="form-field">
                        <label htmlFor="edit-ubu-mode">สิทธิ์ ม.อุบลฯ (UBU Privilege Mode)</label>
                        <select
                          id="edit-ubu-mode"
                          value={editFormData.ubuPrivilegeMode ? 'yes' : 'no'}
                          onChange={(e) => setEditFormData({ ...editFormData, ubuPrivilegeMode: e.target.value === 'yes' })}
                          className="text-input"
                        >
                          <option value="yes">เปิดใช้งานสิทธิ์ ม.อุบลฯ (อนุญาตให้ซื้อราคานักศึกษา/บุคลากร)</option>
                          <option value="no">ปิดการใช้งานสิทธิ์ (ทุกคนซื้อในราคาบุคคลทั่วไป)</option>
                        </select>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                          เมื่อเปิด ผู้ซื้อที่มีอีเมล @ubu.ac.th จะได้รับราคาสิทธิ์ตามที่ระบุในแต่ละโซน
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 7: Audit Trail */}
                  <div className="audit-trail-history-box">
                    <div className="audit-header">
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                          7. ประวัติการแก้ไข (Audit Trail)
                        </h4>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                          บันทึกลงฐานข้อมูลตาราง event_audit_logs อย่างถาวร เรียกดูและดาวน์โหลด CSV สำรองย้อนหลังได้ตลอดเวลา
                        </p>
                      </div>
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
                            {log.snapshotCsv && (
                              <button
                                type="button"
                                className="secondary-button dl-backup-btn"
                                onClick={() => {
                                  if (log.snapshotCsv) {
                                    triggerCsvDownload(log.snapshotCsv, `snapshot-${editingEvent.id}-${log.id}.csv`);
                                  }
                                }}
                              >
                                <DownloadIcon className="btn-icon" />
                                <span>ดาวน์โหลด CSV ฉบับก่อนแก้ไขนี้</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="no-audit-text">ยังไม่มีประวัติการแก้ไขย้อนหลังสำหรับคอนเสิร์ตนี้</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <footer className="review-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="footer-left-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleExportCurrentCsv(editingEvent)}
                >
                  <DownloadIcon className="btn-icon" />
                  <span>ดาวน์โหลด CSV ข้อมูลปัจจุบัน</span>
                </button>
                {editFormData && (
                  <button
                    type="button"
                    className="secondary-button emergency-sales-footer-btn"
                    onClick={() => {
                      if (!editFormData) return;
                      const nextPaused = !editFormData.isSalesPaused;
                      setEditFormData({
                        ...editFormData,
                        isSalesPaused: nextPaused,
                        salesPausedReason: nextPaused ? (editFormData.salesPausedReason || 'ระงับการจำหน่ายบัตรชั่วคราวโดยผู้ดูแลระบบ') : '',
                      });
                      triggerToast({
                        type: 'info',
                        message: nextPaused
                          ? 'เปลี่ยนสถานะเป็น: ระงับการขายด่วน (กดปุ่มบันทึกข้อมูลเพื่อมีผลจริง)'
                          : 'เปลี่ยนสถานะเป็น: เปิดจำหน่ายตามปกติ (กดปุ่มบันทึกข้อมูลเพื่อมีผลจริง)',
                      });
                    }}
                    title="คลิกเพื่อสลับสถานะเปิด/ปิดการจำหน่ายบัตรด่วน"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      borderColor: editFormData.isSalesPaused ? '#fca5a5' : '#cbd5e1',
                      backgroundColor: editFormData.isSalesPaused ? '#fef2f2' : '#ffffff',
                      color: editFormData.isSalesPaused ? '#dc2626' : '#334155',
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: editFormData.isSalesPaused ? '#dc2626' : '#16a34a',
                      }}
                    />
                    <span>
                      {editFormData.isSalesPaused
                        ? 'สวิตช์เปิด/ปิดการจำหน่ายบัตรด่วน: [ระงับการขายอยู่]'
                        : 'สวิตช์เปิด/ปิดการจำหน่ายบัตรด่วน: [เปิดจำหน่ายปกติ]'}
                    </span>
                  </button>
                )}
              </div>
              <div className="footer-right-actions" style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={savingEdit}
                  onClick={() => {
                    setEditingEvent(null);
                    setEditFormData(null);
                  }}
                >
                  <span>ยกเลิก</span>
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={savingEdit || loadingEditData || !editFormData}
                  onClick={handleSaveAdminEdit}
                >
                  <CheckCircleIcon className="btn-icon" />
                  <span>บันทึกข้อมูล</span>
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* =========================================================
          DOUBLE CONFIRMATION MODAL ("ถามฉันอีกทีเพื่อความมั่นใจ")
          ========================================================= */}
      {showConfirmModal && editingEvent && (
        <div className="admin-edit-drawer-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" style={{ zIndex: 11000 }}>
          <button
            type="button"
            className="review-modal-backdrop"
            onClick={() => {
              if (!savingEdit) setShowConfirmModal(false);
            }}
            aria-label="ปิดหน้าต่างยืนยัน"
            tabIndex={-1}
          />
          <div className="review-modal-dialog confirm-diff-modal-dialog">
            <header className="review-modal-header" style={{ borderBottom: '1px solid #fed7aa', backgroundColor: '#fff7ed' }}>
              <div>
                <h3 id="confirm-modal-title" className="review-modal-heading" style={{ color: '#9a3412', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangleIcon style={{ width: '22px', height: '22px', color: '#ea580c' }} />
                  <span>ยืนยันการบันทึกการแก้ไขคอนเสิร์ต (Admin Override)</span>
                </h3>
                <p className="review-modal-sub" style={{ color: '#c2410c' }}>
                  ถามอีกครั้งเพื่อความมั่นใจ · โปรดตรวจสอบรายละเอียดที่เปลี่ยนแปลงด้านล่างนี้
                </p>
              </div>
              <button
                type="button"
                className="review-modal-close"
                onClick={() => {
                  if (!savingEdit) setShowConfirmModal(false);
                }}
                aria-label="ปิดหน้าต่างยืนยัน"
              >
                <XIcon />
              </button>
            </header>

            <div className="review-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '0.85rem' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e', lineHeight: 1.5 }}>
                  คุณกำลังจะบันทึกข้อมูลปรับปรุงคอนเสิร์ต <strong>&ldquo;{editingEvent.title}&rdquo;</strong> ระบบจะทำการสำรองข้อมูลฉบับก่อนหน้าเป็นไฟล์ CSV และดาวน์โหลดลงเครื่องของคุณโดยอัตโนมัติทันที
                </p>
              </div>

              <div>
                <strong style={{ fontSize: '0.875rem', color: '#334155', display: 'block', marginBottom: '0.5rem' }}>
                  รายการเปลี่ยนแปลงที่ตรวจพบ ({pendingChangesList.length} รายการ):
                </strong>
                <div className="confirm-diff-list">
                  {pendingChangesList.map((diffItem) => (
                    <div key={diffItem} className="confirm-diff-item">
                      <span className="confirm-diff-bullet">•</span>
                      <span>{diffItem}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <footer className="review-modal-footer">
              <button
                type="button"
                className="secondary-button"
                disabled={savingEdit}
                onClick={() => setShowConfirmModal(false)}
              >
                <span>กลับไปแก้ไขเพิ่มเติม</span>
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ backgroundColor: '#ea580c', borderColor: '#c2410c' }}
                disabled={savingEdit}
                onClick={handleFinalConfirmOverride}
              >
                <CheckCircleIcon className="btn-icon" />
                <span>{savingEdit ? 'กำลังบันทึกและดาวน์โหลด CSV...' : 'ยืนยันบันทึกข้อมูลจริง'}</span>
              </button>
            </footer>
          </div>
        </div>
      )}
      {/* =========================================================
          MODAL 3: EMERGENCY SALES TOGGLE CONFIRMATION (D-278)
          ========================================================= */}
      {togglingEvent && (
        <div
          className="review-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="emergency-toggle-modal-title"
          data-testid="emergency-toggle-modal"
        >
          <div className="admin-full-dialog-modal emergency-sales-dialog">
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">ระบบควบคุมฉุกเฉิน</span>
                <h3 id="emergency-toggle-modal-title" className="modal-concert-title">
                  {togglingEvent.isSalesPaused ? 'เปิดการจำหน่ายบัตรคอนเสิร์ต' : 'ระงับการจำหน่ายบัตรด่วน (Emergency Pause)'}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setTogglingEvent(null)}
                aria-label="ยกเลิก"
              >
                <XIcon />
              </button>
            </div>
            <div className="dialog-modal-body">
              <p style={{ fontSize: '0.95rem', color: '#1e293b', lineHeight: 1.5, margin: 0 }}>
                {togglingEvent.isSalesPaused
                  ? `คุณต้องการเปิดการจำหน่ายบัตรของคอนเสิร์ต "${togglingEvent.title}" กลับคืนมาให้ลูกค้าซื้อได้ตามปกติทันทีหรือไม่?`
                  : `คุณต้องการระงับการจำหน่ายบัตรของคอนเสิร์ต "${togglingEvent.title}" ด่วนทันทีหรือไม่? ระบบจะหยุดการจองและแจ้งเตือนลูกค้าบนหน้าเว็บทันที`}
              </p>
              {!togglingEvent.isSalesPaused && (
                <div style={{ marginTop: '1rem' }}>
                  <label htmlFor="toggle-reason-input" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 400, color: '#475569', marginBottom: '0.35rem' }}>
                    ข้อความเหตุผลแจ้งลูกค้า (แสดงบนป้ายเตือนในหน้าคอนเสิร์ต):
                  </label>
                  <input
                    id="toggle-reason-input"
                    type="text"
                    value={toggleReason}
                    onChange={(e) => setToggleReason(e.target.value)}
                    className="text-input"
                    placeholder="เช่น ระงับการจำหน่ายบัตรชั่วคราวเพื่อตรวจสอบโควตา..."
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
                  />
                </div>
              )}
            </div>
            <div className="dialog-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTogglingEvent(null)}
                disabled={isSubmittingToggle}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className={`primary-button ${togglingEvent.isSalesPaused ? '' : 'danger-btn'}`}
                onClick={handleConfirmEmergencyToggle}
                disabled={isSubmittingToggle}
                data-testid="confirm-emergency-toggle-btn"
              >
                {isSubmittingToggle
                  ? 'กำลังดำเนินการ...'
                  : togglingEvent.isSalesPaused
                    ? 'ยืนยันเปิดการจำหน่าย'
                    : 'ยืนยันระงับการขายด่วน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
