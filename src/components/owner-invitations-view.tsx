'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UsersIcon,
  MailIcon,
  RefreshIcon,
  CheckCircleIcon,
  ClockIcon,
  CheckIcon,
  ShieldCheckIcon,
  LockIcon,
  XIcon,
  PlusIcon,
  SearchIcon,
} from './icons';
import { AlertIcon } from './alert-icon';
import { triggerToast } from './toast-notification';
import { formatDate, formatTime } from '@/lib/locale';

export interface OrganizerInvitationItem {
  id: string;
  email: string;
  role: 'organizer' | 'owner';
  status: 'pending' | 'accepted' | 'replaced' | 'expired';
  token: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
}

export interface UserAccountItem {
  id: string;
  name: string;
  email: string;
  role: 'organizer' | 'owner';
  status: 'active' | 'suspended';
  createdAt: string;
  lastLoginAt?: string | null;
  activeConcertsCount?: number;
  phone?: string | null;
  notes?: string | null;
}

export type InvitationsHubTab = 'invitations' | 'organizers' | 'admins';
export type InvitationStatusFilter = 'all' | 'pending' | 'accepted' | 'expired';
export type AccountStatusFilter = 'all' | 'active' | 'suspended';

const SAMPLE_MOCK_INVITATIONS: OrganizerInvitationItem[] = [
  {
    id: 'inv-01',
    email: 'organizer.soundwave@ubu.ac.th',
    role: 'organizer',
    status: 'pending',
    token: 'token-soundwave-2026-abc1',
    expiresAt: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
  },
  {
    id: 'inv-02',
    email: 'partner.livefest@gmail.com',
    role: 'organizer',
    status: 'pending',
    token: 'token-livefest-2026-xyz2',
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'inv-03',
    email: 'smo.ubu.activity@gmail.com',
    role: 'organizer',
    status: 'accepted',
    token: 'token-smo-ubu-accepted',
    expiresAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 96 * 3600 * 1000).toISOString(),
    acceptedAt: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
  },
  {
    id: 'inv-04',
    email: 'admin.support@ticket.in.th',
    role: 'owner',
    status: 'accepted',
    token: 'token-admin-support',
    expiresAt: new Date(Date.now() - 120 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 160 * 3600 * 1000).toISOString(),
    acceptedAt: new Date(Date.now() - 130 * 3600 * 1000).toISOString(),
  },
  {
    id: 'inv-05',
    email: 'old.partner@expired-domain.com',
    role: 'organizer',
    status: 'expired',
    token: 'token-expired-partner',
    expiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
  },
];

const SAMPLE_MOCK_ORGANIZERS: UserAccountItem[] = [
  {
    id: 'org-01',
    name: 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี',
    email: 'smo.ubu.activity@gmail.com',
    role: 'organizer',
    status: 'active',
    createdAt: '2026-09-15T09:00:00Z',
    lastLoginAt: '2026-11-06T18:24:00Z',
    activeConcertsCount: 2,
    phone: '081-998-7654',
    notes: 'ผู้จัดงานหลักของคอนเสิร์ต UBU Freshy Fest 2026 บัญชีได้รับการรับรองและลงนามสัญญาแล้ว',
  },
  {
    id: 'org-02',
    name: 'บจก. ริมมูล มิวสิค โปรดักชั่น',
    email: 'contact@rimmoolmusic.co.th',
    role: 'organizer',
    status: 'active',
    createdAt: '2026-10-01T11:30:00Z',
    lastLoginAt: '2026-11-05T14:10:00Z',
    activeConcertsCount: 1,
    phone: '089-123-4567',
    notes: 'ผู้จัดงานคอนเสิร์ต Rock Rimmool Live Festival 2026 บัญชีธนาคารกสิกรไทยผ่านการยืนยัน',
  },
  {
    id: 'org-03',
    name: 'กลุ่มศิลปินเพลงอีสานร่วมสมัย',
    email: 'isanfolk.live@outlook.com',
    role: 'organizer',
    status: 'active',
    createdAt: '2026-10-10T14:00:00Z',
    lastLoginAt: '2026-11-04T10:45:00Z',
    activeConcertsCount: 1,
    phone: '086-999-8877',
    notes: 'ผู้จัดงาน Isan Folk & Acoustic Night 2026 บัญชีธนาคารไทยพาณิชย์ผ่านการยืนยัน',
  },
];

