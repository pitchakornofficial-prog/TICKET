'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import Link from 'next/link';
import {
  CheckCircleIcon,
  ClockIcon,
  BanknotesIcon,
  SearchIcon,
  CalendarIcon,
  MapPinIcon,
  ShieldCheckIcon,
  UsersIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  XIcon,
  PencilSquareIcon,
  RefreshIcon,
} from './icons';
import { TicketIcon } from './ticket-icon';
import { AlertIcon } from './alert-icon';
import { Button } from '@/components/ui';
import { HeaderInfoTooltip } from './header-info-tooltip';
import { OrganizerMoneyReportView } from './organizer-money-report-view';
import { loadPayoutAccounts, getPrimaryPayoutAccount, type PayoutBankAccount } from '@/lib/organizer-payout-sync';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';

interface TicketTypeDraft {
  id: string;
  name: string;
  price: number;
  quota: number;
  description: string;
  isStudentPrivilege?: boolean;
}

interface SessionDraft {
  id: string;
  startTime: string;
  endTime: string;
  admissionStartTime: string;
  admissionEndTime: string;
  ticketTypes: TicketTypeDraft[];
}

interface EventItem {
  id: string;
  title: string;
  location: string;
  status: string;
  description?: string;
  posterUrl?: string | null;
  ticketTemplateUrl?: string | null;
  limitPerOrder?: number;
  sessionCount?: number;
  totalQuota?: number;
  minPrice?: number;
  maxPrice?: number;
  firstSessionStartTime?: string;
  lastSessionEndTime?: string;
  createdAt?: string;
  sessions?: { id: string; status?: string }[];
  ageRestriction?: string | null;
  refundPolicy?: string | null;
  entryGuidelines?: string | null;
  payoutAccountId?: string | null;
  payoutBankName?: string | null;
  payoutAccountNumber?: string | null;
  payoutAccountName?: string | null;
  ubuPrivilegeMode?: boolean;
}

interface EventDetailsSession {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  ticketTypes: {
    id: string;
    name: string;
    price: number;
    quota: number;
  }[];
}

interface EventDetails {
  id: string;
  title: string;
  sessions: EventDetailsSession[];
}

export interface OrganizerEventsManagerProps {
  initialOpenCreate?: boolean;
  onCloseCreate?: () => void;
  initialHighlightEventId?: string;
}

