'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlusIcon,
  MailIcon,
  RefreshIcon,
  CheckCircleIcon,
  ClockIcon,
  CheckIcon,
} from './icons';
import { AlertIcon } from './alert-icon';

export interface OrganizerInvitationItem {
  id: string;
  email: string;
  role: 'organizer' | 'owner';
  status: 'pending' | 'accepted' | 'replaced' | 'expired';
  token?: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
}

export function OwnerInvitationsView() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'organizer' | 'owner'>('organizer');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [invitations, setInvitations] = useState<OrganizerInvitationItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/owner/invitations');
      if (!res.ok) {
        throw new Error('โหลดรายการคำเชิญไม่สำเร็จ');
      }
      const data = await res.json();
      setInvitations(data.invitations || []);
    } catch (err: unknown) {
      setHistoryError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดประวัติคำเชิญ');
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
        body: JSON.stringify({
          email,
          role,
          confirmPassword: role === 'owner' ? confirmPassword : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.message || 'ส่งคำเชิญไม่สำเร็จ');
        return;
      }

      const roleText = role === 'owner' ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้จัดงาน (Organizer)';
      setStatus('success');
      setMessage(`ส่งคำเชิญบทบาท${roleText}ไปยัง ${email} สำเร็จ ลิงก์ถูกจัดส่งไปยังอีเมลของผู้รับเรียบร้อยแล้ว (มีอายุ 48 ชั่วโมง)`);
      if (data.inviteUrl) {
        setLastInviteUrl(data.inviteUrl);
      } else if (data.token) {
        setLastInviteUrl(`${window.location.origin}/accept-invitation?token=${data.token}`);
      } else {
        setLastInviteUrl(null);
      }
      setEmail('');
      setConfirmPassword('');
      loadInvitations();
    } catch {
      setStatus('error');
      setMessage('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    }
  }

  function handleCopy(text: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  const pendingCount = invitations.filter(inv => inv.status === 'pending').length;
  const acceptedCount = invitations.filter(inv => inv.status === 'accepted').length;

  return (
    <div id="owner-invitations-view" className="owner-invitations-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Metric Cards */}
      <div
        className="invitations-metrics-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          className="account-card"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0f172a',
            }}
          >
            <UserPlusIcon style={{ width: '22px', height: '22px' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>คำเชิญทั้งหมด</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>{invitations.length}</div>
          </div>
        </div>

        <div
          className="account-card"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#fffbeb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#b45309',
            }}
          >
            <ClockIcon style={{ width: '22px', height: '22px' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>รอการตอบรับ</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b45309' }}>{pendingCount}</div>
          </div>
        </div>

        <div
          className="account-card"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#f0fdf4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#15803d',
            }}
          >
            <CheckCircleIcon style={{ width: '22px', height: '22px' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>ตอบรับแล้ว</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#15803d' }}>{acceptedCount}</div>
          </div>
        </div>
      </div>

      {/* Section 1: Create Invitation Form */}
      <section
        id="invite-organizer-form"
        className="account-card"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '1.75rem',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <UserPlusIcon style={{ width: '20px', height: '20px', color: '#0f172a' }} />
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
            เชิญผู้จัดงานหรือผู้ดูแลระบบใหม่
          </h3>
        </div>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.88rem', color: '#64748b' }}>
          ส่งคำเชิญทางอีเมลพร้อมลิงก์ตั้งรหัสผ่านสำหรับเข้าใช้งานระบบ ลิงก์มีอายุ 48 ชั่วโมงและใช้ได้ครั้งเดียว
        </p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {/* Role Selection Cards */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="invite-role-select"
              style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.5rem' }}
            >
              บทบาทผู้ใช้งานที่ต้องการเชิญ
            </label>

            {/* Hidden native select for backward compatibility & test matchers */}
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
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
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
                  background: role === 'organizer' ? '#f8fafc' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                    ผู้จัดงาน (Organizer)
                  </span>
                  {role === 'organizer' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#0f172a', color: '#fff' }}>
                      <CheckIcon style={{ width: '12px', height: '12px' }} />
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45 }}>
                  สิทธิ์สร้างและจัดการคอนเสิร์ต เพิ่มรอบการแสดง ตั้งค่าทีมงานสแกนบัตร และดูรายงานรายได้
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
                  background: role === 'owner' ? '#f8fafc' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                    ผู้ดูแลระบบ (Admin / Owner)
                  </span>
                  {role === 'owner' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#0f172a', color: '#fff' }}>
                      <CheckIcon style={{ width: '12px', height: '12px' }} />
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45 }}>
                  สิทธิ์ระดับผู้ดูแลระบบสูงสุด จัดการอนุมัติคอนเสิร์ต การเงิน โอนเงิน ลูกค้า และระบบทั้งหมด
                </p>
              </button>
            </div>
          </div>

          {/* Email Input */}
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="organizer-email"
              style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.4rem' }}
            >
              อีเมลผู้รับคำเชิญ
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="organizer-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="เช่น partner@example.com หรือ user@ubu.ac.th"
                required
                disabled={status === 'submitting'}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <span style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem' }}>
              หากเคยส่งคำเชิญไปยังอีเมลนี้แล้ว การส่งครั้งใหม่จะยกเลิกลิงก์เดิมและออกลิงก์ใหม่ให้อัตโนมัติ
            </span>
          </div>

          {/* Owner Re-Authentication Confirmation (Step-Up Authentication) */}
          {role === 'owner' && (
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="owner-confirm-password"
                style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.4rem' }}
              >
                รหัสผ่านปัจจุบันของคุณเพื่อยืนยันสิทธิ์ผู้ดูแลระบบ (Step-Up Authentication)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="owner-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="ระบุรหัสผ่านของคุณเพื่อยืนยันการเชิญผู้ดูแลระบบ"
                  required
                  disabled={status === 'submitting'}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <span style={{ display: 'block', fontSize: '0.8rem', color: '#b91c1c', marginTop: '0.35rem' }}>
                การเชิญผู้ดูแลระบบ (Owner) จะได้รับสิทธิ์สูงสุดในระบบ จึงจำเป็นต้องยืนยันรหัสผ่านของท่านเพื่อความปลอดภัย
              </span>
            </div>
          )}

          {/* Error Message */}
          {status === 'error' && (
            <div
              id="invite-error"
              className="form-error"
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                color: '#991b1b',
                fontSize: '0.88rem',
                marginBottom: '1.25rem',
              }}
            >
              <AlertIcon />
              <span>{message}</span>
            </div>
          )}

          {/* Success Message Banner */}
          {status === 'success' && (
            <div
              id="invite-success"
              className="form-success"
              role="status"
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '1rem',
                color: '#166534',
                marginBottom: '1.25rem',
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
                    background: '#ffffff',
                    border: '1px solid #dcfce7',
                    borderRadius: '8px',
                    padding: '0.5rem 0.75rem',
                    marginTop: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '0.82rem', color: '#475569', wordBreak: 'break-all', flex: '1 1 200px' }}>
                    {lastInviteUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(lastInviteUrl)}
                    className="button button-secondary"
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.82rem',
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

          {/* Submit Button */}
          <button
            type="submit"
            className="button button-primary"
            disabled={status === 'submitting'}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.92rem',
              fontWeight: 600,
              borderRadius: '8px',
            }}
          >
            {status === 'submitting'
              ? 'กำลังส่งคำเชิญ...'
              : role === 'owner'
                ? 'ส่งคำเชิญผู้ดูแลระบบ'
                : 'ส่งคำเชิญผู้จัดงาน'}
          </button>
        </form>
      </section>

      {/* Section 2: Invitations History Table */}
      <section
        className="account-card"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '1.75rem',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
              ประวัติคำเชิญทั้งหมด ({invitations.length})
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              ตรวจสอบสถานะคำเชิญ คัดลอกลิงก์ หรือดูประวัติการตอบรับ
            </p>
          </div>
          <button
            type="button"
            onClick={loadInvitations}
            disabled={isLoadingHistory}
            className="button button-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.9rem',
              fontSize: '0.85rem',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <RefreshIcon style={{ width: '15px', height: '15px' }} />
            <span>{isLoadingHistory ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
          </button>
        </div>

        {historyError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              color: '#991b1b',
              fontSize: '0.88rem',
              marginBottom: '1rem',
            }}
          >
            <AlertIcon />
            <span>{historyError}</span>
          </div>
        )}

        {isLoadingHistory ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid #e2e8f0',
                borderTopColor: '#0f172a',
                borderRadius: '50%',
                margin: '0 auto 0.75rem',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>กำลังโหลดประวัติคำเชิญ...</p>
          </div>
        ) : invitations.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px dashed #cbd5e1',
            }}
          >
            <MailIcon style={{ width: '36px', height: '36px', color: '#94a3b8', margin: '0 auto 0.5rem' }} />
            <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.95rem' }}>ยังไม่มีรายการคำเชิญในระบบ</div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              สามารถส่งคำเชิญแรกให้กับผู้จัดงานหรือแอดมินใหม่ได้จากฟอร์มด้านบน
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.88rem',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>อีเมลผู้รับ</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>บทบาท</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>สถานะ</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>วันที่ส่ง</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>วันหมดอายุ</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569', textAlign: 'right' }}>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map(inv => {
                  const inviteUrl = inv.token
                    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/accept-invitation?token=${inv.token}`
                    : '';
                  return (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                        {inv.email}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '9999px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            background: inv.role === 'owner' ? '#0f172a' : '#f1f5f9',
                            color: inv.role === 'owner' ? '#ffffff' : '#334155',
                            border: '1px solid #cbd5e1',
                          }}
                        >
                          {inv.role === 'owner' ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้จัดงาน (Organizer)'}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {inv.status === 'accepted' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '9999px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              background: '#f0fdf4',
                              color: '#166534',
                              border: '1px solid #bbf7d0',
                            }}
                          >
                            <CheckIcon style={{ width: '12px', height: '12px' }} />
                            ตอบรับแล้ว
                          </span>
                        ) : inv.status === 'pending' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '9999px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              background: '#fffbeb',
                              color: '#92400e',
                              border: '1px solid #fde68a',
                            }}
                          >
                            <ClockIcon style={{ width: '12px', height: '12px' }} />
                            รอตอบรับ
                          </span>
                        ) : inv.status === 'replaced' ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '9999px',
                              fontSize: '0.78rem',
                              fontWeight: 500,
                              background: '#f1f5f9',
                              color: '#64748b',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            ถูกแทนที่
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '9999px',
                              fontSize: '0.78rem',
                              fontWeight: 500,
                              background: '#fef2f2',
                              color: '#991b1b',
                              border: '1px solid #fecaca',
                            }}
                          >
                            หมดอายุ
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.82rem' }}>
                        {new Date(inv.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.82rem' }}>
                        {new Date(inv.expiresAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        {inv.status === 'pending' ? (
                          inviteUrl ? (
                            <button
                              type="button"
                              onClick={() => handleCopy(inviteUrl)}
                              className="button button-secondary"
                              style={{
                                padding: '0.3rem 0.65rem',
                                fontSize: '0.78rem',
                                borderRadius: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              คัดลอกลิงก์
                            </button>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.78rem',
                                color: '#64748b',
                                background: '#f1f5f9',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                              }}
                            >
                              ส่งทางอีเมลแล้ว
                            </span>
                          )
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
