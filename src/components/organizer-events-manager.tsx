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
  XIcon,
} from './icons';
import { TicketIcon } from './ticket-icon';
import { AlertIcon } from './alert-icon';
import { OrganizerMoneyReportView } from './organizer-money-report-view';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';

interface TicketTypeDraft {
  id: string;
  name: string;
  price: number;
  quota: number;
  description: string;
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
}

export function OrganizerEventsManager({
  initialOpenCreate = false,
  onCloseCreate,
}: OrganizerEventsManagerProps = {}) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(initialOpenCreate);

  const handleCloseModal = () => {
    setShowForm(false);
    onCloseCreate?.();
  };
  const [showPreview, setShowPreview] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Search & Status filter state (D-108)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'pending_approval' | 'approved' | 'cancelled'>('all');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [artists, setArtists] = useState('THE NEON BAND, ELECTRIC DREAMS, SPECIAL GUEST DJ');
  const [location, setLocation] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [limitPerOrder, setLimitPerOrder] = useState(4);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [ticketTemplateFile, setTicketTemplateFile] = useState<File | null>(null);
  const [ticketTemplatePreviewUrl, setTicketTemplatePreviewUrl] = useState<string | null>(null);

  // Default rich sessions with zones
  const [sessions, setSessions] = useState<SessionDraft[]>([
    {
      id: 'sess-1',
      startTime: '2026-11-01T18:00',
      endTime: '2026-11-01T21:00',
      admissionStartTime: '2026-11-01T16:30',
      admissionEndTime: '2026-11-01T19:00',
      ticketTypes: [
        { id: 'tt-1', name: 'VIP Zone (บัตรนั่งพิเศษ)', price: 3500, quota: 50, description: 'บัตรนั่งโซนหน้าเวที พร้อมของที่ระลึกพิเศษ' },
        { id: 'tt-2', name: 'บัตรยืนทั่วไป (Standing)', price: 1500, quota: 200, description: 'บัตรยืนรอบเวที เข้าชมการแสดงสด' },
      ],
    },
  ]);

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
    const nextIdx = sessions.length + 1;
    const newSession: SessionDraft = {
      id: `sess-${Date.now()}`,
      startTime: `2026-11-0${Math.min(nextIdx, 9)}T18:00`,
      endTime: `2026-11-0${Math.min(nextIdx, 9)}T21:00`,
      admissionStartTime: `2026-11-0${Math.min(nextIdx, 9)}T16:30`,
      admissionEndTime: `2026-11-0${Math.min(nextIdx, 9)}T19:00`,
      ticketTypes: [
        { id: `tt-${Date.now()}-1`, name: 'VIP Zone (บัตรนั่งพิเศษ)', price: 3500, quota: 50, description: 'บัตรนั่งโซนหน้าเวที' },
        { id: `tt-${Date.now()}-2`, name: 'บัตรยืนทั่วไป (Standing)', price: 1500, quota: 200, description: 'บัตรยืนรอบเวที' },
      ],
    };
    setSessions(prev => [...prev, newSession]);
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
            { id: `tt-${Date.now()}`, name: 'โซนบัตรใหม่', price: 1800, quota: 100, description: '' },
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

  // Submit event draft or submit directly for approval
  async function handleCreateEvent(e?: React.FormEvent, submitImmediately = false) {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');
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
      })),
    }));

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          location,
          limitPerOrder,
          posterUrl,
          ticketTemplateUrl,
          sessions: formattedSessions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'บันทึกงานไม่สำเร็จ');
        setSubmitting(false);
        return;
      }

      const createdEvent = data.event;

      // If user selected "Submit for Approval Immediately" (Q-113)
      if (submitImmediately && createdEvent?.sessions?.length > 0) {
        for (const sess of createdEvent.sessions) {
          await fetch(`/api/events/${createdEvent.id}?action=submit-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sess.id }),
          });
        }
        setSuccess('บันทึกงานคอนเสิร์ตสำเร็จ และส่งขออนุมัติเรียบร้อยแล้ว (รอเจ้าของเว็บอนุมัติ)');
      } else {
        setSuccess('บันทึกงานคอนเสิร์ตสำเร็จ (ฉบับร่าง Draft)');
      }

      handleCloseModal();
      setShowPreview(false);
      setWizardStep(1);
      setTitle('');
      setDescription('');
      setLocation('');
      setPosterFile(null);
      setPosterPreviewUrl(null);
      setTicketTemplateFile(null);
      setTicketTemplatePreviewUrl(null);
      await loadEvents();
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('events-updated'));
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSubmitting(false);
    }
  }

  // Submit existing session for approval directly from card
  async function handleSubmitSessionForApproval(eventId: string) {
    setError('');
    setSuccess('');
    try {
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
        setSuccess('ส่งรอบการแสดงเพื่อขออนุมัติเรียบร้อยแล้ว');
        await loadEvents();
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการส่งขออนุมัติ');
    }
  }

  // Open amendment modal
  async function handleOpenAmendment(eventId: string) {
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
        `/api/events/${activeEventDetails.id}/sessions/${selectedSessionId}/amendment`,
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
        `/api/events/${cancelEventDetails.id}/sessions/${selectedCancelSessionId}/cancel`,
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
          message: data.message || 'ยื่นคำขอยกเลิกรอบการแสดงเรียบร้อยแล้ว รอการอนุมัติจากผู้ดูแลระบบ (AC-108)',
        });
        setCancellationReason('');
      }
    } catch {
      setCancelFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setCancelSubmitting(false);
    }
  }

  // Filter & Search events
  const filteredEvents = events.filter(ev => {
    const matchesSearch =
      !searchQuery.trim() ||
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      ev.status === statusFilter ||
      (statusFilter === 'pending_approval' && (ev.status === 'pending_approval' || ev.status === 'submitted'));

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="events-management-container">
      {/* 1. Header with Title & Create Button (D-109) */}
      <header className="events-management-header">
        <div className="events-management-title-wrap">
          <h1 className="events-management-title">งานคอนเสิร์ตของคุณ</h1>
          <p className="events-management-desc">
            สร้างฉบับร่าง จัดการรอบการแสดง ขอแก้ไขราคา หรือตรวจสอบรายงานการเงินแยกรายคอนเสิร์ต
          </p>
        </div>
        <button
          type="button"
          className="events-create-btn"
          onClick={() => {
            setShowForm(true);
            setWizardStep(1);
          }}
          data-testid="open-create-concert-btn"
        >
          <PlusIcon width={16} height={16} />
          <span>+ สร้างงานคอนเสิร์ตใหม่</span>
        </button>
      </header>

      {error && <p className="form-error status-banner error" role="alert">{error}</p>}
      {success && <p className="form-success status-banner success" role="status">{success}</p>}

      {/* 2. Status Filter Tabs & Search Bar (D-109: Clean without outer card) */}
      <div className="events-filter-bar">
        <nav className="events-status-tabs" aria-label="ตัวกรองสถานะคอนเสิร์ต">
          <button
            type="button"
            className={`events-status-tab ${statusFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            <span>ทั้งหมด</span>
            <span className="events-tab-count">{events.length}</span>
          </button>
          <button
            type="button"
            className={`events-status-tab ${statusFilter === 'draft' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('draft')}
          >
            <span>ฉบับร่าง</span>
            <span className="events-tab-count">{events.filter(e => e.status === 'draft').length}</span>
          </button>
          <button
            type="button"
            className={`events-status-tab ${statusFilter === 'pending_approval' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('pending_approval')}
          >
            <span>รออนุมัติ</span>
            <span className="events-tab-count">{events.filter(e => e.status === 'pending_approval' || e.status === 'submitted').length}</span>
          </button>
          <button
            type="button"
            className={`events-status-tab ${statusFilter === 'approved' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('approved')}
          >
            <span>อนุมัติแล้ว</span>
            <span className="events-tab-count">{events.filter(e => e.status === 'approved').length}</span>
          </button>
        </nav>

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
      </div>

      {/* 3. 4-Step Multi-Step Wizard Modal (D-109, Q-116) */}
      {showForm && (
        <div className="events-editor-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-concert-title">
          <button
            type="button"
            className="editor-modal-backdrop-btn"
            onClick={handleCloseModal}
            aria-label="ปิดหน้าต่างสร้างคอนเสิร์ต"
            tabIndex={-1}
          />
          <form
            onSubmit={e => handleCreateEvent(e, false)}
            className="events-editor-modal-card"
          >
            {/* Modal Header */}
            <div className="editor-modal-header">
              <div className="editor-modal-title-wrap">
                <h2 id="create-concert-title" className="editor-modal-title">
                  สร้างงานคอนเสิร์ตใหม่
                </h2>
                <p className="editor-modal-subtitle">
                  ขั้นตอนที่ {wizardStep} จาก 4: {
                    wizardStep === 1 ? 'ข้อมูลงาน & สื่อ' :
                    wizardStep === 2 ? 'ศิลปิน & เงื่อนไข' :
                    wizardStep === 3 ? 'รอบการแสดง & เวลาประตูเปิด' :
                    'โซนที่นั่งและราคาบัตร'
                  }
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

            <div className="editor-modal-body">
                {/* Wizard Step Progress Indicator */}
                <div className="events-step-tabs-bar">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className={`events-step-tab-btn ${wizardStep === 1 ? 'active' : ''}`}
                  >
                    1. ข้อมูลงาน & สื่อ
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className={`events-step-tab-btn ${wizardStep === 2 ? 'active' : ''}`}
                  >
                    2. ศิลปิน & เงื่อนไข
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(3)}
                    className={`events-step-tab-btn ${wizardStep === 3 ? 'active' : ''}`}
                  >
                    3. รอบการแสดง
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(4)}
                    className={`events-step-tab-btn ${wizardStep === 4 ? 'active' : ''}`}
                  >
                    4. โซนและราคาบัตร
                  </button>
                </div>

                {/* STEP 1: ข้อมูลงาน & สื่อ */}
                {wizardStep === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                      <label htmlFor="event-title" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                        ชื่องานคอนเสิร์ต *
                      </label>
                      <input
                        id="event-title"
                        type="text"
                        required
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="เช่น ACOUSTIC ECHOES IN THE HALL 2026"
                        className="form-input-text"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="event-location" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                        สถานที่จัดงาน *
                      </label>
                      <input
                        id="event-location"
                        type="text"
                        required
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        placeholder="เช่น อิมแพ็ค อารีน่า เมืองทองธานี"
                        className="form-input-text"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="event-description" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                        รายละเอียดคอนเสิร์ตและจุดเด่น (เป็นข้อย่อย ๆ หรือย่อหน้า)
                      </label>
                      <textarea
                        id="event-description"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="• ระบบเสียงระดับสเตอริโอรอบทิศทาง&#10;• เต็มอิ่มกับการแสดงสดกว่า 3 ชั่วโมงเต็ม&#10;• สิทธิพิเศษสำหรับผู้ถือบัตรทุกโซน"
                        rows={4}
                        className="form-textarea-control"
                      />
                    </div>

                    <div className="form-row-two-col">
                      <div className="form-group">
                        <label htmlFor="event-poster" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                          โปสเตอร์งานคอนเสิร์ต
                        </label>
                        <input
                          id="event-poster"
                          type="file"
                          accept="image/*"
                          onChange={e => handlePosterChange(e.target.files?.[0] || null)}
                          style={{ width: '100%', fontSize: '0.85rem' }}
                        />
                        {posterPreviewUrl && (
                          <div style={{ marginTop: '0.5rem', width: '100%', height: '90px', borderRadius: '8px', overflow: 'hidden', background: '#0f172a' }}>
                            {/* biome-ignore lint/performance/noImgElement: local file preview */}
                            <img src={posterPreviewUrl} alt="ตัวอย่างโปสเตอร์" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label htmlFor="event-ticket-template" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                          ภาพพื้นหลังบัตรดิจิทัล (1200 x 500 px)
                        </label>
                        <input
                          id="event-ticket-template"
                          type="file"
                          accept="image/*"
                          onChange={e => handleTemplateChange(e.target.files?.[0] || null)}
                          style={{ width: '100%', fontSize: '0.85rem' }}
                        />
                        {ticketTemplatePreviewUrl && (
                          <div style={{ marginTop: '0.5rem', width: '100%', height: '90px', borderRadius: '8px', overflow: 'hidden', background: '#0f172a' }}>
                            {/* biome-ignore lint/performance/noImgElement: local template preview */}
                            <img src={ticketTemplatePreviewUrl} alt="ตัวอย่างภาพพื้นหลังบัตร" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: ศิลปิน & เงื่อนไข */}
                {wizardStep === 2 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                      <label htmlFor="event-artists" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                        ศิลปินผู้ร่วมสร้างสรรค์ / ไลน์อัปการแสดง
                      </label>
                      <input
                        id="event-artists"
                        type="text"
                        value={artists}
                        onChange={e => setArtists(e.target.value)}
                        placeholder="ระบุชื่อศิลปิน คั่นด้วยจุลภาค เช่น THE NEON BAND, ELECTRIC DREAMS"
                        className="form-input-text"
                      />
                      <small className="form-field-helper">
                        * ศิลปินจะถูกจัดแสดงเป็นป้ายแท็ก Lineup สวยงามในหน้าคอนเสิร์ตสำหรับลูกค้า
                      </small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="event-map-link" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                        ลิงก์แผนที่ Google Maps (ทางเลือก)
                      </label>
                      <input
                        id="event-map-link"
                        type="url"
                        value={googleMapsUrl}
                        onChange={e => setGoogleMapsUrl(e.target.value)}
                        placeholder="https://maps.app.goo.gl/... (หากเว้นว่าง ระบบจะสร้างจากชื่อสถานที่ให้อัตโนมัติ)"
                        className="form-input-text"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="event-limit" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                        จำกัดจำนวนการซื้อสูงสุดต่อคำสั่งซื้อ (ใบ)
                      </label>
                      <input
                        id="event-limit"
                        type="number"
                        min={1}
                        max={10}
                        value={limitPerOrder}
                        onChange={e => setLimitPerOrder(Number(e.target.value))}
                        className="form-input-text"
                      />
                      <small className="form-field-helper">
                        * มาตรฐานจำกัด 4 ใบต่อคำสั่งซื้อ เพื่อป้องกันการกักตุนบัตร
                      </small>
                    </div>
                  </div>
                )}

                {/* STEP 3: รอบการแสดง (Sessions & Schedule) */}
                {wizardStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                        กำหนดวันเวลาการแสดง และเวลาเปิดประตูรับเข้างานสำหรับแต่ละรอบ:
                      </p>
                      <button
                        type="button"
                        className="events-action-btn btn-storefront"
                        onClick={handleAddSession}
                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                      >
                        <PlusIcon width={14} height={14} />
                        <span>+ เพิ่มรอบการแสดง</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {sessions.map((sess, idx) => (
                        <div
                          key={sess.id}
                          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                              รอบที่ {idx + 1}
                            </strong>
                            {sessions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSession(sess.id)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                              >
                                <TrashIcon width={14} height={14} />
                                <span>ลบรอบนี้</span>
                              </button>
                            )}
                          </div>

                          <div className="form-row-two-col" style={{ marginBottom: '0.75rem' }}>
                            <div>
                              <label htmlFor={`sess-start-${sess.id}`} style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '2px' }}>
                                วันเวลาเริ่มการแสดง (Show Start) *
                              </label>
                              <input
                                id={`sess-start-${sess.id}`}
                                type="datetime-local"
                                required
                                value={sess.startTime}
                                onChange={e => handleUpdateSession(sess.id, { startTime: e.target.value })}
                                className="form-input-text"
                                style={{ fontSize: '0.85rem' }}
                              />
                            </div>
                            <div>
                              <label htmlFor={`sess-end-${sess.id}`} style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '2px' }}>
                                วันเวลาสิ้นสุดการแสดง (Show End) *
                              </label>
                              <input
                                id={`sess-end-${sess.id}`}
                                type="datetime-local"
                                required
                                value={sess.endTime}
                                onChange={e => handleUpdateSession(sess.id, { endTime: e.target.value })}
                                className="form-input-text"
                                style={{ fontSize: '0.85rem' }}
                              />
                            </div>
                          </div>

                          <div className="form-row-two-col">
                            <div>
                              <label htmlFor={`sess-adm-start-${sess.id}`} style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '2px' }}>
                                เวลาประตูเปิด / รับเข้างาน (Doors Open)
                              </label>
                              <input
                                id={`sess-adm-start-${sess.id}`}
                                type="datetime-local"
                                value={sess.admissionStartTime}
                                onChange={e => handleUpdateSession(sess.id, { admissionStartTime: e.target.value })}
                                className="form-input-text"
                                style={{ fontSize: '0.85rem' }}
                              />
                            </div>
                            <div>
                              <label htmlFor={`sess-adm-end-${sess.id}`} style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '2px' }}>
                                สิ้นสุดช่วงเวลารับเข้างาน
                              </label>
                              <input
                                id={`sess-adm-end-${sess.id}`}
                                type="datetime-local"
                                value={sess.admissionEndTime}
                                onChange={e => handleUpdateSession(sess.id, { admissionEndTime: e.target.value })}
                                className="form-input-text"
                                style={{ fontSize: '0.85rem' }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP 4: โซนและราคาบัตร (Zones & Ticket Types) */}
                {wizardStep === 4 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                      กำหนดโซนที่นั่ง ราคาบัตร และโควตาจำนวนบัตรที่เปิดขายในแต่ละรอบการแสดง:
                    </p>

                    {sessions.map((sess, sIdx) => (
                      <div
                        key={sess.id}
                        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', marginBottom: '0.5rem' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
                            รอบที่ {sIdx + 1} ({new Date(sess.startTime).toLocaleDateString('th-TH')})
                          </span>
                          <button
                            type="button"
                            className="events-action-btn btn-storefront"
                            onClick={() => handleAddTicketType(sess.id)}
                            style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                          >
                            + เพิ่มโซนบัตร
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          {sess.ticketTypes.map((tt) => (
                            <div
                              key={tt.id}
                              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'center', background: '#ffffff', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                            >
                              <div>
                                <label htmlFor={`tt-name-${tt.id}`} className="sr-only">ชื่อประเภทบัตรหรือโซน</label>
                                <input
                                  id={`tt-name-${tt.id}`}
                                  type="text"
                                  required
                                  value={tt.name}
                                  onChange={e => handleUpdateTicketType(sess.id, tt.id, { name: e.target.value })}
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
                                  value={tt.price}
                                  onChange={e => handleUpdateTicketType(sess.id, tt.id, { price: Number(e.target.value) })}
                                  placeholder="ราคา (บาท)"
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
                                  value={tt.quota}
                                  onChange={e => handleUpdateTicketType(sess.id, tt.id, { quota: Number(e.target.value) })}
                                  placeholder="โควตา (ใบ)"
                                  className="form-input-text"
                                  style={{ padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                                />
                              </div>
                              {sess.ticketTypes.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTicketType(sess.id, tt.id)}
                                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                                  title="ลบโซนนี้"
                                >
                                  <TrashIcon width={16} height={16} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="editor-modal-footer">
                <div className="editor-footer-left" style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-form-cancel"
                    onClick={handleCloseModal}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="btn-form-preview"
                    onClick={() => setShowPreview(true)}
                    title="เปิดดูหน้าเว็บตัวอย่างแบบที่ลูกค้าจะเห็นจริง"
                  >
                    <EyeIcon width={16} height={16} />
                    <span>ดูตัวอย่างหน้าเว็บลูกค้า (Preview)</span>
                  </button>
                </div>

                <div className="editor-footer-right">
                  {wizardStep > 1 && (
                    <button
                      type="button"
                      className="btn-form-draft"
                      onClick={() => setWizardStep(prev => (prev - 1) as 1 | 2 | 3 | 4)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ChevronLeftIcon width={14} height={14} />
                      <span>ย้อนกลับ</span>
                    </button>
                  )}

                  {wizardStep < 4 && (
                    <button
                      type="button"
                      className="btn-form-submit"
                      onClick={() => setWizardStep(prev => (prev + 1) as 1 | 2 | 3 | 4)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>ถัดไป</span>
                      <ChevronRightIcon width={14} height={14} />
                    </button>
                  )}

                  <button
                    type="submit"
                    className="btn-form-draft"
                    disabled={submitting}
                    name="save-draft"
                  >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูลร่าง (Draft)'}
                  </button>

                  <button
                    type="button"
                    className="btn-form-submit"
                    disabled={submitting || !title.trim() || !location.trim()}
                    onClick={() => handleCreateEvent(undefined, true)}
                    title="บันทึกและส่งให้เจ้าของระบบตรวจสอบเพื่อเปิดจำหน่ายทันที"
                  >
                    {submitting ? 'กำลังส่ง...' : 'บันทึกและส่งขออนุมัติทันที'}
                  </button>
                </div>
              </div>
            </form>
        </div>
      )}

      {/* 4. Live Customer Preview Modal (D-108, Q-113) */}
      {showPreview && (
        <div className="events-editor-modal-backdrop" role="dialog" aria-modal="true" aria-label="ตัวอย่างหน้าเว็บคอนเสิร์ต">
          <div className="events-editor-modal-card" style={{ maxWidth: '960px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="scanner-badge badge-primary-offline" style={{ fontSize: '0.75rem' }}>
                  <EyeIcon width={12} height={12} />
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
              >
                กลับไปแก้ไขข้อมูล
              </button>
            </div>

            {/* Simulated Public Customer View */}
            <div className="event-detail-page simulated-preview" style={{ pointerEvents: 'none' }}>
              {/* Banner */}
              <div className="event-cover-banner-wrapper" style={{ height: '220px', borderRadius: '12px', overflow: 'hidden', background: '#0f172a', marginBottom: '1rem' }}>
                {posterPreviewUrl ? (
                  /* biome-ignore lint/performance/noImgElement: live preview */
                  <img src={posterPreviewUrl} alt="แบนเนอร์คอนเสิร์ต" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '0.5rem' }}>
                    <TicketIcon />
                    <span>LIVE CONCERT EXPERIENCE</span>
                  </div>
                )}
              </div>

              {/* Hero Card */}
              <header className="event-hero-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    {title || 'ชื่องานคอนเสิร์ตของคุณ'}
                  </h1>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>ราคาบัตร</span>
                    <strong style={{ fontSize: '1.25rem', color: '#16a34a' }}>
                      {previewStartingPrice > 0 ? `เริ่มต้น ${formatBaht(previewStartingPrice)}` : '฿1,500.00'}
                    </strong>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <MapPinIcon width={16} height={16} style={{ color: '#64748b' }} />
                    <span>{location || 'สถานที่จัดงาน'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <CalendarIcon width={16} height={16} style={{ color: '#64748b' }} />
                    <span>{sessions.length} รอบการแสดง ({formatDate(new Date(sessions[0]?.startTime || Date.now()))})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <ClockIcon width={16} height={16} style={{ color: '#64748b' }} />
                    <span>
                      {formatTime(new Date(sessions[0]?.startTime || Date.now()))} – {formatTime(new Date(sessions[0]?.endTime || Date.now()))}
                      {sessions[0]?.admissionStartTime && ` (ประตูเปิด ${formatTime(new Date(sessions[0].admissionStartTime))})`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <ShieldCheckIcon width={16} height={16} style={{ color: '#64748b' }} />
                    <span>จำกัด {limitPerOrder} ใบ / คำสั่งซื้อ</span>
                  </div>
                </div>
              </header>

              {/* Categorized Preview Sections */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Details & Lineup */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <UsersIcon width={16} height={16} style={{ color: '#2563eb' }} />
                    <span>ศิลปิน & ไฮไลต์การแสดง</span>
                  </h4>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    {(artists || 'THE NEON BAND').split(',').map(a => (
                      <span key={a.trim()} style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '999px', fontWeight: 600 }}>
                        {a.trim()}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line' }}>
                    {description || 'เตรียมพบกับการรวมตัวของไลน์อัปศิลปินแถวหน้า เต็มอิ่มกับระบบเสียงและแสงสีเสียงระดับเวิลด์คลาส'}
                  </p>
                </div>

                {/* Ticket Zones */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <TicketIcon style={{ width: '16px', height: '16px', color: '#2563eb' }} />
                    <span>โซนที่นั่งและราคาบัตร</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {sessions[0]?.ticketTypes.map(tt => (
                      <div key={tt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem' }}>
                        <div>
                          <strong>{tt.name}</strong>
                          {tt.description && <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>{tt.description}</span>}
                        </div>
                        <span style={{ fontWeight: 700, color: '#16a34a' }}>{formatBaht(tt.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
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
            <div key={ev.id} className="event-card events-editorial-card">
              {/* Body (Clean No-Thumbnail Layout - D-110) */}
              <div className="events-card-body">
                <div className="events-card-badges-row">
                  <span className={`events-status-badge status-${ev.status}`}>
                    สถานะ: {ev.status}
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
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="events-map-link"
                  >
                    เปิดดูใน Google Maps &rarr;
                  </a>
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

                {/* Actions (Right Column) */}
                <div className="events-card-actions-col">
                  <Link
                    href={`/events/${ev.id}`}
                    target="_blank"
                    className="events-action-btn btn-storefront"
                    title="เปิดดูหน้าคอนเสิร์ตแบบที่ลูกค้าเห็น"
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

                  {ev.status === 'draft' && (
                    <button
                      type="button"
                      className="events-action-btn btn-submit"
                      onClick={() => handleSubmitSessionForApproval(ev.id)}
                    >
                      <span>ส่งขออนุมัติ</span>
                    </button>
                  )}

                  {ev.status === 'approved' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenAmendment(ev.id)}
                        data-testid={`open-amendment-btn-${ev.id}`}
                        className="events-action-btn btn-amendment"
                      >
                        <ClockIcon width={14} height={14} />
                        <span>ขอแก้ไขรอบ</span>
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

              {/* Financial Report View Embedded (AC-28) */}
              {selectedReportEventId === ev.id && (
                <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0', width: '100%' }}>
                  <OrganizerMoneyReportView eventId={ev.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 6. Amendment Form Modal (AC-34, AC-38, G-13) */}
      {activeEventDetails && (
        <div className="organizer-modal-backdrop">
          <div className="organizer-modal-dialog">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: 0 }}>
                ขอแก้ไขรอบการแสดง: {activeEventDetails.title} (AC-34, G-13)
              </h3>
              <button
                type="button"
                onClick={() => setActiveEventDetails(null)}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                ปิดหน้าต่าง
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '1rem' }}>
              สามารถยื่นขอแก้ไขราคาบัตร, โควตาบัตร หรือวันเวลาการแสดงได้ ข้อมูลเดิมจะยังคงเปิดขายตามปกติจนกว่าผู้ดูแลระบบจะอนุมัติคำขอ (AC-34, AC-108, G-13)
            </p>

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
              <p>กำลังโหลดข้อมูล...</p>
            ) : (
              <form onSubmit={handleSubmitAmendment}>
                {activeEventDetails.sessions.length > 1 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="amendment-session-select" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                      เลือกรอบการแสดง
                    </label>
                    <select
                      id="amendment-session-select"
                      value={selectedSessionId || ''}
                      onChange={e => handleSelectSession(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
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
                <div style={{ marginBottom: '1.25rem', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px', color: '#0f172a' }}>
                    ขอเลื่อนวันเวลาการแสดง (Reschedule Session — AC-38, AC-108, G-13):
                  </h4>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>
                    * เวลาการแสดงเดิมจะยังคงมีผลจนกว่าผู้ดูแลระบบ (Owner) จะอนุมัติคำขอเลื่อนรอบ (G-13)
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div>
                      <label htmlFor="amendment-start-time" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        วันเวลาเริ่มการแสดงใหม่
                      </label>
                      <input
                        id="amendment-start-time"
                        data-testid="amendment-start-time"
                        type="datetime-local"
                        value={amendmentStartTime}
                        onChange={e => setAmendmentStartTime(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="amendment-end-time" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        วันเวลาสิ้นสุดการแสดงใหม่
                      </label>
                      <input
                        id="amendment-end-time"
                        data-testid="amendment-end-time"
                        type="datetime-local"
                        value={amendmentEndTime}
                        onChange={e => setAmendmentEndTime(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                    ปรับปรุงราคาและโควตาประเภทบัตร:
                  </h4>

                  <div style={{ display: 'grid', gap: '8px' }}>
                    {amendmentTicketTypes.map((tt, idx) => (
                      <div
                        key={tt.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 120px 120px',
                          gap: '8px',
                          alignItems: 'center',
                          backgroundColor: '#f8fafc',
                          padding: '8px 12px',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{tt.name}</span>
                        </div>
                        <div>
                          <label htmlFor={`tt-price-${idx}`} style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>ราคา (บาท)</label>
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
                            style={{ width: '100%', padding: '4px 8px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                          />
                        </div>
                        <div>
                          <label htmlFor={`tt-quota-${idx}`} style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>โควตา (ใบ)</label>
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
                            style={{ width: '100%', padding: '4px 8px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                    * โควตาใหม่ต้องไม่ต่ำกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้วในรอบนี้ (AC-109)
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="submit"
                    disabled={amendmentSubmitting}
                    data-testid="submit-amendment-btn"
                    style={{
                      backgroundColor: '#1848ed',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: amendmentSubmitting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <ClockIcon />
                    {amendmentSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอแก้ไขรอบ (Submit Amendment)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveEventDetails(null)}
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      padding: '8px 16px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    ยกเลิก
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 7. Cancellation Form Modal (AC-35, AC-108) */}
      {cancelEventDetails && (
        <div className="organizer-modal-backdrop">
          <div
            id="cancellation-form-section"
            data-testid="cancellation-form-section"
            className="organizer-modal-dialog"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: 0, color: '#b91c1c' }}>
                ขอยกเลิกรอบการแสดง: {cancelEventDetails.title} (AC-35, AC-108)
              </h3>
              <button
                type="button"
                onClick={() => setCancelEventDetails(null)}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                ปิดหน้าต่าง
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '1rem' }}>
              เมื่อส่งคำขอ รอบการแสดงจะยังคงเปิดขายตามปกติจนกว่าผู้ดูแลระบบ (Owner) จะอนุมัติ (AC-108) เมื่ออนุมัติแล้ว ระบบจะหยุด checkout และสร้างรายการคืนเงินอัตโนมัติสำหรับบัตรที่ออกแล้วทั้งหมด (AC-35, AC-91)
            </p>

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
              <p>กำลังโหลดข้อมูล...</p>
            ) : (
              <form onSubmit={handleSubmitCancellation}>
                {cancelEventDetails.sessions.length > 1 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="cancel-session-select" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                      เลือกรอบการแสดงที่ต้องการยกเลิก
                    </label>
                    <select
                      id="cancel-session-select"
                      data-testid="cancel-session-select"
                      value={selectedCancelSessionId || ''}
                      onChange={e => setSelectedCancelSessionId(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
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
                  <label htmlFor="cancellation-reason" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                    เหตุผลในการขอยกเลิกรอบการแสดง *
                  </label>
                  <textarea
                    id="cancellation-reason"
                    data-testid="cancellation-reason-input"
                    rows={3}
                    value={cancellationReason}
                    onChange={e => setCancellationReason(e.target.value)}
                    placeholder="ระบุเหตุผล เช่น ศิลปินติดภารกิจด่วน, ปัญหาทางเทคนิคของสถานที่"
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setCancelEventDetails(null)}
                    style={{
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      padding: '8px 16px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={cancelSubmitting}
                    data-testid="submit-cancel-session-btn"
                    style={{
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: cancelSubmitting ? 'not-allowed' : 'pointer',
                      opacity: cancelSubmitting ? 0.7 : 1,
                    }}
                  >
                    {cancelSubmitting ? 'กำลังส่งคำขอ...' : 'ยืนยันขอยกเลิกรอบ (AC-35, AC-108)'}
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