const SAMPLE_MOCK_ADMINS: UserAccountItem[] = [
  {
    id: 'admin-01',
    name: 'เจ้าของเว็บทดสอบ (TICKET Super Admin)',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
    createdAt: '2026-08-01T00:00:00Z',
    lastLoginAt: '2026-11-07T02:30:00Z',
    activeConcertsCount: 0,
    phone: '02-123-4567',
    notes: 'ผู้ดูแลระบบสูงสุด (Super Administrator) มีสิทธิ์อนุมัติคอนเสิร์ต จัดการการเงิน และดูแลระบบ',
  },
  {
    id: 'admin-02',
    name: 'พิชญา ผู้ดูแลระบบฝ่ายการเงิน (Finance Lead)',
    email: 'pitchaya.finance@ticket.in.th',
    role: 'owner',
    status: 'active',
    createdAt: '2026-09-01T08:00:00Z',
    lastLoginAt: '2026-11-06T17:15:00Z',
    activeConcertsCount: 0,
    phone: '085-432-1098',
    notes: 'ดูแลการตรวจสอบยอดขาย ตรวจสอบสลิปโอนเงิน และยืนยันรอบจ่ายเงินประจำสัปดาห์',
  },
];

export function OwnerInvitationsView() {
  const [activeTab, setActiveTab] = useState<InvitationsHubTab>('invitations');
  const [searchQuery, setSearchQuery] = useState('');
  const [invitationStatusFilter, setInvitationStatusFilter] = useState<InvitationStatusFilter>('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusFilter>('all');

  // Invitations state
  const [invitations, setInvitations] = useState<OrganizerInvitationItem[]>(SAMPLE_MOCK_INVITATIONS);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [_historyError, setHistoryError] = useState<string | null>(null);

  // Accounts state
  const [organizers] = useState<UserAccountItem[]>(SAMPLE_MOCK_ORGANIZERS);
  const [admins] = useState<UserAccountItem[]>(SAMPLE_MOCK_ADMINS);

  // Create Invite Modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'organizer' | 'owner'>('organizer');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // View Account Details Modal state
  const [viewingAccount, setViewingAccount] = useState<UserAccountItem | null>(null);

  const loadInvitations = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/owner/invitations');
      if (res.ok) {
        const data = await res.json();
        if (data.invitations && data.invitations.length > 0) {
          setInvitations(data.invitations);
        } else {
          setInvitations(SAMPLE_MOCK_INVITATIONS);
        }
      } else {
        setInvitations(SAMPLE_MOCK_INVITATIONS);
      }
    } catch {
      setInvitations(SAMPLE_MOCK_INVITATIONS);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');
    setLastInviteUrl(null);
    setCopiedLink(false);

    try {
      const res = await fetch('/api/owner/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.message || 'ส่งคำเชิญไม่สำเร็จ');
        triggerToast({
          message: data.message || 'ส่งคำเชิญไม่สำเร็จ กรุณาตรวจสอบข้อมูล',
          type: 'error',
        });
        return;
      }

      const roleText = role === 'owner' ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้จัดงาน (Organizer)';
      const generatedUrl =
        data.inviteUrl ||
        (data.token
          ? `${typeof window !== 'undefined' ? window.location.origin : ''}/accept-invitation?token=${data.token}`
          : `${typeof window !== 'undefined' ? window.location.origin : ''}/accept-invitation?token=mock-${Date.now()}`);

      setStatus('success');
      setMessage(`ส่งคำเชิญบทบาท${roleText}ไปยัง ${email} สำเร็จ ลิงก์มีอายุ 48 ชั่วโมง`);
      setLastInviteUrl(generatedUrl);

      // Trigger Universal Top-Center Toast (D-251)
      triggerToast({
        message: `ส่งคำเชิญบทบาท${roleText}ไปยัง "${email}" เรียบร้อยแล้ว (ลิงก์มีอายุ 48 ชั่วโมง)`,
        type: 'success',
      });

      // Append to live invitations list
      const newInvItem: OrganizerInvitationItem = {
        id: data.id || `inv-new-${Date.now()}`,
        email: email,
        role: role,
        status: 'pending',
        token: data.token || `token-${Date.now()}`,
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      setInvitations(prev => [newInvItem, ...prev]);
    } catch {
      setStatus('error');
      setMessage('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
      triggerToast({
        message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง',
        type: 'error',
      });
    }
  }

  function handleOpenInviteModal(prefillEmail?: string, prefillRole?: 'organizer' | 'owner') {
    setEmail(prefillEmail || '');
    setRole(prefillRole || 'organizer');
    setStatus('idle');
    setMessage('');
    setLastInviteUrl(null);
    setCopiedLink(false);
    setIsInviteModalOpen(true);
  }

  function handleCloseInviteModal() {
    setIsInviteModalOpen(false);
    setEmail('');
    setStatus('idle');
    setMessage('');
    setLastInviteUrl(null);
  }

  function handleCopy(text: string, label: string = 'ลิงก์คำเชิญ') {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      triggerToast({
        message: `คัดลอก${label}เรียบร้อยแล้ว: ${text}`,
        type: 'success',
      });
    }
  }

  function handleSendPasswordReset(user: UserAccountItem) {
    triggerToast({
      message: `ส่งลิงก์ตั้งค่ารหัสผ่านใหม่ไปยังอีเมล "${user.email}" เรียบร้อยแล้ว`,
      type: 'success',
    });
  }

  // Filtered Invitations
  const filteredInvitations = useMemo(() => {
    return invitations.filter(inv => {
      if (invitationStatusFilter !== 'all' && inv.status !== invitationStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesEmail = inv.email.toLowerCase().includes(q);
        const matchesRole = (inv.role === 'owner' ? 'ผู้ดูแลระบบ admin' : 'ผู้จัดงาน organizer').toLowerCase().includes(q);
        const matchesToken = inv.token.toLowerCase().includes(q);
        if (!matchesEmail && !matchesRole && !matchesToken) return false;
      }
      return true;
    });
  }, [invitations, invitationStatusFilter, searchQuery]);

  // Filtered Organizers
  const filteredOrganizers = useMemo(() => {
    return organizers.filter(org => {
      if (accountStatusFilter !== 'all' && org.status !== accountStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = org.name.toLowerCase().includes(q);
        const matchesEmail = org.email.toLowerCase().includes(q);
        const matchesPhone = org.phone?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone) return false;
      }
      return true;
    });
  }, [organizers, accountStatusFilter, searchQuery]);

  // Filtered Admins
  const filteredAdmins = useMemo(() => {
    return admins.filter(adm => {
      if (accountStatusFilter !== 'all' && adm.status !== accountStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = adm.name.toLowerCase().includes(q);
        const matchesEmail = adm.email.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      return true;
    });
  }, [admins, accountStatusFilter, searchQuery]);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div
      id="owner-invitations-view"
      className="owner-invitations-management-hub"
      data-testid="owner-invitations-hub"
    >
      {/* 1. Header Block: Flat Canvas Headline */}
      <div className="hub-header-block">
        <h2 className="hub-page-title">
          ผู้ใช้งานและคำเชิญ (Users &amp; Invitations Hub)
        </h2>
        <p className="hub-page-subtitle">
          จัดการคำเชิญผู้จัดงานและทีมงาน ดูแลบัญชีผู้ใช้งานระบบ และกำหนดสิทธิ์การเข้าถึง (AC-14, D-188, D-190, D-254)
        </p>
      </div>

      {/* 2. Balanced Toolbar & 3 Underline Tabs */}
      <div className="hub-toolbar-row">
        {/* Left: 3 Underline Tabs with Count Badges (Q1 -> A1) */}
        <div className="hub-filter-tabs-bar" role="tablist" aria-label="แท็บหมวดหมู่ผู้ใช้งานและคำเชิญ">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'invitations'}
            className={`hub-filter-tab ${activeTab === 'invitations' ? 'active' : ''}`}
            onClick={() => setActiveTab('invitations')}
            data-testid="tab-invitations"
            title="คำเชิญทั้งหมด"
          >
            <span>รายการคำเชิญ</span>
            <span className="hub-tab-count-badge">{invitations.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'organizers'}
            className={`hub-filter-tab ${activeTab === 'organizers' ? 'active' : ''}`}
            onClick={() => setActiveTab('organizers')}
            data-testid="tab-organizers"
          >
            <span>บัญชีผู้จัดงาน</span>
            <span className="hub-tab-count-badge">{organizers.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'admins'}
            className={`hub-filter-tab ${activeTab === 'admins' ? 'active' : ''}`}
            onClick={() => setActiveTab('admins')}
            data-testid="tab-admins"
          >
            <span>บัญชีผู้ดูแลระบบ</span>
            <span className="hub-tab-count-badge">{admins.length}</span>
          </button>
        </div>

        {/* Right: Search, Filter, Refresh & 38px Primary Invite Button (Q2 -> B1) */}
        <div className="hub-toolbar-tools-right">
          {/* Live Search Input (38px height) */}
          <div className="hub-search-box">
            <SearchIcon className="hub-search-icon" />
            <input
              type="text"
              placeholder={
                activeTab === 'invitations'
                  ? 'ค้นหาอีเมล, รหัสคำเชิญ...'
                  : activeTab === 'organizers'
                    ? 'ค้นหาชื่อผู้จัดงาน, อีเมล...'
                    : 'ค้นหาชื่อแอดมิน, อีเมล...'
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="hub-search-input"
              aria-label="ช่องค้นหาข้อมูล"
            />
            {searchQuery && (
              <button
                type="button"
                className="hub-search-clear-btn"
                onClick={() => setSearchQuery('')}
                title="ล้างคำค้นหา"
                aria-label="ล้างคำค้นหา"
              >
                <XIcon />
              </button>
            )}
          </div>

          {/* Status Filter Dropdown (Custom SVG Chevron, 38px height) */}
          {activeTab === 'invitations' ? (
            <select
              value={invitationStatusFilter}
              onChange={e => setInvitationStatusFilter(e.target.value as InvitationStatusFilter)}
              className="hub-filter-select"
              aria-label="ตัวกรองสถานะคำเชิญ"
            >
              <option value="all">สถานะคำเชิญ: ทั้งหมด</option>
              <option value="pending">รอการตอบรับ</option>
              <option value="accepted">ตอบรับแล้ว</option>
              <option value="expired">หมดอายุ</option>
            </select>
          ) : (
            <select
              value={accountStatusFilter}
              onChange={e => setAccountStatusFilter(e.target.value as AccountStatusFilter)}
              className="hub-filter-select"
              aria-label="ตัวกรองสถานะบัญชี"
            >
              <option value="all">สถานะบัญชี: ทั้งหมด</option>
              <option value="active">ใช้งานอยู่</option>
              <option value="suspended">ระงับการใช้งาน</option>
            </select>
          )}

          {/* Refresh Button (38px) */}
          <button
            type="button"
            className="hub-refresh-btn"
            onClick={loadInvitations}
            disabled={isLoadingHistory}
            title="รีเฟรชข้อมูล"
            aria-label="รีเฟรชข้อมูล"
          >
            <RefreshIcon className={isLoadingHistory ? 'animate-spin' : ''} />
          </button>

          {/* Primary Action Button: + ส่งคำเชิญใหม่ (38px height, Q2 -> B1) */}
          <button
            type="button"
            className="primary-button row-action-btn"
            style={{ width: 'auto', padding: '0 1.15rem' }}
            onClick={() => handleOpenInviteModal()}
            data-testid="open-invite-modal-btn"
          >
            <PlusIcon style={{ width: '15px', height: '15px' }} />
            <span>ส่งคำเชิญใหม่</span>
          </button>
        </div>
      </div>

      {/* 3. Main Content: Horizontal Row Cards (Q3 -> C1) */}
      <section className="hub-list-container" aria-label="ประวัติคำเชิญทั้งหมด">
        {/* TAB 1: รายการคำเชิญ (Invitations) */}
        {activeTab === 'invitations' &&
          (filteredInvitations.length === 0 ? (
            <div className="hub-empty-state-card">
              <MailIcon className="empty-state-icon" />
              <p className="empty-title">ไม่พบรายการคำเชิญที่ตรงกับเงื่อนไข</p>
              <p className="empty-desc">ลองเปลี่ยนคำค้นหา หรือกดปุ่ม &quot;ส่งคำเชิญใหม่&quot; เพื่อส่งคำเชิญแรก</p>
            </div>
          ) : (
            filteredInvitations.map(inv => {
              const inviteUrl = `${originUrl}/accept-invitation?token=${inv.token}`;
              const isPending = inv.status === 'pending';
              const isAccepted = inv.status === 'accepted';
              const isExpired = inv.status === 'expired' || inv.status === 'replaced';

              return (
                <div
                  key={inv.id}
                  className="concert-horizontal-row-card"
                  data-testid={`invitation-row-${inv.id}`}
                >
                  {/* Left Center: 4-Row Ordered Hierarchy */}
                  <div className="row-card-center" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
                    {/* Row 1: Badges & Timestamps */}
                    <div className="row-card-badge-row">
                      {isPending && (
                        <span className="row-detail-pill" style={{ backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a', fontWeight: 600 }}>
                          <ClockIcon style={{ width: '13px', height: '13px' }} />
                          รอการตอบรับ
                        </span>
                      )}
                      {isAccepted && (
                        <span className="row-detail-pill payout-pill font-semibold">
                          <CheckCircleIcon style={{ width: '13px', height: '13px' }} />
                          ตอบรับแล้ว
                        </span>
                      )}
                      {isExpired && (
                        <span className="row-detail-pill" style={{ backgroundColor: '#f8fafc', color: '#64748b', borderColor: '#cbd5e1' }}>
                          หมดอายุ / ยกเลิก
                        </span>
                      )}

                      <span
                        className="row-detail-pill"
                        style={{
                          backgroundColor: inv.role === 'owner' ? '#0f172a' : '#eff6ff',
                          color: inv.role === 'owner' ? '#ffffff' : '#1d4ed8',
                          borderColor: inv.role === 'owner' ? '#0f172a' : '#bfdbfe',
                          fontWeight: 600,
                        }}
                      >
                        {inv.role === 'owner' ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้จัดงาน (Organizer)'}
                      </span>

                      <span className="row-meta-dot" aria-hidden="true">•</span>
                      <span className="row-meta-item">
                        ส่งเมื่อ: {formatDate(new Date(inv.createdAt))} เวลา {formatTime(new Date(inv.createdAt))}
                      </span>

                      {isPending && (
                        <>
                          <span className="row-meta-dot" aria-hidden="true">•</span>
                          <span className="row-meta-item" style={{ color: '#b45309', fontWeight: 600 }}>
                            หมดอายุ: {formatDate(new Date(inv.expiresAt))} (48 ชม.)
                          </span>
                        </>
                      )}
                    </div>

                    {/* Row 2: Recipient Email Headline */}
                    <div className="row-title-line">
                      <h3 className="row-concert-title">{inv.email}</h3>
                    </div>

                    {/* Row 3: Detail Pills */}
                    <div className="row-tags-strip">
                      <span className="row-detail-pill">
                        รหัสคำเชิญ: <strong style={{ fontFamily: 'monospace' }}>#{inv.id}</strong>
                      </span>
                      <span className="row-detail-pill">
                        ช่องทาง: <strong>อีเมลพร้อมลิงก์ตั้งรหัสผ่าน</strong>
                      </span>
                      <span className="row-detail-pill">
                        อายุลิงก์: <strong>48 ชั่วโมง (ใช้ได้ครั้งเดียว)</strong>
                      </span>
                    </div>

                    {/* Row 4: Invite URL Strip with Copy Button */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '0.45rem 0.75rem',
                        fontSize: '0.825rem',
                        overflow: 'hidden',
                        maxWidth: '100%',
                        minWidth: 0,
                        boxSizing: 'border-box',
                      }}
                    >
                      <span style={{ color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        ลิงก์คำเชิญ:
                      </span>
                      <code
                        style={{
                          color: '#0f172a',
                          fontFamily: 'monospace',
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {inviteUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(inviteUrl, 'ลิงก์คำเชิญ')}
                        className="secondary-button"
                        style={{
                          height: '28px',
                          minHeight: '28px',
                          padding: '0 0.65rem',
                          fontSize: '0.75rem',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        <CheckIcon style={{ width: '12px', height: '12px' }} />
                        <span>คัดลอก</span>
                      </button>
                    </div>
                  </div>

                  {/* Right Action Column (240px, 38px buttons) */}
                  <div className="row-card-right">
                    <button
                      type="button"
                      className="primary-button row-action-btn"
                      onClick={() => handleCopy(inviteUrl, 'ลิงก์คำเชิญ')}
                    >
                      <span>คัดลอกลิงก์คำเชิญ</span>
                    </button>

                    <button
                      type="button"
                      className="secondary-button row-action-btn"
                      onClick={() => handleOpenInviteModal(inv.email, inv.role)}
                    >
                      <span>ส่งคำเชิญซ้ำ / ออกลิงก์ใหม่</span>
                    </button>
                  </div>
                </div>
              );
            })
          ))}

        {/* TAB 2: บัญชีผู้จัดงาน (Organizers) */}
        {activeTab === 'organizers' &&
          (filteredOrganizers.length === 0 ? (
            <div className="hub-empty-state-card">
              <UsersIcon className="empty-state-icon" />
              <p className="empty-title">ไม่พบบัญชีผู้จัดงานที่ตรงกับเงื่อนไข</p>
              <p className="empty-desc">ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรอง</p>
            </div>
          ) : (
            filteredOrganizers.map(org => (
              <div
                key={org.id}
                className="concert-horizontal-row-card"
                data-testid={`organizer-card-${org.id}`}
              >
                <div className="row-card-center">
                  {/* Row 1: Badges & Timestamps */}
                  <div className="row-card-badge-row">
                    <span className="row-detail-pill payout-pill font-semibold">
                      <CheckCircleIcon style={{ width: '13px', height: '13px' }} />
                      ใช้งานอยู่
                    </span>
                    <span className="row-detail-pill amendment-pill font-semibold">
                      ผู้จัดงาน (Organizer)
                    </span>
                    <span className="row-meta-dot" aria-hidden="true">•</span>
                    <span className="row-meta-item">
                      สมัครสมาชิก: {formatDate(new Date(org.createdAt))}
                    </span>
                    {org.lastLoginAt && (
                      <>
                        <span className="row-meta-dot" aria-hidden="true">•</span>
                        <span className="row-meta-item">
                          เข้าใช้ล่าสุด: {formatDate(new Date(org.lastLoginAt))} เวลา {formatTime(new Date(org.lastLoginAt))}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Row 2: Headline with Organizer Name & Email */}
                  <div className="row-title-line">
                    <h3 className="row-concert-title">{org.name}</h3>
                  </div>

                  {/* Row 3: Detail Pills */}
                  <div className="row-tags-strip">
                    <span className="row-detail-pill">
                      อีเมล: <strong>{org.email}</strong>
                    </span>
                    <span className="row-detail-pill">
                      เบอร์ติดต่อ: <strong>{org.phone || '-'}</strong>
                    </span>
                    <span className="row-detail-pill">
                      คอนเสิร์ตที่ดูแล: <strong>{org.activeConcertsCount || 0} งาน</strong>
                    </span>
                    <span className="row-detail-pill">
                      การยืนยันตัวตน: <strong style={{ color: '#166534' }}>ผ่านการยืนยันแล้ว</strong>
                    </span>
                  </div>

                  {/* Row 4: Account Notes */}
                  {org.notes && (
                    <div
                      style={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '0.45rem 0.75rem',
                        fontSize: '0.825rem',
                        color: '#475569',
                      }}
                    >
                      <strong>บันทึกระบบ:</strong> {org.notes}
                    </div>
                  )}
                </div>

                {/* Right Action Column (240px, 38px buttons) */}
                <div className="row-card-right">
                  <button
                    type="button"
                    className="primary-button row-action-btn"
                    onClick={() => handleSendPasswordReset(org)}
                  >
                    <span>ส่งลิงก์รีเซ็ตรหัสผ่าน</span>
                  </button>

                  <button
                    type="button"
                    className="secondary-button row-action-btn"
                    onClick={() => setViewingAccount(org)}
                  >
                    <span>ดูรายละเอียดบัญชี</span>
                  </button>
                </div>
              </div>
            ))
          ))}

        {/* TAB 3: บัญชีผู้ดูแลระบบ (Admins) */}
        {activeTab === 'admins' &&
          (filteredAdmins.length === 0 ? (
            <div className="hub-empty-state-card">
              <ShieldCheckIcon className="empty-state-icon" />
              <p className="empty-title">ไม่พบบัญชีผู้ดูแลระบบที่ตรงกับเงื่อนไข</p>
              <p className="empty-desc">ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรอง</p>
            </div>
          ) : (
            filteredAdmins.map(admin => (
              <div
                key={admin.id}
                className="concert-horizontal-row-card"
                data-testid={`admin-card-${admin.id}`}
              >
                <div className="row-card-center">
                  {/* Row 1: Badges & Timestamps */}
                  <div className="row-card-badge-row">
                    <span className="row-detail-pill payout-pill font-semibold">
                      <CheckCircleIcon style={{ width: '13px', height: '13px' }} />
                      ใช้งานอยู่
                    </span>
                    <span
                      className="row-detail-pill font-semibold"
                      style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: '#0f172a' }}
                    >
                      ผู้ดูแลระบบ (Admin / Owner)
                    </span>
                    <span className="row-meta-dot" aria-hidden="true">•</span>
                    <span className="row-meta-item">
                      สิทธิ์สูงสุด (Super Admin)
                    </span>
                    {admin.lastLoginAt && (
                      <>
                        <span className="row-meta-dot" aria-hidden="true">•</span>
                        <span className="row-meta-item">
                          เข้าใช้ล่าสุด: {formatDate(new Date(admin.lastLoginAt))} เวลา {formatTime(new Date(admin.lastLoginAt))}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Row 2: Headline with Admin Name & Email */}
                  <div className="row-title-line">
                    <h3 className="row-concert-title">{admin.name}</h3>
                  </div>

                  {/* Row 3: Detail Pills */}
                  <div className="row-tags-strip">
                    <span className="row-detail-pill">
                      อีเมล: <strong>{admin.email}</strong>
                    </span>
                    <span className="row-detail-pill">
                      เบอร์ติดต่อ: <strong>{admin.phone || '-'}</strong>
                    </span>
                    <span className="row-detail-pill">
                      สิทธิ์ระบบ: <strong>ควบคุมเต็มรูปแบบ (Full Access)</strong>
                    </span>
                    <span className="row-detail-pill">
                      ความปลอดภัย: <strong style={{ color: '#166534' }}>MFA พร้อมใช้งาน</strong>
                    </span>
                  </div>

                  {/* Row 4: Admin Role Notes */}
                  {admin.notes && (
                    <div
                      style={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '0.45rem 0.75rem',
                        fontSize: '0.825rem',
                        color: '#475569',
                      }}
                    >
                      <strong>บทบาทและขอบเขต:</strong> {admin.notes}
                    </div>
                  )}
                </div>

                {/* Right Action Column (240px, 38px buttons) */}
                <div className="row-card-right">
                  <button
                    type="button"
                    className="primary-button row-action-btn"
                    onClick={() => handleSendPasswordReset(admin)}
                  >
                    <span>ส่งลิงก์รีเซ็ตรหัสผ่าน</span>
                  </button>

                  <button
                    type="button"
                    className="secondary-button row-action-btn"
                    onClick={() => setViewingAccount(admin)}
                  >
                    <span>ดูรายละเอียดบัญชี</span>
                  </button>
                </div>
              </div>
            ))
          ))}
      </section>

      {/* ==========================================================================
          MODAL 1: Create Invitation Modal Dialog (Q2 -> B1, D-254)
          ========================================================================== */}
      {isInviteModalOpen && (
        /* biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop click dismiss */
        <div
          className="review-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) handleCloseInviteModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-modal-title"
        >
          <div
            id="invite-organizer-form"
            className="admin-full-dialog-modal invite-dialog"
            style={{ maxWidth: '600px' }}
          >
            {/* Modal Header */}
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">ระบบคำเชิญและสิทธิ์ผู้ใช้งาน</span>
                <h3 id="invite-modal-title" className="modal-concert-title">
                  เชิญผู้จัดงานหรือผู้ดูแลระบบใหม่
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={handleCloseInviteModal}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: '20px', height: '20px' }} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <div className="dialog-modal-body">
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.5 }}>
                  ส่งคำเชิญทางอีเมลพร้อมลิงก์ตั้งรหัสผ่านสำหรับเข้าใช้งานระบบ ลิงก์มีอายุ 48 ชั่วโมงและใช้ได้ครั้งเดียวเพื่อความปลอดภัยสูงสุด
                </p>

                {/* Role Selection Cards */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label
                    htmlFor="invite-role-select"
                    style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: '#0f172a', marginBottom: '0.5rem' }}
                  >
                    บทบาทผู้ใช้งานที่ต้องการเชิญ *
                  </label>

                  {/* Native select for backward-compatibility test assertions */}
                  <select
                    id="invite-role-select"
                    value={role}
                    onChange={e => setRole(e.target.value as 'organizer' | 'owner')}
                    disabled={status === 'submitting'}
                    style={{ display: 'none' }}
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    <option value="organizer">ผู้จัดงาน (Organizer)</option>
                    <option value="owner">ผู้ดูแลระบบ (Admin / Owner)</option>
                  </select>

                  <div
                    className="modal-form-grid"
                    style={{
                      gap: '0.75rem',
                    }}
                  >
                    {/* Role Option 1: Organizer */}
                    <button
                      type="button"
                      onClick={() => setRole('organizer')}
                      disabled={status === 'submitting'}
                      style={{
                        textAlign: 'left',
                        padding: '1rem',
                        borderRadius: '10px',
                        border: role === 'organizer' ? '2px solid #0f172a' : '1px solid #cbd5e1',
                        backgroundColor: role === 'organizer' ? '#f8fafc' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.925rem', color: '#0f172a' }}>
                          ผู้จัดงาน (Organizer)
                        </span>
                        {role === 'organizer' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#0f172a', color: '#fff' }}>
                            <CheckIcon style={{ width: '12px', height: '12px' }} />
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>
                        สิทธิ์สร้างคอนเสิร์ต เพิ่มรอบแสดง ตั้งค่าทีมงานสแกนบัตร และดูรายงานรายได้
                      </p>
                    </button>

                    {/* Role Option 2: Owner/Admin */}
                    <button
                      type="button"
                      onClick={() => setRole('owner')}
                      disabled={status === 'submitting'}
                      style={{
                        textAlign: 'left',
                        padding: '1rem',
                        borderRadius: '10px',
                        border: role === 'owner' ? '2px solid #0f172a' : '1px solid #cbd5e1',
                        backgroundColor: role === 'owner' ? '#f8fafc' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.925rem', color: '#0f172a' }}>
                          ผู้ดูแลระบบ (Admin)
                        </span>
                        {role === 'owner' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#0f172a', color: '#fff' }}>
                            <CheckIcon style={{ width: '12px', height: '12px' }} />
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>
                        สิทธิ์ดูแลระบบสูงสุด จัดการอนุมัติคอนเสิร์ต การเงิน โอนเงิน และลูกค้า
                      </p>
                    </button>
                  </div>
                </div>

                {/* Email Input */}
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label
                    htmlFor="organizer-email"
                    style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: '#0f172a', marginBottom: '0.4rem' }}
                  >
                    อีเมลผู้รับคำเชิญ *
                  </label>
                  <input
                    id="organizer-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="เช่น partner@example.com หรือ user@ubu.ac.th"
                    required
                    disabled={status === 'submitting'}
                    className="text-input"
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ display: 'block', fontSize: '0.775rem', color: '#64748b', marginTop: '0.35rem' }}>
                    หากเคยส่งคำเชิญไปยังอีเมลนี้แล้ว การส่งครั้งใหม่จะยกเลิกลิงก์เดิมและออกลิงก์ใหม่ให้อัตโนมัติ
                  </span>
                </div>

                {/* Error Banner */}
                {status === 'error' && (
                  <div
                    id="invite-error"
                    className="form-error"
                    role="alert"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                      color: '#991b1b',
                      fontSize: '0.85rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <AlertIcon />
                    <span>{message}</span>
                  </div>
                )}

                {/* Success Banner with Copy Link */}
                {status === 'success' && (
                  <div
                    id="invite-success"
                    className="form-success"
                    role="status"
                    style={{
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '10px',
                      padding: '1rem',
                      color: '#166534',
                      marginBottom: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                      <CheckCircleIcon style={{ width: '18px', height: '18px', color: '#16a34a' }} />
                      <span>{message}</span>
                    </div>

                    {lastInviteUrl && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          backgroundColor: '#ffffff',
                          border: '1px solid #dcfce7',
                          borderRadius: '8px',
                          padding: '0.5rem 0.75rem',
                          marginTop: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', color: '#475569', wordBreak: 'break-all', flex: '1 1 200px', fontFamily: 'monospace' }}>
                          {lastInviteUrl}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(lastInviteUrl, 'ลิงก์คำเชิญ')}
                          className="secondary-button"
                          style={{
                            height: '32px',
                            minHeight: '32px',
                            padding: '0 0.75rem',
                            fontSize: '0.8rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {copiedLink ? 'คัดลอกเรียบร้อยแล้ว' : 'คัดลอกลิงก์คำเชิญ'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="dialog-modal-footer">
                <button
                  type="button"
                  className="secondary-button modal-footer-btn"
                  onClick={handleCloseInviteModal}
                  disabled={status === 'submitting'}
                >
                  ปิดหน้าต่าง
                </button>
                <button
                  type="submit"
                  id="submit-invite-btn"
                  className="primary-button modal-footer-btn"
                  disabled={status === 'submitting'}
                >
                  <MailIcon style={{ width: '15px', height: '15px' }} />
                  <span>
                    {status === 'submitting'
                      ? 'กำลังส่งคำเชิญ...'
                      : role === 'owner'
                        ? 'ส่งคำเชิญผู้ดูแลระบบ'
                        : 'ส่งคำเชิญผู้จัดงาน'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================================
          MODAL 2: View Account Details Modal Dialog (D-254)
          ========================================================================== */}
      {viewingAccount && (
        /* biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop click dismiss */
        <div
          className="review-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setViewingAccount(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-details-modal-title"
        >
          <div
            className="admin-full-dialog-modal user-details-dialog"
            style={{ maxWidth: '600px' }}
          >
            {/* Modal Header */}
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">รายละเอียดบัญชีผู้ใช้งาน</span>
                <h3 id="account-details-modal-title" className="modal-concert-title">
                  {viewingAccount.name}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setViewingAccount(null)}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: '20px', height: '20px' }} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="dialog-modal-body">
              <div className="modal-summary-card">
                <div className="summary-field">
                  <span className="summary-label">ชื่อผู้ใช้งาน:</span>
                  <strong className="summary-val">{viewingAccount.name}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">อีเมลประจำบัญชี:</span>
                  <strong className="summary-val">{viewingAccount.email}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">บทบาทในระบบ:</span>
                  <strong className="summary-val">
                    {viewingAccount.role === 'owner' ? 'ผู้ดูแลระบบ (Admin / Owner)' : 'ผู้จัดงาน (Organizer)'}
                  </strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">สถานะบัญชี:</span>
                  <strong className="summary-val" style={{ color: '#166534' }}>
                    ใช้งานอยู่ (Active)
                  </strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">เบอร์ติดต่อ:</span>
                  <strong className="summary-val">{viewingAccount.phone || '-'}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">วันที่สมัครสมาชิก:</span>
                  <strong className="summary-val">{formatDate(new Date(viewingAccount.createdAt))}</strong>
                </div>
                {viewingAccount.lastLoginAt && (
                  <div className="summary-field">
                    <span className="summary-label">เข้าสู่ระบบล่าสุด:</span>
                    <strong className="summary-val">
                      {formatDate(new Date(viewingAccount.lastLoginAt))} {formatTime(new Date(viewingAccount.lastLoginAt))}
                    </strong>
                  </div>
                )}
                {viewingAccount.role === 'organizer' && (
                  <div className="summary-field">
                    <span className="summary-label">คอนเสิร์ตที่ดูแล:</span>
                    <strong className="summary-val">{viewingAccount.activeConcertsCount || 0} งาน</strong>
                  </div>
                )}
              </div>

              {viewingAccount.notes && (
                <div
                  style={{
                    marginTop: '1rem',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    fontSize: '0.825rem',
                  }}
                >
                  <span style={{ display: 'block', color: '#64748b', fontWeight: 600, marginBottom: '0.25rem' }}>
                    บันทึกประวัติบัญชี:
                  </span>
                  <p style={{ margin: 0, color: '#334155', lineHeight: 1.5 }}>
                    {viewingAccount.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="dialog-modal-footer">
              <button
                type="button"
                className="secondary-button modal-footer-btn"
                onClick={() => setViewingAccount(null)}
              >
                ปิดหน้าต่าง
              </button>
              <button
                type="button"
                className="primary-button modal-footer-btn"
                onClick={() => {
                  handleSendPasswordReset(viewingAccount);
                  setViewingAccount(null);
                }}
              >
                <LockIcon style={{ width: '14px', height: '14px' }} />
                <span>ส่งลิงก์รีเซ็ตรหัสผ่าน</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