export function OrganizerEventsManager({
  initialOpenCreate = false,
  onCloseCreate,
  initialHighlightEventId,
}: OrganizerEventsManagerProps = {}) {
  const [pulsingEventId, setPulsingEventId] = useState<string | null>(() => initialHighlightEventId || null);

  useEffect(() => {
    if (initialHighlightEventId) {
      setPulsingEventId(initialHighlightEventId);
      setTimeout(() => {
        const el = document.getElementById(`organizer-event-card-${initialHighlightEventId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      const timer = setTimeout(() => setPulsingEventId(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [initialHighlightEventId]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(initialOpenCreate);
  const [showPreview, setShowPreview] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [_draftSaved, setDraftSaved] = useState(false);
  const [_savedDraftEvent, setSavedDraftEvent] = useState<EventItem | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<EventItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Search & Status filter state (D-108, D-197, D-198)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'pending_approval' | 'draft'>('all');

  // Form state (D-128, D-198, D-199)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [artists, setArtists] = useState('');
  const [location, setLocation] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [salesStartTime, setSalesStartTime] = useState('');
  const [salesEndTime, setSalesEndTime] = useState('');
  const [limitMode, setLimitMode] = useState<'custom' | 'unlimited'>('custom');
  const [limitPerOrder, setLimitPerOrder] = useState(4);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [coverBannerFile, setCoverBannerFile] = useState<File | null>(null);
  const [coverBannerPreviewUrl, setCoverBannerPreviewUrl] = useState<string | null>(null);
  const [ticketTemplateFile, setTicketTemplateFile] = useState<File | null>(null);
  const [ticketTemplatePreviewUrl, setTicketTemplatePreviewUrl] = useState<string | null>(null);

  // Governance & Commercial States (D-217, D-218)
  const [payoutAccounts, setPayoutAccounts] = useState<PayoutBankAccount[]>([]);
  const [selectedPayoutAccountId, setSelectedPayoutAccountId] = useState<string>('');
  const [refundPolicy, setRefundPolicy] = useState<'refundable_7d' | 'non_refundable' | 'custom'>('refundable_7d');
  const [refundPolicyCustom, setRefundPolicyCustom] = useState('');
  const [ageRestriction, setAgeRestriction] = useState<'all' | '18+' | '20+'>('all');
  const [entryGuidelines, setEntryGuidelines] = useState('');
  const [ubuPrivilegeMode, setUbuPrivilegeMode] = useState<boolean>(false);

  useEffect(() => {
    const accs = loadPayoutAccounts();
    setPayoutAccounts(accs);
    const primary = getPrimaryPayoutAccount(accs);
    if (primary) setSelectedPayoutAccountId(primary.id);
  }, []);

  // Clean initial session state (D-133: No mock data)
  const [sessions, setSessions] = useState<SessionDraft[]>([
    {
      id: 'sess-1',
      startTime: '',
      endTime: '',
      admissionStartTime: '',
      admissionEndTime: '',
      ticketTypes: [
        { id: 'tt-1', name: '', price: 0, quota: 0, description: '' },
      ],
    },
  ]);

  // Collapsible session cards state (D-199 Item 8)
  const [expandedSessionIds, setExpandedSessionIds] = useState<Record<string, boolean>>({
    'sess-1': true,
  });

  const toggleSessionExpand = (sessionId: string) => {
    setExpandedSessionIds(prev => ({
      ...prev,
      [sessionId]: prev[sessionId] === undefined ? false : !prev[sessionId],
    }));
  };

  // Reset all modal fields on close so reopening starts completely fresh (D-198)
  const handleCloseModal = () => {
    setShowForm(false);
    setShowPreview(false);
    setWizardStep(1);
    setEditingEventId(null);
    setTitle('');
    setDescription('');
    setArtists('');
    setLocation('');
    setGoogleMapsUrl('');
    setSalesStartTime('');
    setSalesEndTime('');
    setLimitMode('custom');
    setLimitPerOrder(4);
    setPosterFile(null);
    setPosterPreviewUrl(null);
    setCoverBannerFile(null);
    setCoverBannerPreviewUrl(null);
    setTicketTemplateFile(null);
    setTicketTemplatePreviewUrl(null);
    setAgeRestriction('all');
    setRefundPolicy('refundable_7d');
    setRefundPolicyCustom('');
    setEntryGuidelines('');
    setUbuPrivilegeMode(false);
    const initialSessionId = `sess-${Date.now()}`;
    setSessions([
      {
        id: initialSessionId,
        startTime: '',
        endTime: '',
        admissionStartTime: '',
        admissionEndTime: '',
        ticketTypes: [
          { id: `tt-${Date.now()}-1`, name: '', price: 0, quota: 0, description: '' },
        ],
      },
    ]);
    setExpandedSessionIds({ [initialSessionId]: true });
    setDraftSaved(false);
    setSavedDraftEvent(null);
    setModalError('');
    setModalSuccess('');
    onCloseCreate?.();
  };

  // Open edit modal for an existing draft concert (D-199 Item 11)
  const handleEditDraft = async (eventId: string) => {
    setError('');
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) {
        setError('ไม่สามารถโหลดข้อมูลงานคอนเสิร์ตเพื่อแก้ไขได้');
        return;
      }
      const data = await res.json();
      const ev = data.event;
      if (!ev) return;
      setEditingEventId(ev.id);
      setTitle(ev.title || '');
      setDescription(ev.description || '');
      setArtists(ev.artists || '');
      setLocation(ev.location || '');
      setGoogleMapsUrl(ev.googleMapsUrl || '');
      setSalesStartTime(ev.salesStartTime ? new Date(ev.salesStartTime).toISOString().slice(0, 16) : '');
      setSalesEndTime(ev.salesEndTime ? new Date(ev.salesEndTime).toISOString().slice(0, 16) : '');
      const lim = ev.limitPerOrder || 4;
      setLimitPerOrder(lim);
      setLimitMode(lim >= 99 ? 'unlimited' : 'custom');
      setPosterPreviewUrl(ev.posterUrl || null);
      setCoverBannerPreviewUrl(ev.coverBannerUrl || null);
      setTicketTemplatePreviewUrl(ev.ticketTemplateUrl || null);
      setAgeRestriction(ev.ageRestriction || 'all');
      setRefundPolicy(ev.refundPolicy?.includes('ไม่รับคืน') ? 'non_refundable' : ev.refundPolicy?.includes('7 วัน') ? 'refundable_7d' : ev.refundPolicy ? 'custom' : 'refundable_7d');
      setRefundPolicyCustom(ev.refundPolicy || '');
      setEntryGuidelines(ev.entryGuidelines || '');
      setSelectedPayoutAccountId(ev.payoutAccountId || '');
      setUbuPrivilegeMode(Boolean(ev.ubuPrivilegeMode));
      if (ev.sessions && ev.sessions.length > 0) {
        setSessions(ev.sessions.map((s: { id: string; startTime?: string; endTime?: string; admissionStartTime?: string; admissionEndTime?: string; ticketTypes?: TicketTypeDraft[] }) => ({
          id: s.id,
          startTime: s.startTime ? new Date(s.startTime).toISOString().slice(0, 16) : '',
          endTime: s.endTime ? new Date(s.endTime).toISOString().slice(0, 16) : '',
          admissionStartTime: s.admissionStartTime ? new Date(s.admissionStartTime).toISOString().slice(0, 16) : '',
          admissionEndTime: s.admissionEndTime ? new Date(s.admissionEndTime).toISOString().slice(0, 16) : '',
          ticketTypes: s.ticketTypes && s.ticketTypes.length > 0 ? s.ticketTypes : [{ id: `tt-${Date.now()}`, name: '', price: 0, quota: 0, description: '' }],
        })));
        setExpandedSessionIds({ [ev.sessions[0].id]: true });
      }
      setShowForm(true);
      setWizardStep(1);
    } catch {
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลงานคอนเสิร์ต');
    }
  };

  // Open preview modal from an existing card (D-199 Item 11)
  const _handleOpenPreviewModal = async (ev: EventItem) => {
    try {
      const res = await fetch(`/api/events/${ev.id}`);
      if (res.ok) {
        const data = await res.json();
        const fullEvent = data.event;
        setTitle(fullEvent.title || ev.title);
        setDescription(fullEvent.description || ev.description || '');
        setArtists(fullEvent.artists || '');
        setLocation(fullEvent.location || ev.location);
        setGoogleMapsUrl(fullEvent.googleMapsUrl || '');
        setLimitPerOrder(fullEvent.limitPerOrder || 4);
        setPosterPreviewUrl(fullEvent.posterUrl || ev.posterUrl || null);
        setCoverBannerPreviewUrl(fullEvent.coverBannerUrl || null);
        setTicketTemplatePreviewUrl(fullEvent.ticketTemplateUrl || null);
        if (fullEvent.sessions && fullEvent.sessions.length > 0) {
          setSessions(fullEvent.sessions.map((s: { id: string; startTime?: string; endTime?: string; admissionStartTime?: string; admissionEndTime?: string; ticketTypes?: TicketTypeDraft[] }) => ({
            id: s.id,
            startTime: s.startTime || '',
            endTime: s.endTime || '',
            admissionStartTime: s.admissionStartTime || '',
            admissionEndTime: s.admissionEndTime || '',
            ticketTypes: s.ticketTypes && s.ticketTypes.length > 0 ? s.ticketTypes : [{ id: `tt-${Date.now()}`, name: '', price: 0, quota: 0, description: '' }],
          })));
        }
      }
    } catch {
      setTitle(ev.title);
      setLocation(ev.location);
    }
    setShowPreview(true);
  };

  // Reorder sessions up or down (D-198)
  function handleMoveSession(index: number, direction: 'up' | 'down') {
    setSessions(prev => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const nextSessions = [...prev];
      const [moved] = nextSessions.splice(index, 1);
      nextSessions.splice(targetIndex, 0, moved);
      return nextSessions;
    });
  }

  // Amendment modal state
  const [activeEventDetails, setActiveEventDetails] = useState<EventDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [amendmentStartTime, setAmendmentStartTime] = useState<string>('');
  const [amendmentEndTime, setAmendmentEndTime] = useState<string>('');
  const [amendmentTicketTypes, setAmendmentTicketTypes] = useState<
    { id: string; name: string; price: number; quota: number }[]
  >([]);
  const [amendmentSubmitting, setAmendmentSubmitting] = useState(false);
  const [amendmentFeedback, setAmendmentFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Cancellation modal state (AC-35, AC-108)
  const [cancelEventDetails, setCancelEventDetails] = useState<EventDetails | null>(null);
  const [loadingCancelDetails, setLoadingCancelDetails] = useState(false);
  const [selectedCancelSessionId, setSelectedCancelSessionId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Financial money report state (AC-28, AC-64, AC-77, AC-81)
  const [selectedReportEventId, setSelectedReportEventId] = useState<string | null>(null);

  const filterSearchInputId = useId();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Handle local poster file preview
  function handlePosterChange(file: File | null) {
    setPosterFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPosterPreviewUrl(url);
    } else {
      setPosterPreviewUrl(null);
    }
  }

  // Handle local cover banner file preview
  function handleCoverBannerChange(file: File | null) {
    setCoverBannerFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setCoverBannerPreviewUrl(url);
    } else {
      setCoverBannerPreviewUrl(null);
    }
  }

  // Handle local ticket template preview
  function handleTemplateChange(file: File | null) {
    setTicketTemplateFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setTicketTemplatePreviewUrl(url);
    } else {
      setTicketTemplatePreviewUrl(null);
    }
  }

  // Session draft helpers
  function handleAddSession() {
    const newSessionId = `sess-${Date.now()}`;
    const newSession: SessionDraft = {
      id: newSessionId,
      startTime: '',
      endTime: '',
      admissionStartTime: '',
      admissionEndTime: '',
      ticketTypes: [
        { id: `tt-${Date.now()}-1`, name: '', price: 0, quota: 0, description: '' },
      ],
    };
    setSessions(prev => [...prev, newSession]);
    setExpandedSessionIds(prev => ({ ...prev, [newSessionId]: true }));
  }

  function handleDuplicateSession(sourceIdx: number) {
    const source = sessions[sourceIdx];
    if (!source) return;
    const nextIdx = sessions.length + 1;
    const newSessionId = `sess-${Date.now()}`;
    const duplicated: SessionDraft = {
      id: newSessionId,
      startTime: source.startTime,
      endTime: source.endTime,
      admissionStartTime: source.admissionStartTime,
      admissionEndTime: source.admissionEndTime,
      ticketTypes: source.ticketTypes.map((t, tIdx) => ({
        ...t,
        id: `tt-${Date.now()}-${nextIdx}-${tIdx + 1}`,
      })),
    };
    setSessions(prev => [...prev, duplicated]);
    setExpandedSessionIds(prev => ({ ...prev, [newSessionId]: true }));
  }

  function handleRemoveSession(sessionId: string) {
    if (sessions.length <= 1) return;
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  }

  function handleUpdateSession(sessionId: string, updates: Partial<SessionDraft>) {
    setSessions(prev =>
      prev.map(s => (s.id === sessionId ? { ...s, ...updates } : s)),
    );
  }

  // Ticket type draft helpers
  function handleAddTicketType(sessionId: string) {
    setSessions(prev =>
      prev.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          ticketTypes: [
            ...s.ticketTypes,
            { id: `tt-${Date.now()}`, name: '', price: 0, quota: 0, description: '' },
          ],
        };
      }),
    );
  }

  function handleRemoveTicketType(sessionId: string, ticketTypeId: string) {
    setSessions(prev =>
      prev.map(s => {
        if (s.id !== sessionId || s.ticketTypes.length <= 1) return s;
        return {
          ...s,
          ticketTypes: s.ticketTypes.filter(t => t.id !== ticketTypeId),
        };
      }),
    );
  }

  function handleUpdateTicketType(
    sessionId: string,
    ticketTypeId: string,
    updates: Partial<TicketTypeDraft>,
  ) {
    setSessions(prev =>
      prev.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          ticketTypes: s.ticketTypes.map(t => (t.id === ticketTypeId ? { ...t, ...updates } : t)),
        };
      }),
    );
  }

  // Calculate lowest ticket price for preview
  const previewStartingPrice = sessions.reduce((min, s) => {
    const sMin = s.ticketTypes.reduce((m, t) => (t.price > 0 && (m === 0 || t.price < m) ? t.price : m), 0);
    return sMin > 0 && (min === 0 || sMin < min) ? sMin : min;
  }, 0);

  // Save event draft inside modal (D-198)
  async function handleSaveDraft() {
    setModalError('');
    setModalSuccess('');

    if (!title.trim() || !location.trim()) {
      setModalError('กรุณากรอกชื่อคอนเสิร์ตและสถานที่จัดงาน');
      return;
    }

    const invalidSession = sessions.find(
      s => !s.startTime || !s.endTime || Number.isNaN(new Date(s.startTime).getTime()) || Number.isNaN(new Date(s.endTime).getTime())
    );
    if (invalidSession) {
      setModalError('กรุณาระบุวันเวลาเริ่มและสิ้นสุดการแสดงของทุกรอบให้ครบถ้วน');
      return;
    }

    const invalidTicket = sessions.some(s =>
      s.ticketTypes.some(t => !t.name.trim() || t.price < 0 || t.quota <= 0)
    );
    if (invalidTicket) {
      setModalError('กรุณากรอกชื่อ ราคา และจำนวนโควตาของบัตรทุกประเภทให้ถูกต้อง (โควตาต้องมากกว่า 0)');
      return;
    }

    setSubmitting(true);

    let posterUrl: string | undefined;
    if (posterFile) {
      const fd = new FormData();
      fd.append('file', posterFile);
      const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
      if (upRes.ok) {
        const upData = await upRes.json();
        posterUrl = upData.url;
      }
    }

    let coverBannerUrl: string | undefined;
    if (coverBannerFile) {
      const fd = new FormData();
      fd.append('file', coverBannerFile);
      const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
      if (upRes.ok) {
        const upData = await upRes.json();
        coverBannerUrl = upData.url;
      }
    }

    let ticketTemplateUrl: string | undefined;
    if (ticketTemplateFile) {
      const fd = new FormData();
      fd.append('file', ticketTemplateFile);
      const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
      if (upRes.ok) {
        const upData = await upRes.json();
        ticketTemplateUrl = upData.url;
      }
    }

    // Format sessions and ticket types for API
    const formattedSessions = sessions.map(s => ({
      startTime: new Date(s.startTime).toISOString(),
      endTime: new Date(s.endTime).toISOString(),
      admissionStartTime: s.admissionStartTime ? new Date(s.admissionStartTime).toISOString() : undefined,
      admissionEndTime: s.admissionEndTime ? new Date(s.admissionEndTime).toISOString() : undefined,
      ticketTypes: s.ticketTypes.map(t => ({
        name: t.name.trim(),
        price: Number(t.price),
        quota: Number(t.quota),
        description: t.description?.trim() || undefined,
        isStudentPrivilege: Boolean(t.isStudentPrivilege),
      })),
    }));

    try {
      const selectedAcc = payoutAccounts.find(a => a.id === selectedPayoutAccountId);
      const payload = {
        title,
        description,
        location,
        googleMapsUrl: googleMapsUrl.trim() || undefined,
        salesStartTime: salesStartTime ? new Date(salesStartTime).toISOString() : undefined,
        salesEndTime: salesEndTime ? new Date(salesEndTime).toISOString() : undefined,
        limitPerOrder,
        ageRestriction,
        refundPolicy: refundPolicy === 'custom' ? refundPolicyCustom.trim() : refundPolicy === 'non_refundable' ? 'ไม่รับคืนเงินทุกกรณี (ยกเว้นงานยกเลิกหรือเลื่อน)' : 'ขอคืนเงินได้ตามเงื่อนไขล่วงหน้าอย่างน้อย 7 วันก่อนวันแสดง',
        entryGuidelines: entryGuidelines.trim() || undefined,
        payoutAccountId: selectedPayoutAccountId || undefined,
        payoutBankName: selectedAcc?.bankName || undefined,
        payoutAccountNumber: selectedAcc?.accountNumber || undefined,
        payoutAccountName: selectedAcc?.accountName || undefined,
        ubuPrivilegeMode,
        posterUrl,
        coverBannerUrl,
        ticketTemplateUrl,
        sessions: formattedSessions,
      };

      const res = editingEventId
        ? await fetch(`/api/events/${editingEventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const data = await res.json();
      if (!res.ok) {
        setModalError(data.message || 'บันทึกงานไม่สำเร็จ');
        setSubmitting(false);
        return;
      }

      setSuccess(
        editingEventId
          ? 'แก้ไขข้อมูลงานคอนเสิร์ตสำเร็จ'
          : 'บันทึกงานคอนเสิร์ตฉบับร่างเรียบร้อยแล้ว ท่านสามารถกด "ดูตัวอย่าง" หรือ "ส่งขออนุมัติ" ได้จากการ์ดคอนเสิร์ต'
      );
      handleCloseModal();
      await loadEvents();
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('events-updated'));
    } catch {
      setModalError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSubmitting(false);
    }
  }

  // Submit existing session or event for approval directly from card (D-199 Item 13)
  async function handleSubmitSessionForApproval(eventId: string) {
    setError('');
    setSuccess('');
    try {
      const submitRes = await fetch(`/api/events/${eventId}?action=submit-event`, {
        method: 'POST',
      });

      if (!submitRes.ok) {
        // Fallback to submitting individual sessions
        const res = await fetch(`/api/events/${eventId}`);
        if (!res.ok) {
          setError('ไม่สามารถโหลดข้อมูลรอบการแสดงได้');
          return;
        }
        const data = await res.json();
        if (data.event?.sessions?.length > 0) {
          for (const sess of data.event.sessions) {
            if (sess.status === 'draft') {
              await fetch(`/api/events/${eventId}?action=submit-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sess.id }),
              });
            }
          }
        }
      }

      setSuccess('ส่งงานคอนเสิร์ตเพื่อขออนุมัติเรียบร้อยแล้ว (รอเจ้าของเว็บอนุมัติ)');
      await loadEvents();
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('events-updated'));
    } catch {
      setError('เกิดข้อผิดพลาดในการส่งขออนุมัติ');
    }
  }

  // Revert a pending_approval concert back to draft (D-200 Item 2)
  async function handleRevertToDraft(eventId: string) {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/events/${eventId}?action=revert-to-draft`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ดึงงานกลับมาเป็นฉบับร่างไม่สำเร็จ');
        return;
      }
      setSuccess('ดึงงานคอนเสิร์ตกลับมาเป็นฉบับร่างเรียบร้อยแล้ว ท่านสามารถแก้ไขข้อมูลได้');
      await loadEvents();
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('events-updated'));
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  // Delete event draft or pending approval event (D-200 Item 3)
  async function handleConfirmDeleteEvent() {
    if (!deletingEvent) return;
    setDeleteSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/events/${deletingEvent.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ลบงานคอนเสิร์ตไม่สำเร็จ');
      } else {
        setSuccess(`ลบงานคอนเสิร์ต "${deletingEvent.title}" เรียบร้อยแล้ว`);
        setDeletingEvent(null);
        await loadEvents();
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('events-updated'));
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการลบงานคอนเสิร์ต');
    } finally {
      setDeleteSubmitting(false);
    }
  }

  // Open amendment modal
  async function _handleOpenAmendment(eventId: string) {
    setLoadingDetails(true);
    setAmendmentFeedback(null);
    setSelectedSessionId(null);
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) {
        setError('ไม่สามารถโหลดรายละเอียดรอบการแสดงได้');
        setLoadingDetails(false);
        return;
      }
      const data = await res.json();
      setActiveEventDetails(data.event);
      if (data.event?.sessions?.length > 0) {
        const firstSess = data.event.sessions[0];
        setSelectedSessionId(firstSess.id);
        setAmendmentStartTime('');
        setAmendmentEndTime('');
        setAmendmentTicketTypes(
          firstSess.ticketTypes.map((tt: { id: string; name: string; price: number; quota: number }) => ({
            id: tt.id,
            name: tt.name,
            price: Number(tt.price),
            quota: Number(tt.quota),
          })),
        );
      }
      setLoadingDetails(false);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      setLoadingDetails(false);
    }
  }

  function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setAmendmentStartTime('');
    setAmendmentEndTime('');
    const sess = activeEventDetails?.sessions.find(s => s.id === sessionId);
    if (sess) {
      setAmendmentTicketTypes(
        sess.ticketTypes.map(tt => ({
          id: tt.id,
          name: tt.name,
          price: Number(tt.price),
          quota: Number(tt.quota),
        })),
      );
    }
  }

  async function handleSubmitAmendment(e: React.FormEvent) {
    e.preventDefault();
    if (!activeEventDetails || !selectedSessionId) return;

    setAmendmentSubmitting(true);
    setAmendmentFeedback(null);

    try {
      const payload: {
        ticketTypes: typeof amendmentTicketTypes;
        startTime?: string;
        endTime?: string;
      } = {
        ticketTypes: amendmentTicketTypes,
      };

      if (amendmentStartTime) {
        payload.startTime = new Date(amendmentStartTime).toISOString();
      }
      if (amendmentEndTime) {
        payload.endTime = new Date(amendmentEndTime).toISOString();
      }

      const res = await fetch(
        `/api/organizer/events/${activeEventDetails.id}/sessions/${selectedSessionId}/amendments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setAmendmentFeedback({ type: 'error', message: data.message || 'ส่งคำขอแก้ไขไม่สำเร็จ' });
      } else {
        setAmendmentFeedback({
          type: 'success',
          message: data.message || 'ส่งคำขอแก้ไขรอบการแสดงเรียบร้อยแล้ว รอการอนุมัติจากผู้ดูแลระบบ (AC-34, G-13)',
        });
        setAmendmentStartTime('');
        setAmendmentEndTime('');
      }
    } catch {
      setAmendmentFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setAmendmentSubmitting(false);
    }
  }

  // Open cancellation modal
  async function handleOpenCancellation(eventId: string) {
    setLoadingCancelDetails(true);
    setCancelFeedback(null);
    setSelectedCancelSessionId(null);
    setCancellationReason('');
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) {
        setError('ไม่สามารถโหลดรายละเอียดรอบการแสดงได้');
        setLoadingCancelDetails(false);
        return;
      }
      const data = await res.json();
      setCancelEventDetails(data.event);
      if (data.event?.sessions?.length > 0) {
        setSelectedCancelSessionId(data.event.sessions[0].id);
      }
      setLoadingCancelDetails(false);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      setLoadingCancelDetails(false);
    }
  }

  async function handleSubmitCancellation(e: React.FormEvent) {
    e.preventDefault();
    if (!cancelEventDetails || !selectedCancelSessionId) return;

    setCancelSubmitting(true);
    setCancelFeedback(null);

    try {
      const res = await fetch(
        `/api/organizer/events/${cancelEventDetails.id}/sessions/${selectedCancelSessionId}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: cancellationReason }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setCancelFeedback({ type: 'error', message: data.message || 'ยื่นขอยกเลิกไม่สำเร็จ' });
      } else {
        setCancelFeedback({
          type: 'success',
          message: data.message || 'ยื่นคำขอยกเลิกรอบการแสดงเรียบร้อยแล้ว รอการอนุมัติจากผู้ดูแลระบบ',
        });
        setCancellationReason('');
      }
    } catch {
      setCancelFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setCancelSubmitting(false);
    }
  }

  // Filter & Search events (D-197, D-198: 4 Capsule Tabs without 'upcoming')
  const filteredEvents = events.filter(ev => {
    const matchesSearch =
      !searchQuery.trim() ||
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'available' && ev.status === 'approved') ||
      (statusFilter === 'pending_approval' && (ev.status === 'pending_approval' || ev.status === 'submitted')) ||
      (statusFilter === 'draft' && ev.status === 'draft');

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="events-management-container">
      {/* 1. Header with Title & Description (D-122, D-197 Tooltip 'i') */}
      <header className="events-management-header">
        <div className="events-management-title-wrap">
          <div className="organizer-header-title-row">
            <h1 className="events-management-title">
            งานคอนเสิร์ตของคุณ
            <HeaderInfoTooltip text="ศูนย์จัดการคอนเสิร์ต สร้างงานใหม่ ตรวจสอบสถานะการอนุมัติ จัดการรอบการแสดง และดูรายงานการเงินแยกรายคอนเสิร์ต" />
          </h1>
            <button
              type="button"
              className="organizer-inline-refresh-btn"
              data-testid="events-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              aria-label="รีเฟรชข้อมูลคอนเสิร์ต"
              title="รีเฟรชข้อมูลคอนเสิร์ต"
            >
              <RefreshIcon className={`inline-refresh-icon ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="events-management-desc">
            สร้างฉบับร่าง จัดการรอบการแสดง ขอแก้ไขราคา หรือตรวจสอบรายงานการเงินแยกรายคอนเสิร์ต
          </p>
        </div>
      </header>

      {error && <p className="form-error status-banner error" role="alert">{error}</p>}
      {success && <p className="form-success status-banner success" role="status">{success}</p>}

      {/* 2. Unified Capsule Status Filter Tabs & Search Bar (D-109, D-197, D-198) */}
      <div className="events-filter-bar">
        <div className="catalog-tabs" role="tablist" aria-label="ตัวกรองสถานะคอนเสิร์ต">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'all'}
            className={`catalog-tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            ทั้งหมด ({events.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'available'}
            className={`catalog-tab-btn ${statusFilter === 'available' ? 'active' : ''}`}
            onClick={() => setStatusFilter('available')}
          >
            เปิดจำหน่ายแล้ว
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'pending_approval'}
            className={`catalog-tab-btn ${statusFilter === 'pending_approval' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending_approval')}
          >
            รออนุมัติ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'draft'}
            className={`catalog-tab-btn ${statusFilter === 'draft' ? 'active' : ''}`}
            onClick={() => setStatusFilter('draft')}
          >
            ฉบับร่าง
          </button>
        </div>

        <div className="events-filter-actions">
          <div className="events-search-wrap">
            <SearchIcon width={16} height={16} style={{ color: '#94a3b8' }} />
            <label htmlFor={filterSearchInputId} className="sr-only">ค้นหารายการหรือสถานที่จัดแสดง</label>
            <input
              id={filterSearchInputId}
              type="search"
              className="events-search-input"
              placeholder="ค้นหาชื่องาน หรือสถานที่จัดงาน..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant="primary"
            size="md"
            className="events-create-btn"
            onClick={() => {
              setShowForm(true);
              setWizardStep(1);
            }}
            data-testid="open-create-concert-btn"
            icon={<PlusIcon width={16} height={16} />}
          >
            สร้างงานคอนเสิร์ตใหม่
          </Button>
        </div>
      </div>

      {/* 3. 5-Step Multi-Step Wizard Modal (D-109, D-198) */}
      {showForm && (
        <div className="events-editor-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-concert-title">
          <button
            type="button"
            className="editor-modal-backdrop-btn"
            onClick={handleCloseModal}
            aria-label="ปิดหน้าต่างสร้างคอนเสิร์ต"
            tabIndex={-1}
          />
          <div className="events-editor-modal-card">
            {/* Sticky Top Action Header (D-198, D-199) */}
            <div className="editor-modal-sticky-header">
              {/* Row 1: Title, Tooltip & Close button */}
              <div className="editor-modal-top-row">
                <div className="editor-modal-title-wrap">
                  <h2 id="create-concert-title" className="editor-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', margin: 0, fontSize: '1.18rem' }}>
                    <span>{editingEventId ? 'แก้ไขข้อมูลคอนเสิร์ต' : 'สร้างงานคอนเสิร์ตใหม่'}</span>
                    <HeaderInfoTooltip text="สร้างคอนเสิร์ตใหม่หรือแก้ไขงานเดิม พร้อมกำหนดรายละเอียด สถานที่ แผนที่ กติกา รอบการแสดง และรูปภาพ" />
                  </h2>
                  <p className="editor-modal-subtitle" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    ขั้นตอนที่ {wizardStep} จาก 5:{' '}
                    {wizardStep === 1
                      ? 'ข้อมูลงาน & ศิลปิน'
                      : wizardStep === 2
                      ? 'สถานที่ & แผนที่'
                      : wizardStep === 3
                      ? 'กำหนดการ & กติกาการซื้อ'
                      : wizardStep === 4
                      ? 'รอบการแสดง & โซนบัตร'
                      : 'รูปภาพ & สื่อประชาสัมพันธ์'}
                  </p>
                </div>
                <button
                  type="button"
                  className="editor-modal-close-btn"
                  onClick={handleCloseModal}
                  aria-label="ปิดหน้าต่าง"
                  title="ปิด"
                >
                  <XIcon width={18} height={18} />
                </button>
              </div>

              {/* Row 2: Unified Action Buttons Toolbar (D-198, D-199: Removed preview & submit approval) */}
              <div className="editor-modal-top-actions">
                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-form-cancel"
                    onClick={handleCloseModal}
                    title="ยกเลิกและปิดหน้าต่าง (ข้อมูลที่ยังไม่บันทึกจะถูกล้างใหม่)"
                  >
                    ยกเลิก
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                  {wizardStep > 1 && (
                    <button
                      type="button"
                      className="btn-form-draft"
                      onClick={() => setWizardStep(prev => (prev - 1) as 1 | 2 | 3 | 4 | 5)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ChevronLeftIcon width={14} height={14} />
                      <span>ย้อนกลับ</span>
                    </button>
                  )}

                  {wizardStep < 5 && (
                    <button
                      type="button"
                      className="btn-form-submit"
                      onClick={() => setWizardStep(prev => (prev + 1) as 1 | 2 | 3 | 4 | 5)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>ถัดไป</span>
                      <ChevronRightIcon width={14} height={14} />
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn-form-draft"
                    disabled={submitting}
                    onClick={handleSaveDraft}
                    data-testid="save-draft-btn"
                  >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกแบบร่าง'}
                  </button>
                </div>
              </div>

              {/* Row 3: 5 Step Tabs (D-198, D-199: Swapped step 4 & 5) */}
              <div className="events-step-tabs-bar" role="tablist" aria-label="ขั้นตอนการสร้างคอนเสิร์ต">
                <button
                  type="button"
                  role="tab"
                  aria-selected={wizardStep === 1}
                  onClick={() => setWizardStep(1)}
                  className={`events-step-tab-btn ${wizardStep === 1 ? 'active' : ''}`}
                >
                  1. ข้อมูลงาน & ศิลปิน
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={wizardStep === 2}
                  onClick={() => setWizardStep(2)}
                  className={`events-step-tab-btn ${wizardStep === 2 ? 'active' : ''}`}
                >
                  2. สถานที่ & แผนที่
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={wizardStep === 3}
                  onClick={() => setWizardStep(3)}
                  className={`events-step-tab-btn ${wizardStep === 3 ? 'active' : ''}`}
                >
                  3. กำหนดการ & กติกา
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={wizardStep === 4}
                  onClick={() => setWizardStep(4)}
                  className={`events-step-tab-btn ${wizardStep === 4 ? 'active' : ''}`}
                >
                  4. รอบ & โซนบัตร
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={wizardStep === 5}
                  onClick={() => setWizardStep(5)}
                  className={`events-step-tab-btn ${wizardStep === 5 ? 'active' : ''}`}
                >
                  5. รูปภาพ & สื่อ
                </button>
              </div>
            </div>

            {/* Scrollable Body Content (D-198) */}
            <div className="editor-modal-body-scrollable">
              {/* In-Modal Alert Banners (D-198 Item 3) */}
              {modalError && (
                <div
                  className="modal-danger-banner"
                  role="alert"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#991b1b', marginBottom: '1.25rem' }}
                >
                  <AlertIcon />
                  <span>{modalError}</span>
                </div>
              )}
              {modalSuccess && (
                <div
                  className="modal-info-banner"
                  role="status"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: '#166534',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    marginBottom: '1.25rem',
                  }}
                >
                  <CheckCircleIcon width={16} height={16} style={{ color: '#16a34a' }} />
                  <span>{modalSuccess}</span>
                </div>
              )}

              {/* STEP 1: ข้อมูลงาน & ศิลปิน (D-198, D-199 Item 1 Tooltips) */}
              {wizardStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label htmlFor="event-title" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      <span>ชื่องานคอนเสิร์ต *</span>
                      <HeaderInfoTooltip text="ระบุชื่อคอนเสิร์ตหรือชื่องานแสดงอย่างเป็นทางการสำหรับผู้ซื้อ" />
                    </label>
                    <input
                      id="event-title"
                      type="text"
                      required
                      value={title}
                      onChange={e => {
                        setTitle(e.target.value);
                        setDraftSaved(false);
                      }}
                      placeholder="เช่น ACOUSTIC ECHOES IN THE HALL 2026"
                      className="form-input-text"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="event-artists" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      <span>ศิลปินผู้ร่วมสร้างสรรค์ / ไลน์อัปการแสดง</span>
                      <HeaderInfoTooltip text="ระบุรายชื่อศิลปินหรือวงดนตรี คั่นด้วยเครื่องหมายจุลภาค เพื่อสร้างแท็กไลน์อัป" />
                    </label>
                    <input
                      id="event-artists"
                      type="text"
                      value={artists}
                      onChange={e => {
                        setArtists(e.target.value);
                        setDraftSaved(false);
                      }}
                      placeholder="ระบุชื่อศิลปิน คั่นด้วยจุลภาค เช่น THE NEON BAND, ELECTRIC DREAMS"
                      className="form-input-text"
                    />
                    <small className="form-field-helper">
                      * ศิลปินจะถูกจัดแสดงเป็นป้ายแท็ก Lineup สวยงามในหน้าคอนเสิร์ตสำหรับลูกค้า
                    </small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="event-description" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      <span>เกี่ยวกับคอนเสิร์ตนี้ / รายละเอียดและจุดเด่น</span>
                      <HeaderInfoTooltip text="ระบุคำอธิบาย ไฮไลต์การแสดง กฎเกณฑ์สำคัญ หรือสิ่งที่ผู้ชมจะได้รับ" />
                    </label>
                    <textarea
                      id="event-description"
                      value={description}
                      onChange={e => {
                        setDescription(e.target.value);
                        setDraftSaved(false);
                      }}
                      placeholder="• ระบบเสียงระดับสเตอริโอรอบทิศทาง&#10;• เต็มอิ่มกับการแสดงสดกว่า 3 ชั่วโมงเต็ม&#10;• สิทธิพิเศษสำหรับผู้ถือบัตรทุกโซน"
                      rows={5}
                      className="form-textarea-control"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: สถานที่ & แผนที่ (D-198, D-199 Item 1 Tooltips) */}
              {wizardStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label htmlFor="event-location" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      <span>สถานที่จัดงาน *</span>
                      <HeaderInfoTooltip text="ระบุชื่อฮอลล์ อารีน่า หรือสถานที่จัดงานจริงอย่างชัดเจน" />
                    </label>
                    <input
                      id="event-location"
                      type="text"
                      required
                      value={location}
                      onChange={e => {
                        setLocation(e.target.value);
                        setDraftSaved(false);
                      }}
                      placeholder="เช่น อิมแพ็ค อารีน่า เมืองทองธานี"
                      className="form-input-text"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="event-map-link" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      <span>ลิงก์แผนที่ Google Maps (ทางเลือก)</span>
                      <HeaderInfoTooltip text="วางลิงก์ Google Maps เพื่อให้ผู้ซื้อเปิดดูเส้นทาง หรือปล่อยว่างเพื่อให้ระบบค้นหาตามชื่อสถานที่" />
                    </label>
                    <input
                      id="event-map-link"
                      type="url"
                      value={googleMapsUrl}
                      onChange={e => {
                        setGoogleMapsUrl(e.target.value);
                        setDraftSaved(false);
                      }}
                      placeholder="https://maps.app.goo.gl/... (หากเว้นว่าง ระบบจะสร้างจากชื่อสถานที่ให้อัตโนมัติ)"
                      className="form-input-text"
                    />
                  </div>

                  {/* Map Preview Card & Test Pin Button (D-198 Item 6) */}
                  <div className="map-preview-card">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <strong style={{ fontSize: '0.86rem', color: '#0f172a' }}>
                        พิกัดสถานที่: {location.trim() || 'ยังไม่ได้ระบุสถานที่'}
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {googleMapsUrl.trim() ? googleMapsUrl.trim() : 'หากไม่ได้ระบุลิงก์ ระบบจะเปิดการค้นหาตามชื่อสถานที่ให้อัตโนมัติ'}
                      </span>
                    </div>
                    <a
                      href={
                        googleMapsUrl.trim() ||
                        (location.trim()
                          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`
                          : '#')
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-form-preview"
                      style={{
                        padding: '0.4rem 0.85rem',
                        fontSize: '0.82rem',
                        textDecoration: 'none',
                        opacity: location.trim() || googleMapsUrl.trim() ? 1 : 0.5,
                        pointerEvents: location.trim() || googleMapsUrl.trim() ? 'auto' : 'none',
                      }}
                      data-testid="test-map-pin-btn"
                    >
                      <span>ทดสอบเปิดดูพิกัดจริง &rarr;</span>
                    </a>
                  </div>

                  {/* Interactive Embedded Map Preview */}
                  {(location.trim() || googleMapsUrl.trim()) && (
                    <div style={{ marginTop: '0.5rem', borderRadius: '10px', overflow: 'hidden', height: '220px', border: '1px solid #e2e8f0' }}>
                      <iframe
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(location.trim() || googleMapsUrl.trim())}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                        width="100%"
                        height="220"
                        style={{ border: 0 }}
                        loading="lazy"
                        title={`แผนที่ ${location || 'สถานที่จัดงาน'}`}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: กำหนดการ & กติกาการซื้อ (D-198, D-199 Item 1, Item 4) */}
              {wizardStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="form-row-two-col">
                    <div className="form-group">
                      <label htmlFor="event-sales-start" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                        <span>วันและเวลาเริ่มต้นเปิดขายบัตร</span>
                        <HeaderInfoTooltip text="กำหนดเวลาเริ่มจำหน่าย หากปล่อยว่างจะเปิดขายทันทีหลังได้รับการอนุมัติ" />
                      </label>
                      <input
                        id="event-sales-start"
                        type="datetime-local"
                        value={salesStartTime}
                        onChange={e => {
                          setSalesStartTime(e.target.value);
                          setDraftSaved(false);
                        }}
                        className="form-input-text"
                      />
                      <small className="form-field-helper">
                        * หากเว้นว่าง บัตรจะเริ่มจำหน่ายทันทีหลังได้รับการอนุมัติ
                      </small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="event-sales-end" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                        <span>วันและเวลาสิ้นสุดการขายบัตร</span>
                        <HeaderInfoTooltip text="กำหนดเวลาปิดจำหน่าย หากปล่อยว่างจะปิดการขายตามเวลาเริ่มการแสดงแต่ละรอบ" />
                      </label>
                      <input
                        id="event-sales-end"
                        type="datetime-local"
                        value={salesEndTime}
                        onChange={e => {
                          setSalesEndTime(e.target.value);
                          setDraftSaved(false);
                        }}
                        className="form-input-text"
                      />
                      <small className="form-field-helper">
                        * หากเว้นว่าง การขายจะปิดตามเวลาเริ่มการแสดงของแต่ละรอบ
                      </small>
                    </div>
                  </div>

                  {/* Order Limit Rule: Two-Segment Tabs (D-199 Item 4) */}
                  <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', margin: 0, color: '#0f172a' }}>
                          จำกัดการซื้อสูงสุดต่อคำสั่งซื้อ *
                        </span>
                        <HeaderInfoTooltip text="เลือกจำนวนบัตรสูงสุดที่ผู้ซื้อสามารถทำรายการได้ใน 1 คำสั่งซื้อ เพื่อป้องกันการกักตุนบัตร หรือเลือกไม่จำกัดจำนวน" />
                      </div>
                      <span className="aspect-ratio-badge">
                        {limitMode === 'unlimited' ? 'ไม่จำกัดจำนวน' : `กำหนด ${limitPerOrder} ใบ`}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', color: '#64748b' }}>
                      เลือกโหมดจำกัดจำนวนบัตรต่อคำสั่งซื้อเพื่อป้องกันการกักตุนบัตร หรือเปิดให้ซื้อได้อิสระ
                    </p>

                    <div className="limit-mode-tabs" role="tablist" aria-label="โหมดจำกัดการซื้อ">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={limitMode === 'custom'}
                        className={`limit-mode-tab-btn ${limitMode === 'custom' ? 'active' : ''}`}
                        onClick={() => {
                          setLimitMode('custom');
                          if (limitPerOrder >= 99) setLimitPerOrder(4);
                          setDraftSaved(false);
                        }}
                        data-testid="limit-mode-custom-btn"
                      >
                        <span>ระบุจำนวนเอง (1-10 ใบ)</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={limitMode === 'unlimited'}
                        className={`limit-mode-tab-btn ${limitMode === 'unlimited' ? 'active' : ''}`}
                        onClick={() => {
                          setLimitMode('unlimited');
                          setLimitPerOrder(99);
                          setDraftSaved(false);
                        }}
                        data-testid="limit-pill-unlimited"
                      >
                        <span>ไม่จำกัดจำนวน</span>
                      </button>
                    </div>

                    {limitMode === 'custom' ? (
                      <div className="volume-bar-stepper" data-testid="volume-bar-stepper">
                        <div className="volume-bar-row">
                          {/* Minimal Line [-] Button */}
                          <button
                            type="button"
                            className="volume-bar-btn"
                            disabled={limitPerOrder <= 1}
                            onClick={() => {
                              setLimitPerOrder(prev => Math.max(1, prev - 1));
                              setDraftSaved(false);
                            }}
                            aria-label="ลดจำนวนบัตร"
                            data-testid="volume-bar-decrement-btn"
                          >
                            -
                          </button>

                          {/* 10-Segment Volume Bar Track */}
                          <div className="volume-bar-track">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                              const isFilled = n <= limitPerOrder;
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  className={`volume-bar-segment ${isFilled ? 'filled' : ''}`}
                                  onClick={() => {
                                    setLimitPerOrder(n);
                                    setDraftSaved(false);
                                  }}
                                  aria-label={`กำหนด ${n} ใบ`}
                                  aria-pressed={limitPerOrder === n}
                                  data-testid={`volume-bar-segment-${n}`}
                                >
                                  {n}
                                </button>
                              );
                            })}
                          </div>

                          {/* Minimal Line [+] Button */}
                          <button
                            type="button"
                            className="volume-bar-btn"
                            disabled={limitPerOrder >= 10}
                            onClick={() => {
                              setLimitPerOrder(prev => Math.min(10, prev + 1));
                              setDraftSaved(false);
                            }}
                            aria-label="เพิ่มจำนวนบัตร"
                            data-testid="volume-bar-increment-btn"
                          >
                            +
                          </button>
                        </div>

                        <div className="volume-bar-info">
                          <span>ระดับจำนวนซื้อที่เลือก:</span>
                          <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>
                            {limitPerOrder} ใบ / คำสั่งซื้อ
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                        <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.88rem', marginBottom: '0.2rem' }}>
                          เปิดให้ซื้อได้อย่างอิสระไม่จำกัดจำนวน
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569' }}>
                          ผู้ซื้อสามารถทำรายการซื้อบัตรได้ไม่จำกัดจำนวนต่อ 1 คำสั่งซื้อ (สูงสุดตามโควตาคงเหลือของรอบการแสดง)
                        </p>
                      </div>
                    )}

                    <div style={{ marginTop: '0.55rem', fontSize: '0.82rem', color: '#475569' }}>
                      สถานะปัจจุบัน:{' '}
                      <strong style={{ color: 'var(--blue)' }}>
                        {limitMode === 'unlimited'
                          ? 'ไม่จำกัดจำนวนการซื้อ (สั่งซื้อได้ไม่จำกัดสูงสุดตามโควตาคงเหลือ)'
                          : `จำกัด ${limitPerOrder} ใบ ต่อ 1 คำสั่งซื้อ`}
                      </strong>
                    </div>
                  </div>

                  {/* Age Restriction & Refund Policy (D-218) */}
                  <div className="form-row-two-col">
                    <div className="form-group">
                      <label htmlFor="event-age-restriction" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                        <span>การจำกัดอายุผู้ชม (Age Restriction)</span>
                        <HeaderInfoTooltip text="กำหนดเกณฑ์อายุขั้นต่ำของผู้เข้าชมคอนเสิร์ต" />
                      </label>
                      <select
                        id="event-age-restriction"
                        value={ageRestriction}
                        onChange={e => {
                          setAgeRestriction(e.target.value as 'all' | '18+' | '20+');
                          setDraftSaved(false);
                        }}
                        className="form-input-text"
                        style={{ padding: '0.55rem 0.75rem', fontSize: '0.88rem' }}
                        data-testid="event-age-restriction-select"
                      >
                        <option value="all">ไม่จำกัดอายุ (All Ages)</option>
                        <option value="18+">จำกัดอายุ 18 ปีบริบูรณ์ขึ้นไป (18+)</option>
                        <option value="20+">จำกัดอายุ 20 ปีบริบูรณ์ขึ้นไป (20+)</option>
                      </select>
                      <small className="form-field-helper">
                        * ระบบจะแสดงป้ายแจ้งเตือนอายุบนหน้ารายละเอียดคอนเสิร์ต
                      </small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="event-refund-policy" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                        <span>นโยบายการคืนเงิน (Refund Policy)</span>
                        <HeaderInfoTooltip text="ข้อกำหนดการขอคืนเงินของคอนเสิร์ตนี้" />
                      </label>
                      <select
                        id="event-refund-policy"
                        value={refundPolicy}
                        onChange={e => {
                          setRefundPolicy(e.target.value as 'refundable_7d' | 'non_refundable' | 'custom');
                          setDraftSaved(false);
                        }}
                        className="form-input-text"
                        style={{ padding: '0.55rem 0.75rem', fontSize: '0.88rem' }}
                        data-testid="event-refund-policy-select"
                      >
                        <option value="refundable_7d">ขอคืนเงินได้ตามเงื่อนไขล่วงหน้าอย่างน้อย 7 วันก่อนวันแสดง</option>
                        <option value="non_refundable">ไม่รับคืนเงินทุกกรณี (ยกเว้นงานยกเลิกหรือเลื่อน)</option>
                        <option value="custom">ระบุข้อกำหนดเฉพาะ</option>
                      </select>
                      <small className="form-field-helper">
                        * นโยบายจะถูกบันทึกและแสดงให้ผู้ซื้อรับทราบก่อนยืนยันชำระเงิน
                      </small>
                    </div>
                  </div>

                  {refundPolicy === 'custom' && (
                    <div className="form-group">
                      <label htmlFor="event-refund-custom" style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                        <span>ระบุรายละเอียดนโยบายการคืนเงินเฉพาะ</span>
                      </label>
                      <textarea
                        id="event-refund-custom"
                        rows={2}
                        value={refundPolicyCustom}
                        onChange={e => {
                          setRefundPolicyCustom(e.target.value);
                          setDraftSaved(false);
                        }}
                        placeholder="เช่น คืนเงินได้ 50% ภายใน 14 วันก่อนแสดง..."
                        className="form-input-text"
                        style={{ resize: 'vertical', fontSize: '0.85rem' }}
                      />
                    </div>
                  )}

                  {/* Entry Guidelines (D-218) */}
                  <div className="form-group">
                    <label htmlFor="event-entry-guidelines" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      <span>กติกาการเข้างานและมาตรการรักษาความปลอดภัย (Entry Guidelines)</span>
                      <HeaderInfoTooltip text="คำแนะนำสำหรับผู้เข้าชม เช่น เอกสารที่ต้องเตรียม สิ่งของต้องห้าม การตรวจค้นสัมภาระ" />
                    </label>
                    <textarea
                      id="event-entry-guidelines"
                      rows={2}
                      value={entryGuidelines}
                      onChange={e => {
                        setEntryGuidelines(e.target.value);
                        setDraftSaved(false);
                      }}
                      placeholder="เช่น แสดงบัตรประชาชนตัวจริงพร้อม QR Code บัตร, ห้ามนำอาวุธ สารเสพติด กล้องโปร หรืออาหารเครื่องดื่มเข้าพื้นที่..."
                      className="form-input-text"
                      style={{ resize: 'vertical', fontSize: '0.85rem' }}
                      data-testid="event-entry-guidelines-input"
                    />
                  </div>

                  {/* Payout Bank Account Selection (D-218) */}
                  <div className="form-group" data-testid="payout-account-selection-group">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', margin: 0, color: '#0f172a' }}>
                          บัญชีธนาคารสำหรับรับเงินโอน (Payout Bank Account) *
                        </span>
                        <HeaderInfoTooltip text="เลือกบัญชีธนาคารของคุณที่ต้องการให้ระบบโอนรายได้สุทธิหลังหักค่าบริการให้ตามรอบจ่ายเงิน" />
                      </div>
                      <span className="aspect-ratio-badge">
                        {payoutAccounts.length} บัญชีที่ผูกไว้
                      </span>
                    </div>
                    <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', color: '#64748b' }}>
                      เลือกบัญชีปลายทางสำหรับรับเงินรายได้จากการขายบัตรคอนเสิร์ตนี้ (ข้อมูลซิงก์จากหน้าการเงินและการตั้งค่า)
                    </p>

                    <div className="payout-account-select-grid">
                      {payoutAccounts.map(acc => {
                        const isSelected = (selectedPayoutAccountId || payoutAccounts[0]?.id) === acc.id;
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                              setSelectedPayoutAccountId(acc.id);
                              setDraftSaved(false);
                            }}
                            className={`payout-account-select-card ${isSelected ? 'selected' : ''}`}
                            data-testid={`payout-account-card-${acc.id}`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                              <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{acc.bankName}</strong>
                              {isSelected && (
                                <span className="payout-selected-badge">
                                  <CheckCircleIcon width={14} height={14} />
                                  <span>เลือกบัญชีนี้</span>
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.85rem', color: '#1e293b', fontFamily: 'monospace', fontWeight: 600 }}>
                              {acc.accountNumber}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                              ชื่อบัญชี: {acc.accountName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: รอบการแสดง & โซนบัตร (D-198, D-199 Item 5, 8, 9) */}
              {wizardStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Sessions Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: '#0f172a', display: 'block' }}>
                        กำหนดรอบการแสดงและประเภทบัตร ({sessions.length} รอบ)
                      </strong>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                        ปรับแต่งได้อย่างอิสระ แต่ละรอบสามารถมีประเภทบัตร โควตา ราคา ย่อขยาย และจัดเรียงลำดับได้
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-form-preview"
                      onClick={() => {
                        handleAddSession();
                        setDraftSaved(false);
                      }}
                      style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
                      data-testid="add-session-btn"
                    >
                      <PlusIcon width={14} height={14} />
                      <span>เพิ่มรอบการแสดงใหม่</span>
                    </button>
                  </div>

                  {/* Sessions List with Collapsible Cards (D-199 Item 8) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {sessions.map((sess, idx) => {
                      const isExpanded = expandedSessionIds[sess.id] !== false;
                      const sessionSummary = sess.startTime
                        ? `${new Date(sess.startTime).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}, ${new Date(sess.startTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}${sess.endTime ? ` - ${new Date(sess.endTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                        : 'ยังไม่ได้ระบุวันเวลาการแสดง';

                      return (
                        <div
                          key={sess.id}
                          className="session-accordion-card"
                          data-testid={`session-draft-card-${idx}`}
                        >
                          {/* Accordion Header */}
                          <div className={`session-accordion-header ${isExpanded ? 'is-open' : ''}`}>
                            <button
                              type="button"
                              className="session-accordion-toggle-btn"
                              onClick={() => toggleSessionExpand(sess.id)}
                              aria-expanded={isExpanded}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.65rem',
                                textAlign: 'left',
                                fontFamily: 'inherit',
                                flex: 1,
                              }}
                            >
                              <span className="aspect-ratio-badge">
                                รอบที่ {idx + 1}
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>
                                  {sessionSummary}
                                </strong>
                                <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                  {sess.ticketTypes.length} โซนบัตร
                                </span>
                              </div>
                            </button>

                            {/* Session Actions: Move Up / Down, Duplicate, Remove, Collapse Toggle */}
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="session-reorder-btn"
                                disabled={idx === 0}
                                onClick={() => {
                                  handleMoveSession(idx, 'up');
                                  setDraftSaved(false);
                                }}
                                title="เลื่อนรอบนี้ขึ้น"
                                data-testid={`move-session-up-${idx}`}
                              >
                                <ChevronUpIcon width={13} height={13} />
                                <span>เลื่อนขึ้น</span>
                              </button>
                              <button
                                type="button"
                                className="session-reorder-btn"
                                disabled={idx === sessions.length - 1}
                                onClick={() => {
                                  handleMoveSession(idx, 'down');
                                  setDraftSaved(false);
                                }}
                                title="เลื่อนรอบนี้ลง"
                                data-testid={`move-session-down-${idx}`}
                              >
                                <ChevronDownIcon width={13} height={13} />
                                <span>เลื่อนลง</span>
                              </button>
                              <button
                                type="button"
                                className="btn-form-preview"
                                onClick={() => {
                                  handleDuplicateSession(idx);
                                  setDraftSaved(false);
                                }}
                                style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                                title="คัดลอกข้อมูลรอบนี้เพื่อสร้างรอบใหม่ที่แก้ไขต่อได้ง่าย"
                              >
                                <PlusIcon width={13} height={13} />
                                <span>คัดลอกรอบ</span>
                              </button>
                              {sessions.length > 1 && (
                                <button
                                  type="button"
                                  className="btn-form-cancel"
                                  onClick={() => {
                                    handleRemoveSession(sess.id);
                                    setDraftSaved(false);
                                  }}
                                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                                  title="ลบรอบการแสดงนี้"
                                >
                                  <TrashIcon width={13} height={13} />
                                  <span>ลบรอบนี้</span>
                                </button>
                              )}
                              <button
                                type="button"
                                className="session-reorder-btn"
                                onClick={() => toggleSessionExpand(sess.id)}
                                aria-label={isExpanded ? 'ย่อการ์ดรอบนี้' : 'ขยายการ์ดรอบนี้'}
                                title={isExpanded ? 'ย่อการ์ด' : 'ขยายการ์ด'}
                                data-testid={`toggle-session-expand-${idx}`}
                              >
                                {isExpanded ? <ChevronUpIcon width={14} height={14} /> : <ChevronDownIcon width={14} height={14} />}
                              </button>
                            </div>
                          </div>

                          {/* Accordion Body */}
                          {isExpanded && (
                            <div className="session-accordion-body">
                              <div className="form-row-two-col" style={{ marginBottom: '0.75rem' }}>
                                <div>
                                  <label htmlFor={`sess-start-${sess.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                    <span>วันเวลาเริ่มการแสดง (Show Start) *</span>
                                    <HeaderInfoTooltip text="วันและเวลาที่การแสดงเริ่มต้นขึ้นจริง" />
                                  </label>
                                  <input
                                    id={`sess-start-${sess.id}`}
                                    type="datetime-local"
                                    required
                                    value={sess.startTime}
                                    onChange={e => {
                                      handleUpdateSession(sess.id, { startTime: e.target.value });
                                      setDraftSaved(false);
                                    }}
                                    className="form-input-text"
                                    style={{ fontSize: '0.85rem' }}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`sess-end-${sess.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                    <span>วันเวลาสิ้นสุดการแสดง (Show End) *</span>
                                    <HeaderInfoTooltip text="วันและเวลาที่การแสดงเสร็จสิ้นโดยประมาณ" />
                                  </label>
                                  <input
                                    id={`sess-end-${sess.id}`}
                                    type="datetime-local"
                                    required
                                    value={sess.endTime}
                                    onChange={e => {
                                      handleUpdateSession(sess.id, { endTime: e.target.value });
                                      setDraftSaved(false);
                                    }}
                                    className="form-input-text"
                                    style={{ fontSize: '0.85rem' }}
                                  />
                                </div>
                              </div>

                              <div className="form-row-two-col" style={{ marginBottom: '1rem' }}>
                                <div>
                                  <label htmlFor={`sess-adm-start-${sess.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                    <span>เวลาประตูเปิด / รับเข้างาน (Doors Open)</span>
                                    <HeaderInfoTooltip text="เวลาเปิดประตูให้ผู้ชมเริ่มเข้าสู่บริเวณฮอลล์การแสดง" />
                                  </label>
                                  <input
                                    id={`sess-adm-start-${sess.id}`}
                                    type="datetime-local"
                                    value={sess.admissionStartTime}
                                    onChange={e => {
                                      handleUpdateSession(sess.id, { admissionStartTime: e.target.value });
                                      setDraftSaved(false);
                                    }}
                                    className="form-input-text"
                                    style={{ fontSize: '0.85rem' }}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`sess-adm-end-${sess.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                    <span>สิ้นสุดช่วงเวลารับเข้างาน</span>
                                    <HeaderInfoTooltip text="เวลาปิดรับผู้ชมเข้างานเพื่อความเรียบร้อยของการแสดง" />
                                  </label>
                                  <input
                                    id={`sess-adm-end-${sess.id}`}
                                    type="datetime-local"
                                    value={sess.admissionEndTime}
                                    onChange={e => {
                                      handleUpdateSession(sess.id, { admissionEndTime: e.target.value });
                                      setDraftSaved(false);
                                    }}
                                    className="form-input-text"
                                    style={{ fontSize: '0.85rem' }}
                                  />
                                </div>
                              </div>

                              {/* Ticket types per session */}
                              <div style={{ marginTop: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                                    โซนและประเภทบัตรของรอบนี้ ({sess.ticketTypes.length} ประเภท)
                                  </span>
                                  <button
                                    type="button"
                                    className="btn-form-preview"
                                    onClick={() => {
                                      handleAddTicketType(sess.id);
                                      setDraftSaved(false);
                                    }}
                                    style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                                  >
                                    + เพิ่มโซนบัตร
                                  </button>
                                </div>

                                {/* Column Headers */}
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1fr 1fr auto',
                                    gap: '0.5rem',
                                    padding: '0.15rem 0.65rem 0.4rem 0.65rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: '#475569',
                                    borderBottom: '1px solid #e2e8f0',
                                    marginBottom: '0.35rem',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>ชื่อประเภทบัตร / โซน *</span>
                                    <HeaderInfoTooltip text="ระบุชื่อโซน เช่น VIP Zone, Regular, Standing" />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>ราคา (บาท) *</span>
                                    <HeaderInfoTooltip text="ราคาบัตรต่อ 1 ใบ (บาท)" />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>จำนวนโควตา (ใบ) *</span>
                                    <HeaderInfoTooltip text="จำนวนบัตรทั้งหมดที่เปิดจำหน่ายสำหรับโซนนี้" />
                                  </div>
                                  <span style={{ width: '28px' }} aria-hidden="true" />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {sess.ticketTypes.map(tt => (
                                    <div
                                      key={tt.id}
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.4rem',
                                        background: tt.isStudentPrivilege ? '#f0f7ff' : '#ffffff',
                                        padding: '0.55rem 0.65rem',
                                        borderRadius: '8px',
                                        border: tt.isStudentPrivilege ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: '2fr 1fr 1fr auto',
                                          gap: '0.5rem',
                                          alignItems: 'center',
                                        }}
                                      >
                                        <div>
                                          <label htmlFor={`tt-name-${tt.id}`} className="sr-only">ชื่อประเภทบัตรหรือโซน</label>
                                          <input
                                            id={`tt-name-${tt.id}`}
                                            type="text"
                                            required
                                            value={tt.name}
                                            onChange={e => {
                                              handleUpdateTicketType(sess.id, tt.id, { name: e.target.value });
                                              setDraftSaved(false);
                                            }}
                                            placeholder="ชื่อโซน เช่น VIP Zone"
                                            className="form-input-text"
                                            style={{ padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                                          />
                                        </div>
                                        <div>
                                          <label htmlFor={`tt-price-${tt.id}`} className="sr-only">ราคาบัตร (บาท)</label>
                                          <input
                                            id={`tt-price-${tt.id}`}
                                            type="number"
                                            required
                                            min={0}
                                            value={tt.price === 0 ? '' : tt.price}
                                            onChange={e => {
                                              const raw = e.target.value;
                                              handleUpdateTicketType(sess.id, tt.id, {
                                                price: raw === '' ? 0 : Math.max(0, Number(raw)),
                                              });
                                              setDraftSaved(false);
                                            }}
                                            placeholder="0"
                                            className="form-input-text"
                                            style={{ padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                                          />
                                        </div>
                                        <div>
                                          <label htmlFor={`tt-quota-${tt.id}`} className="sr-only">จำนวนโควตาบัตร (ใบ)</label>
                                          <input
                                            id={`tt-quota-${tt.id}`}
                                            type="number"
                                            required
                                            min={1}
                                            value={tt.quota === 0 ? '' : tt.quota}
                                            onChange={e => {
                                              const raw = e.target.value;
                                              handleUpdateTicketType(sess.id, tt.id, {
                                                quota: raw === '' ? 0 : Math.max(0, Number(raw)),
                                              });
                                              setDraftSaved(false);
                                            }}
                                            placeholder="0"
                                            className="form-input-text"
                                            style={{ padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                                          />
                                        </div>
                                        {sess.ticketTypes.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleRemoveTicketType(sess.id, tt.id);
                                              setDraftSaved(false);
                                            }}
                                            className="btn-form-cancel"
                                            style={{ padding: '0.4rem 0.5rem', background: '#ffffff', border: '1px solid #cbd5e1' }}
                                            title="ลบโซนนี้"
                                          >
                                            <TrashIcon width={14} height={14} />
                                          </button>
                                        )}
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.15rem 0.2rem 0', borderTop: '1px dashed #e2e8f0' }}>
                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: tt.isStudentPrivilege ? '#1848ed' : '#64748b', cursor: 'pointer', fontWeight: tt.isStudentPrivilege ? 600 : 400 }}>
                                          <input
                                            type="checkbox"
                                            checked={Boolean(tt.isStudentPrivilege)}
                                            onChange={e => {
                                              handleUpdateTicketType(sess.id, tt.id, { isStudentPrivilege: e.target.checked });
                                              setDraftSaved(false);
                                            }}
                                            data-testid={`ticket-student-checkbox-${tt.id}`}
                                          />
                                          <span>กำหนดเป็นบัตรสิทธิ์พิเศษนักศึกษา ม.อุบล (@ubu.ac.th)</span>
                                        </label>
                                        {tt.isStudentPrivilege && (
                                          <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#1848ed', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                            สิทธิ์ ม.อุบล
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* UBU Student Privilege Mode Box (D-217) */}
                  <div className="ubu-privilege-setting-card" data-testid="ubu-privilege-setting-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
                          <ShieldCheckIcon width={18} height={18} style={{ color: '#1848ed' }} />
                          <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                            สิทธิ์พิเศษนักศึกษาและบุคลากร ม.อุบลราชธานี (UBU Privilege Mode)
                          </strong>
                          <HeaderInfoTooltip text="เปิดใช้งานการตรวจสิทธิ์นักศึกษาผ่านอีเมล @ubu.ac.th เพื่อรับสิทธิ์ซื้อบัตรราคาพิเศษหรือโควตานักศึกษา" />
                        </div>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569' }}>
                          เปิดรับผู้ซื้อสิทธิ์ ม.อุบล โดยระบบจะตรวจสอบยืนยันตัวตนด้วยอีเมล @ubu.ac.th ผ่าน OTP ในขั้นตอนการสั่งซื้อบัตรโดยอัตโนมัติ
                        </p>
                      </div>

                      <label className="ubu-privilege-switch" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={ubuPrivilegeMode}
                          onChange={e => {
                            setUbuPrivilegeMode(e.target.checked);
                            setDraftSaved(false);
                          }}
                          data-testid="ubu-privilege-toggle"
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: ubuPrivilegeMode ? '#1848ed' : '#64748b' }}>
                          {ubuPrivilegeMode ? 'เปิดใช้งานสิทธิ์ ม.อุบล' : 'ปิดใช้งาน'}
                        </span>
                      </label>
                    </div>

                    {ubuPrivilegeMode && (
                      <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.82rem', color: '#1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem', color: '#1848ed', fontWeight: 600 }}>
                          <CheckCircleIcon width={14} height={14} />
                          <span>เปิดรับสิทธิ์ ม.อุบล แล้ว</span>
                        </div>
                        <p style={{ margin: 0, color: '#475569' }}>
                          ท่านสามารถทำเครื่องหมาย [สำหรับสิทธิ์นักศึกษา ม.อุบล (@ubu.ac.th)] ที่โซนบัตรด้านบน เพื่อกำหนดเป็นบัตรราคาพิเศษหรือโควตาเฉพาะกลุ่มนักศึกษา ม.อุบล
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Standard Platform Fee Transparency Summary Card (D-217) */}
                  <div className="platform-fee-transparency-card" data-testid="platform-fee-transparency-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <BanknotesIcon width={18} height={18} style={{ color: '#0f172a' }} />
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                          สรุปข้อตกลงค่าบริการแพลตฟอร์ม TICKET (Platform Fee Agreement)
                        </strong>
                        <HeaderInfoTooltip text="อัตราค่าบริการมาตรฐานที่ระบบจะหักจากยอดขายบัตรที่ชำระเงินสำเร็จ และข้อตกลงทางการเงิน" />
                      </div>
                      <span className="fee-rate-pill">ค่าบริการมาตรฐาน: 3.00%</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '0.65rem' }}>
                      <div className="fee-calc-box">
                        <span className="fee-calc-label">อัตราค่าบริการมาตรฐาน</span>
                        <strong className="fee-calc-val">3.00%</strong>
                        <small className="fee-calc-desc">คิดเฉพาะยอดคำสั่งซื้อที่ชำระเงินสำเร็จ</small>
                      </div>

                      <div className="fee-calc-box">
                        <span className="fee-calc-label">สูตรการคำนวณหักยอดเงิน</span>
                        <strong className="fee-calc-val">ยอดขายรวม − 3%</strong>
                        <small className="fee-calc-desc">หักอัตโนมัติก่อนโอนเข้าบัญชีรับเงิน</small>
                      </div>

                      <div className="fee-calc-box">
                        <span className="fee-calc-label">การพิจารณาอัตราพิเศษ</span>
                        <strong className="fee-calc-val" style={{ color: '#1848ed' }}>โดยแอดมิน</strong>
                        <small className="fee-calc-desc">แอดมินสามารถปรับอัตราพิเศษให้ในขั้นตอนอนุมัติ</small>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: รูปภาพ & สื่อประชาสัมพันธ์ (D-198, D-199 Item 5, 6, 7) */}
              {wizardStep === 5 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="compact-image-grid">
                    {/* 1. Vertical Poster (4:5) */}
                    <div className="compact-image-card">
                      <div className="compact-image-header">
                        <strong className="compact-image-title">
                          <span>1. โปสเตอร์แนวตั้ง</span>
                          <HeaderInfoTooltip text="ภาพโปสเตอร์แนวตั้งสัดส่วน 4:5 สำหรับแสดงในการ์ดหน้าแรกและค้นหา (แนะนำ 800 x 1000 px)" />
                        </strong>
                        <span className="aspect-ratio-badge">4:5</span>
                      </div>

                      <div className="compact-image-preview-box">
                        {posterPreviewUrl ? (
                          <>
                            {/* biome-ignore lint/performance/noImgElement: aspect preview */}
                            <img src={posterPreviewUrl} alt="ตัวอย่างโปสเตอร์แนวตั้ง" className="compact-image-thumb" />
                          </>
                        ) : (
                          <label className="aspect-dropzone-label" style={{ padding: '0.5rem' }}>
                            <TicketIcon />
                            <span className="aspect-dropzone-text" style={{ fontSize: '0.78rem' }}>คลิกเลือกไฟล์รูปโปสเตอร์</span>
                            <span className="aspect-dropzone-hint" style={{ fontSize: '0.7rem' }}>สัดส่วน 4:5 · แนะนำ 800x1000px</span>
                            <input
                              id="event-poster"
                              type="file"
                              accept="image/*"
                              onChange={e => {
                                handlePosterChange(e.target.files?.[0] || null);
                                setDraftSaved(false);
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                        )}
                      </div>

                      {posterPreviewUrl && (
                        <div className="compact-image-actions">
                          <label className="aspect-action-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                            <span>เปลี่ยนรูป</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => {
                                handlePosterChange(e.target.files?.[0] || null);
                                setDraftSaved(false);
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                          <button
                            type="button"
                            className="aspect-action-btn btn-remove"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              handlePosterChange(null);
                              setDraftSaved(false);
                            }}
                          >
                            ลบ
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 2. Horizontal Cover Banner (21:9) */}
                    <div className="compact-image-card">
                      <div className="compact-image-header">
                        <strong className="compact-image-title">
                          <span>2. แบนเนอร์แนวยาว</span>
                          <HeaderInfoTooltip text="ภาพแบนเนอร์แนวยาวสัดส่วน 21:9 สำหรับส่วนหัวหน้ารายละเอียดคอนเสิร์ต (แนะนำ 2100 x 900 px)" />
                        </strong>
                        <span className="aspect-ratio-badge">21:9</span>
                      </div>

                      <div className="compact-image-preview-box">
                        {coverBannerPreviewUrl ? (
                          <>
                            {/* biome-ignore lint/performance/noImgElement: aspect preview */}
                            <img src={coverBannerPreviewUrl} alt="ตัวอย่างแบนเนอร์แนวยาว" className="compact-image-thumb" />
                          </>
                        ) : (
                          <label className="aspect-dropzone-label" style={{ padding: '0.5rem' }}>
                            <TicketIcon />
                            <span className="aspect-dropzone-text" style={{ fontSize: '0.78rem' }}>คลิกเลือกไฟล์แบนเนอร์</span>
                            <span className="aspect-dropzone-hint" style={{ fontSize: '0.7rem' }}>สัดส่วน 21:9 · แนะนำ 2100x900px</span>
                            <input
                              id="event-cover-banner"
                              type="file"
                              accept="image/*"
                              onChange={e => {
                                handleCoverBannerChange(e.target.files?.[0] || null);
                                setDraftSaved(false);
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                        )}
                      </div>

                      {coverBannerPreviewUrl && (
                        <div className="compact-image-actions">
                          <label className="aspect-action-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                            <span>เปลี่ยนรูป</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => {
                                handleCoverBannerChange(e.target.files?.[0] || null);
                                setDraftSaved(false);
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                          <button
                            type="button"
                            className="aspect-action-btn btn-remove"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              handleCoverBannerChange(null);
                              setDraftSaved(false);
                            }}
                          >
                            ลบ
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 3. Digital Ticket Template (2.4:1) */}
                    <div className="compact-image-card">
                      <div className="compact-image-header">
                        <strong className="compact-image-title">
                          <span>3. ภาพพื้นหลังตั๋ว</span>
                          <HeaderInfoTooltip text="ภาพพื้นหลังบัตรดิจิทัลสัดส่วน 2.4:1 สำหรับพิมพ์บน E-Ticket และ QR Code (แนะนำ 1200 x 500 px)" />
                        </strong>
                        <span className="aspect-ratio-badge">2.4:1</span>
                      </div>

                      <div className="compact-image-preview-box">
                        {ticketTemplatePreviewUrl ? (
                          <>
                            {/* biome-ignore lint/performance/noImgElement: aspect preview */}
                            <img src={ticketTemplatePreviewUrl} alt="ตัวอย่างพื้นหลังบัตร" className="compact-image-thumb" />
                          </>
                        ) : (
                          <label className="aspect-dropzone-label" style={{ padding: '0.5rem' }}>
                            <TicketIcon />
                            <span className="aspect-dropzone-text" style={{ fontSize: '0.78rem' }}>คลิกเลือกภาพพื้นหลังตั๋ว</span>
                            <span className="aspect-dropzone-hint" style={{ fontSize: '0.7rem' }}>สัดส่วน 2.4:1 · แนะนำ 1200x500px</span>
                            <input
                              id="event-ticket-template"
                              type="file"
                              accept="image/*"
                              onChange={e => {
                                handleTemplateChange(e.target.files?.[0] || null);
                                setDraftSaved(false);
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                        )}
                      </div>

                      {ticketTemplatePreviewUrl && (
                        <div className="compact-image-actions">
                          <label className="aspect-action-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                            <span>เปลี่ยนรูป</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => {
                                handleTemplateChange(e.target.files?.[0] || null);
                                setDraftSaved(false);
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                          <button
                            type="button"
                            className="aspect-action-btn btn-remove"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              handleTemplateChange(null);
                              setDraftSaved(false);
                            }}
                          >
                            ลบ
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Live Customer Preview Modal (D-198: Faithful WYSIWYG replica of /events/[id]) */}
      {showPreview && (
        <div className="events-editor-modal-backdrop" role="dialog" aria-modal="true" aria-label="ตัวอย่างหน้าเว็บคอนเสิร์ต">
          <div className="events-editor-modal-card" style={{ maxWidth: '980px', width: '95vw', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}>
            {/* Preview Modal Header */}
            <div style={{ position: 'sticky', top: 0, zIndex: 40, background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '0.85rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="scanner-badge badge-primary-offline" style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <EyeIcon width={13} height={13} />
                  <span>โหมดดูตัวอย่างเสมือนจริง (Customer View Preview)</span>
                </span>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  จำลองหน้าเว็บจริงที่ลูกค้าจะมองเห็นในขั้นตอนเลือกซื้อบัตร
                </span>
              </div>
              <button
                type="button"
                className="btn-form-cancel"
                onClick={() => setShowPreview(false)}
                style={{ padding: '0.45rem 0.95rem', fontSize: '0.82rem' }}
                data-testid="close-preview-btn"
              >
                กลับไปแก้ไขข้อมูล
              </button>
            </div>

            {/* Simulated Public Customer View */}
            <div style={{ padding: '1.25rem 1.5rem', pointerEvents: 'none' }}>
              <div className="event-detail-page simulated-preview" style={{ margin: 0, padding: 0 }}>
                {/* 1. Panoramic Cover Banner */}
                <div className="event-cover-banner-wrapper">
                  {coverBannerPreviewUrl || posterPreviewUrl ? (
                    /* biome-ignore lint/performance/noImgElement: live preview banner */
                    <img
                      src={coverBannerPreviewUrl || posterPreviewUrl || ''}
                      alt="แบนเนอร์คอนเสิร์ต"
                      className="event-cover-banner-img"
                    />
                  ) : (
                    <div className="event-cover-banner-placeholder">
                      <TicketIcon />
                      <span>LIVE CONCERT EXPERIENCE</span>
                    </div>
                  )}
                </div>

                {/* 2. Hero Event Overview Card */}
                <header className="event-hero-card">
                  <div className="hero-card-header-row">
                    <h1 className="event-title" style={{ margin: 0 }}>
                      {title || 'ชื่องานคอนเสิร์ตของคุณ'}
                    </h1>
                    <div className="hero-price-wrap">
                      <span className="hero-price-label">ราคาบัตร</span>
                      <span className="hero-price-amount">
                        {previewStartingPrice > 0 ? `เริ่มต้น ${formatBaht(previewStartingPrice)}` : '฿1,500.00'}
                      </span>
                    </div>
                  </div>

                  <div className="hero-meta-cards-track">
                    <div className="hero-meta-card">
                      <div className="meta-icon-box"><MapPinIcon /></div>
                      <div className="hero-meta-card-content">
                        <strong className="meta-item-label">สถานที่จัดงาน</strong>
                        <p className="meta-item-value">{location || 'สถานที่จัดงาน'}</p>
                      </div>
                    </div>

                    <div className="hero-meta-card">
                      <div className="meta-icon-box"><CalendarIcon /></div>
                      <div className="hero-meta-card-content">
                        <strong className="meta-item-label">กำหนดการแสดง</strong>
                        <p className="meta-item-value">
                          <span className="text-nowrap">
                            {sessions[0]?.startTime ? formatDate(new Date(sessions[0].startTime)) : 'ยังไม่ได้ระบุวัน'}
                          </span>
                          {' '}<span className="text-nowrap">(ทั้งหมด {sessions.length} รอบการแสดง)</span>
                        </p>
                      </div>
                    </div>

                    <div className="hero-meta-card">
                      <div className="meta-icon-box"><ClockIcon /></div>
                      <div className="hero-meta-card-content">
                        <strong className="meta-item-label">เวลาแสดงและประตูเปิด</strong>
                        <p className="meta-item-value">
                          {sessions[0]?.startTime ? (
                            <>
                              <span className="text-nowrap">
                                {formatTime(new Date(sessions[0].startTime))} – {formatTime(new Date(sessions[0].endTime))} น.
                              </span>
                              {sessions[0]?.admissionStartTime && (
                                <>
                                  {' '}
                                  <span className="text-nowrap">
                                    (ประตูเปิด {formatTime(new Date(sessions[0].admissionStartTime))} น.)
                                  </span>
                                </>
                              )}
                            </>
                          ) : (
                            '19:00 – 22:00 น.'
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="hero-meta-card">
                      <div className="meta-icon-box"><ShieldCheckIcon /></div>
                      <div className="hero-meta-card-content">
                        <strong className="meta-item-label">สิทธิ์และเงื่อนไขการจอง</strong>
                        <p className="meta-item-value">
                          <span className="text-nowrap">
                            จำกัดสูงสุดไม่เกิน {limitPerOrder === 99 ? 'ไม่จำกัดจำนวน' : `${limitPerOrder} ใบ`} / คำสั่งซื้อ
                          </span>
                          {' · '}
                          <span className="text-nowrap">ไม่ต้องสมัครสมาชิก</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </header>

                {/* 3. Categorized Details */}
                <div className="event-categories-list" style={{ marginTop: '1.25rem' }}>
                  {/* Category 1: Lineup & Details */}
                  <section className="event-category-card" aria-labelledby="cat-lineup-title">
                    <div className="category-header-wrap">
                      <h2 id="cat-lineup-title" className="category-heading">
                        <UsersIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
                        รายละเอียดคอนเสิร์ตและไลน์อัปศิลปิน (Lineup & Details)
                      </h2>
                    </div>

                    <div className="category-body-content">
                      <div className="detail-with-poster-layout">
                        {/* Vertical Poster 4:5 */}
                        <div className="detail-poster-card-col">
                          <div style={{ aspectRatio: '4/5', background: '#0f172a', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {posterPreviewUrl ? (
                              /* biome-ignore lint/performance/noImgElement: simulated customer view */
                              <img src={posterPreviewUrl} alt="โปสเตอร์คอนเสิร์ต" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '1rem' }}>
                                <TicketIcon />
                                <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.5rem' }}>OFFICIAL POSTER</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Lineup & Description */}
                        <div className="detail-info-col">
                          <div className="artist-lineup-section">
                            <h3 className="category-sub-heading" style={{ marginTop: 0 }}>
                              ศิลปินผู้ร่วมสร้างสรรค์การแสดง (Lineup)
                            </h3>
                            <div className="artist-grid-2x2">
                              {(artists || 'THE NEON BAND, ELECTRIC DREAMS').split(',').map((a, i) => {
                                const artistName = a.trim();
                                return (
                                  <div key={artistName || `artist-${i}`} className={`artist-card-item ${i === 0 ? 'primary-artist' : ''}`}>
                                    <span className={`artist-role-badge ${i === 0 ? '' : 'guest-badge'}`}>
                                      {i === 0 ? 'ศิลปินหลัก' : 'ศิลปินรับเชิญ'}
                                    </span>
                                    <strong className="artist-name">{artistName}</strong>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="event-description-section" style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--line)' }}>
                            <h3 className="category-sub-heading" style={{ marginTop: 0 }}>
                              เกี่ยวกับคอนเสิร์ตนี้
                            </h3>
                            <p className="description-text" style={{ whiteSpace: 'pre-line', color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
                              {description || 'เตรียมพบกับปรากฏการณ์ดนตรีสดเต็มรูปแบบ เต็มอิ่มกับระบบเสียงและแสงสีเสียงระดับเวิลด์คลาส'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Category 2: Sessions & Ticket Categories */}
                  <section className="event-category-card" aria-labelledby="cat-sessions-title" style={{ marginTop: '1.25rem' }}>
                    <div className="category-header-wrap">
                      <h2 id="cat-sessions-title" className="category-heading">
                        <CalendarIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
                        รอบการแสดงและประเภทบัตร (Sessions & Ticket Categories)
                      </h2>
                    </div>

                    <div className="category-body-content">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {sessions.map((sess, idx) => (
                          <div key={sess.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', background: '#ffffff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                              <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                                รอบที่ {idx + 1}: {sess.startTime ? formatDate(new Date(sess.startTime)) : 'ยังไม่ได้ระบุวัน'}
                              </strong>
                              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                {sess.startTime ? `${formatTime(new Date(sess.startTime))} – ${formatTime(new Date(sess.endTime))} น.` : '19:00 – 22:00 น.'}
                              </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                              {sess.ticketTypes.map(tt => (
                                <div key={tt.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <strong style={{ display: 'block', fontSize: '0.85rem', color: '#0f172a' }}>{tt.name || 'Zone'}</strong>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>โควตา {tt.quota || 0} ใบ</span>
                                  </div>
                                  <strong style={{ fontSize: '0.95rem', color: '#16a34a' }}>
                                    {formatBaht(Number(tt.price) || 0)}
                                  </strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Category 3: Venue & Map */}
                  <section className="event-category-card" aria-labelledby="cat-venue-title" style={{ marginTop: '1.25rem' }}>
                    <div className="category-header-wrap">
                      <div className="venue-heading-split">
                        <h2 id="cat-venue-title" className="category-heading">
                          <MapPinIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
                          สถานที่จัดงานและแผนที่การเดินทาง (Venue & Map)
                        </h2>
                      </div>
                    </div>

                    <div className="category-body-content">
                      <p className="venue-address-text" style={{ marginBottom: '0.75rem' }}>
                        <strong>สถานที่:</strong> {location || 'สถานที่จัดงาน'}
                      </p>
                      {(location.trim() || googleMapsUrl.trim()) && (
                        <div className="google-map-embed-wrapper">
                          <iframe
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(location.trim() || googleMapsUrl.trim())}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                            width="100%"
                            height="240"
                            style={{ border: 0, borderRadius: '10px' }}
                            loading="lazy"
                            title={`แผนที่ ${location || 'สถานที่จัดงาน'}`}
                          />
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* 4. Single Sticky Bottom Simulation Bar */}
                <aside className="event-sticky-bottom-bar" aria-label="แถบดำเนินการซื้อบัตร" style={{ position: 'relative', marginTop: '1.5rem', borderRadius: '12px' }}>
                  <div className="event-sticky-bottom-inner">
                    <div className="sticky-bar-info">
                      <span className="sticky-bar-title">{title || 'ชื่องานคอนเสิร์ต'}</span>
                      <span className="sticky-bar-meta">
                        {previewStartingPrice > 0 ? `เริ่มต้น ${formatBaht(previewStartingPrice)}` : '฿1,500.00'} · จำกัด {limitPerOrder === 99 ? 'ไม่จำกัดจำนวน' : `${limitPerOrder} ใบ`}/คำสั่งซื้อ
                      </span>
                    </div>
                    <div className="sticky-bar-cta-wrap">
                      <span className="primary-button sticky-bar-buy-btn" style={{ opacity: 0.9 }}>
                        ซื้อบัตร
                      </span>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Events List / Cards (D-109, Q-115) */}
      {loading ? (
        <p className="loading-text">กำลังโหลดรายการงาน...</p>
      ) : filteredEvents.length === 0 ? (
        <div className="events-empty-box">
          <div className="events-empty-icon-wrap">
            <TicketIcon />
          </div>
          <h3 className="events-empty-title">
            {events.length === 0 ? 'ยังไม่มีงานคอนเสิร์ตที่สร้าง' : 'ไม่พบงานคอนเสิร์ตที่ตรงกับตัวกรอง'}
          </h3>
          <p className="events-empty-desc">
            {events.length === 0 ? 'เริ่มต้นสร้างคอนเสิร์ตแรกของคุณเพื่อเปิดจำหน่ายบัตร' : 'ลองเปลี่ยนคำค้นหา หรือเลือกแท็บสถานะทั้งหมด'}
          </p>
          {events.length === 0 ? (
            <button
              type="button"
              className="events-create-btn"
              onClick={() => {
                setShowForm(true);
                setWizardStep(1);
              }}
            >
              + สร้างงานคอนเสิร์ตแรก
            </button>
          ) : (
            <button
              type="button"
              className="btn-form-cancel"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      ) : (
        <div className="events-cards-list">
          {filteredEvents.map(ev => (
            <div key={ev.id} id={`organizer-event-card-${ev.id}`} className={`event-card events-editorial-card ${pulsingEventId === ev.id ? 'soft-pulse-highlight' : ''}`}>
              {/* Body (Clean No-Thumbnail Layout - D-110) */}
              <div className="events-card-body">
                <div className="events-card-badges-row">
                  <span className={`events-card-status-text status-${ev.status}`}>
                    สถานะ: {
                      ev.status === 'approved' ? 'อนุมัติแล้ว' :
                      ev.status === 'pending_approval' ? 'รออนุมัติ' :
                      ev.status === 'draft' ? 'ฉบับร่าง' :
                      ev.status === 'cancelled' ? 'ยกเลิกแล้ว' :
                      ev.status
                    }
                  </span>
                  {ev.createdAt && (
                    <span className="events-card-timestamp" style={{ fontSize: '0.75rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <ClockIcon width={12} height={12} />
                      <span>{formatDate(new Date(ev.createdAt))}</span>
                    </span>
                  )}
                </div>

                <h3 className="events-card-title">{ev.title}</h3>

                <p className="events-card-location">
                  <MapPinIcon width={14} height={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  สถานที่: {ev.location}
                </p>

                <div className="events-card-metrics-row">
                  <div className="events-card-metric-item">
                    <span>รอบการแสดง:</span>
                    <strong>{ev.sessionCount || 1} รอบ</strong>
                  </div>
                  <div className="events-card-metric-item">
                    <span>ราคาเริ่มต้น:</span>
                    <strong className="price-highlight">
                      {ev.minPrice ? formatBaht(Number(ev.minPrice)) : '฿1,500'}
                    </strong>
                  </div>
                  <div className="events-card-metric-item">
                    <span>โควตารวม:</span>
                    <strong>{ev.totalQuota ? `${Number(ev.totalQuota).toLocaleString()} ใบ` : 'ไม่ระบุ'}</strong>
                  </div>
                </div>
              </div>

              {/* Actions (Right Column) (D-199, D-200: Removed preview, added revert to draft & delete) */}
              <div className="events-card-actions-col">
                {ev.status === 'draft' && (
                  <>
                    <button
                      type="button"
                      className="events-action-btn btn-amendment"
                      onClick={() => handleEditDraft(ev.id)}
                      title="แก้ไขข้อมูลคอนเสิร์ตฉบับร่าง"
                      data-testid={`edit-draft-btn-${ev.id}`}
                    >
                      <PencilSquareIcon width={14} height={14} />
                      <span>แก้ไขข้อมูล</span>
                    </button>

                    <button
                      type="button"
                      className="events-action-btn btn-submit"
                      onClick={() => handleSubmitSessionForApproval(ev.id)}
                      title="ส่งงานคอนเสิร์ตนี้ให้เจ้าหน้าที่ตรวจสอบเพื่ออนุมัติ"
                      data-testid={`submit-draft-btn-${ev.id}`}
                    >
                      <ShieldCheckIcon width={14} height={14} />
                      <span>ส่งขออนุมัติ</span>
                    </button>

                    <button
                      type="button"
                      className="events-action-btn btn-cancel"
                      onClick={() => setDeletingEvent(ev)}
                      title="ลบงานคอนเสิร์ตฉบับร่างนี้"
                      data-testid={`delete-event-btn-${ev.id}`}
                    >
                      <TrashIcon width={14} height={14} />
                      <span>ลบ</span>
                    </button>
                  </>
                )}

                {(ev.status === 'pending_approval' || ev.status === 'submitted') && (
                  <>
                    <button
                      type="button"
                      className="events-action-btn btn-amendment"
                      onClick={() => handleRevertToDraft(ev.id)}
                      title="ดึงงานคอนเสิร์ตกลับมาเป็นฉบับร่างเพื่อแก้ไขข้อมูลใหม่"
                      data-testid={`revert-draft-btn-${ev.id}`}
                    >
                      <ChevronLeftIcon width={14} height={14} />
                      <span>ดึงกลับเป็นฉบับร่าง</span>
                    </button>

                    <button
                      type="button"
                      className="events-action-btn btn-cancel"
                      onClick={() => setDeletingEvent(ev)}
                      title="ลบงานคอนเสิร์ตที่รออนุมัตินี้"
                      data-testid={`delete-event-btn-${ev.id}`}
                    >
                      <TrashIcon width={14} height={14} />
                      <span>ลบ</span>
                    </button>
                  </>
                )}

                {ev.status === 'approved' && (
                  <>
                    <Link
                      href={`/events/${ev.id}`}
                      target="_blank"
                      className="events-action-btn btn-storefront"
                      title="เปิดดูหน้าคอนเสิร์ตแบบที่ลูกค้าเห็น"
                      data-testid={`storefront-btn-${ev.id}`}
                    >
                      <EyeIcon width={14} height={14} />
                      <span>หน้าร้านลูกค้า</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setSelectedReportEventId(selectedReportEventId === ev.id ? null : ev.id)}
                      data-testid={`open-money-report-btn-${ev.id}`}
                      className="events-action-btn btn-finance"
                    >
                      <BanknotesIcon width={14} height={14} />
                      <span>รายงานการเงิน</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenCancellation(ev.id)}
                      data-testid={`open-cancellation-btn-${ev.id}`}
                      className="events-action-btn btn-cancel"
                    >
                      <AlertIcon />
                      <span>ขอยกเลิก</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Event Confirmation Modal (D-200 Item 3) */}
      {deletingEvent && (
        <div
          className="organizer-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-event-dialog-title"
        >
          <div className="delete-confirm-dialog">
            <div className="delete-confirm-header">
              <div className="delete-confirm-icon-wrap">
                <TrashIcon width={20} height={20} />
              </div>
              <div>
                <h3 id="delete-event-dialog-title" className="delete-confirm-title">
                  ยืนยันการลบงานคอนเสิร์ต
                </h3>
                <p className="delete-confirm-desc">
                  คุณแน่ใจหรือไม่ว่าต้องการลบงานคอนเสิร์ตนี้? ข้อมูลรายละเอียด รอบการแสดง และประเภทบัตรทั้งหมดจะถูกลบถาวรและไม่สามารถกู้คืนได้
                </p>
              </div>
            </div>

            <div className="delete-confirm-event-box">
              {deletingEvent.title}
            </div>

            <div className="delete-confirm-actions">
              <button
                type="button"
                className="btn-form-cancel"
                onClick={() => setDeletingEvent(null)}
                disabled={deleteSubmitting}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn-danger-modal"
                onClick={handleConfirmDeleteEvent}
                disabled={deleteSubmitting}
                data-testid="confirm-delete-event-btn"
              >
                {deleteSubmitting ? 'กำลังลบ...' : 'ยืนยันลบงานคอนเสิร์ต'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Financial Report Dedicated Pop-up Modal (D-197) */}
      {selectedReportEventId && (
        <div
          className="organizer-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finance-modal-title"
        >
          <div className="organizer-modal-dialog finance-report-modal-dialog">
            <OrganizerMoneyReportView
              eventId={selectedReportEventId}
              onClose={() => setSelectedReportEventId(null)}
            />
          </div>
        </div>
      )}

      {/* 6. Modern Floating Amendment Form Modal (AC-34, AC-38, G-13, D-197) */}
      {activeEventDetails && (
        <div className="organizer-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="amendment-modal-title">
          <div className="organizer-modal-dialog amendment-modal-dialog">
            <div className="organizer-modal-header">
              <div className="modal-title-group">
                <ClockIcon width={20} height={20} style={{ color: 'var(--blue)' }} />
                <h3 id="amendment-modal-title" className="modal-title">
                  ขอแก้ไขรอบการแสดง: {activeEventDetails.title}
                </h3>
              </div>
              <button
                type="button"
                className="organizer-modal-close-btn"
                onClick={() => setActiveEventDetails(null)}
                aria-label="ปิดหน้าต่าง"
                title="ปิด"
              >
                <XIcon width={16} height={16} />
              </button>
            </div>

            <div className="modal-info-banner">
              <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5, color: '#1e3a8a' }}>
                สามารถยื่นขอแก้ไขวันเวลาการแสดง ราคาบัตร หรือโควตาบัตรได้ ข้อมูลเดิมจะยังคงเปิดขายตามปกติจนกว่าผู้ดูแลระบบ (Admin) จะอนุมัติคำขอ เพื่อรักษาความถูกต้องของคำสั่งซื้อที่จำหน่ายไปแล้ว
              </p>
            </div>

            {amendmentFeedback && (
              <div
                style={{
                  backgroundColor: amendmentFeedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${amendmentFeedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                  borderRadius: '6px',
                  padding: '10px 14px',
                  marginBottom: '1rem',
                  color: amendmentFeedback.type === 'success' ? '#166534' : '#991b1b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                }}
              >
                {amendmentFeedback.type === 'success' ? <CheckCircleIcon /> : <AlertIcon />}
                <span>{amendmentFeedback.message}</span>
              </div>
            )}

            {loadingDetails ? (
              <p style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>กำลังโหลดข้อมูล...</p>
            ) : (
              <form onSubmit={handleSubmitAmendment}>
                {activeEventDetails.sessions.length > 1 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label htmlFor="amendment-session-select" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.4rem' }}>
                      เลือกรอบการแสดง
                    </label>
                    <select
                      id="amendment-session-select"
                      value={selectedSessionId || ''}
                      onChange={e => handleSelectSession(e.target.value)}
                      className="form-input-text"
                      style={{ width: '100%', fontSize: '0.88rem' }}
                    >
                      {activeEventDetails.sessions.map((s, idx) => (
                        <option key={s.id} value={s.id}>
                          รอบที่ {idx + 1}: {new Date(s.startTime).toLocaleString('th-TH')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Reschedule Session Section (AC-38, AC-108, G-13) */}
                <div className="modal-form-section-card">
                  <h4 className="modal-section-title">
                    ขอเลื่อนวันเวลาการแสดง (Reschedule Session):
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 0.85rem' }}>
                    * กำหนดการแสดงเดิมจะยังคงมีผลจนกว่าผู้ดูแลระบบ (Owner) จะอนุมัติคำขอเลื่อนรอบ
                  </p>
                  <div className="form-grid-two">
                    <div>
                      <label htmlFor="amendment-start-time" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>
                        วันเวลาเริ่มการแสดงใหม่
                      </label>
                      <input
                        id="amendment-start-time"
                        data-testid="amendment-start-time"
                        type="datetime-local"
                        value={amendmentStartTime}
                        onChange={e => setAmendmentStartTime(e.target.value)}
                        className="modal-textarea"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="amendment-end-time" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>
                        วันเวลาสิ้นสุดการแสดงใหม่
                      </label>
                      <input
                        id="amendment-end-time"
                        data-testid="amendment-end-time"
                        type="datetime-local"
                        value={amendmentEndTime}
                        onChange={e => setAmendmentEndTime(e.target.value)}
                        className="modal-textarea"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Ticket Types Prices & Quotas Section */}
                <div className="modal-form-section-card">
                  <h4 className="modal-section-title">
                    ปรับปรุงราคาและโควตาประเภทบัตร:
                  </h4>

                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {amendmentTicketTypes.map((tt, idx) => (
                      <div
                        key={tt.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 130px 130px',
                          gap: '0.65rem',
                          alignItems: 'center',
                          backgroundColor: '#ffffff',
                          padding: '0.65rem 0.85rem',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>{tt.name}</span>
                        </div>
                        <div>
                          <label htmlFor={`tt-price-${idx}`} style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginBottom: '0.2rem' }}>
                            ราคา (บาท)
                          </label>
                          <input
                            id={`tt-price-${idx}`}
                            data-testid={`amendment-price-${tt.id}`}
                            type="number"
                            min={0}
                            value={tt.price}
                            onChange={e => {
                              const val = Number(e.target.value);
                              setAmendmentTicketTypes(prev =>
                                prev.map((item, i) => (i === idx ? { ...item, price: val } : item)),
                              );
                            }}
                            className="modal-textarea"
                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                          />
                        </div>
                        <div>
                          <label htmlFor={`tt-quota-${idx}`} style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginBottom: '0.2rem' }}>
                            โควตา (ใบ)
                          </label>
                          <input
                            id={`tt-quota-${idx}`}
                            data-testid={`amendment-quota-${tt.id}`}
                            type="number"
                            min={1}
                            value={tt.quota}
                            onChange={e => {
                              const val = Number(e.target.value);
                              setAmendmentTicketTypes(prev =>
                                prev.map((item, i) => (i === idx ? { ...item, quota: val } : item)),
                              );
                            }}
                            className="modal-textarea"
                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem', marginBottom: 0 }}>
                    * โควตาใหม่ต้องไม่ต่ำกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้วในรอบนี้ (AC-109)
                  </p>
                </div>

                <div className="organizer-modal-actions">
                  <button
                    type="button"
                    className="btn-cancel-modal"
                    onClick={() => setActiveEventDetails(null)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={amendmentSubmitting}
                    data-testid="submit-amendment-btn"
                    className="btn-submit-modal"
                  >
                    <ClockIcon width={16} height={16} />
                    <span>{amendmentSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอแก้ไขรอบ'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 7. Modern Floating Cancellation Form Modal (AC-35, AC-108, D-197) */}
      {cancelEventDetails && (
        <div className="organizer-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancellation-modal-title">
          <div
            id="cancellation-form-section"
            data-testid="cancellation-form-section"
            className="organizer-modal-dialog cancellation-modal-dialog"
          >
            <div className="organizer-modal-header">
              <div className="modal-title-group">
                <AlertIcon />
                <h3 id="cancellation-modal-title" className="modal-title modal-title-danger">
                  ขอยกเลิกรอบการแสดง: {cancelEventDetails.title}
                </h3>
              </div>
              <button
                type="button"
                className="organizer-modal-close-btn"
                onClick={() => setCancelEventDetails(null)}
                aria-label="ปิดหน้าต่าง"
                title="ปิด"
              >
                <XIcon width={16} height={16} />
              </button>
            </div>

            {/* 4-Bullet Impact Card without technical jargon (D-199 Item 12) */}
            <div className="cancellation-impact-card">
              <h4 className="cancellation-impact-title">
                <AlertIcon />
                <span>ผลกระทบเมื่อคำขอยกเลิกรอบการแสดงได้รับการอนุมัติ:</span>
              </h4>
              <ul className="cancellation-impact-list">
                <li>ระบบจะหยุดการจำหน่ายบัตรของรอบการแสดงนี้โดยทันที</li>
                <li>ส่งอีเมลแจ้งเตือนการยกเลิกให้แก่ลูกค้าผู้ซื้อบัตรทุกคนโดยอัตโนมัติ</li>
                <li>ดำเนินการคืนเงินเต็มจำนวน (100%) ให้แก่ผู้ซื้อทุกคำสั่งซื้อผ่านระบบการเงิน</li>
                <li>รอบการแสดงที่ถูกยกเลิกแล้วจะไม่สามารถเปิดจำหน่ายซ้ำได้อีก</li>
              </ul>
            </div>

            {cancelFeedback && (
              <div
                data-testid="cancel-feedback-message"
                style={{
                  backgroundColor: cancelFeedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${cancelFeedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                  borderRadius: '6px',
                  padding: '10px 14px',
                  marginBottom: '1rem',
                  color: cancelFeedback.type === 'success' ? '#166534' : '#991b1b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                }}
              >
                {cancelFeedback.type === 'success' ? <CheckCircleIcon /> : <AlertIcon />}
                <span>{cancelFeedback.message}</span>
              </div>
            )}

            {loadingCancelDetails ? (
              <p style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>กำลังโหลดข้อมูล...</p>
            ) : (
              <form onSubmit={handleSubmitCancellation}>
                {cancelEventDetails.sessions.length > 1 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label htmlFor="cancel-session-select" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.4rem' }}>
                      เลือกรอบการแสดงที่ต้องการยกเลิก
                    </label>
                    <select
                      id="cancel-session-select"
                      data-testid="cancel-session-select"
                      value={selectedCancelSessionId || ''}
                      onChange={e => setSelectedCancelSessionId(e.target.value)}
                      className="form-input-text"
                      style={{ width: '100%', fontSize: '0.88rem' }}
                    >
                      {cancelEventDetails.sessions.map((s, idx) => (
                        <option key={s.id} value={s.id}>
                          รอบที่ {idx + 1}: {new Date(s.startTime).toLocaleString('th-TH')} ({s.status})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ marginBottom: '1.25rem' }}>
                  <label htmlFor="cancellation-reason" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.4rem' }}>
                    เหตุผลในการขอยกเลิกรอบการแสดง *
                  </label>
                  <textarea
                    id="cancellation-reason"
                    data-testid="cancellation-reason-input"
                    rows={4}
                    value={cancellationReason}
                    onChange={e => setCancellationReason(e.target.value)}
                    placeholder="ระบุเหตุผล เช่น ศิลปินติดภารกิจด่วน, ปัญหาทางเทคนิคของสถานที่, สภาพอากาศ หรือเหตุสุดวิสัย..."
                    required
                    className="modal-textarea"
                  />
                </div>

                <div className="organizer-modal-actions">
                  <button
                    type="button"
                    className="btn-cancel-modal"
                    onClick={() => setCancelEventDetails(null)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={cancelSubmitting}
                    data-testid="submit-cancel-session-btn"
                    className="btn-danger-modal"
                  >
                    <AlertIcon />
                    <span>{cancelSubmitting ? 'กำลังส่งคำขอ...' : 'ยืนยันส่งคำขอยกเลิกรอบการแสดง'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
