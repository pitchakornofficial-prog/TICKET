'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SessionAmendmentRecord, SessionCancellationRecord } from '@/server/events';
import { formatBaht, formatDateTime } from '@/lib/locale';
import { CheckCircleIcon, ClockIcon, EyeIcon, BanknotesIcon, XIcon } from './icons';
import { TicketIcon } from './ticket-icon';
import { AlertIcon } from './alert-icon';

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

export function OwnerSessionApprovalManager() {
  const [sessions, setSessions] = useState<PendingSession[]>([]);
  const [amendments, setAmendments] = useState<SessionAmendmentRecord[]>([]);
  const [cancellations, setCancellations] = useState<SessionCancellationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');

  // Special refund window state for amendments (AC-38)
  const [specialWindows, setSpecialWindows] = useState<Record<string, { start: string; end: string }>>({});

  // Rejection state for amendments
  const [rejectingAmendmentId, setRejectingAmendmentId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Rejection state for cancellations (AC-35)
  const [rejectingCancellationId, setRejectingCancellationId] = useState<string | null>(null);
  const [cancellationRejectionReason, setCancellationRejectionReason] = useState('');

  // Full Concert Review Modal State (D-219)
  const [reviewingSession, setReviewingSession] = useState<PendingSession | null>(null);
  const [reviewingEventDetails, setReviewingEventDetails] = useState<ReviewingEventDetails | null>(null);
  const [loadingReviewDetails, setLoadingReviewDetails] = useState(false);
  const [customFeeRate, setCustomFeeRate] = useState<number>(3.0);
  const [customReserveRate, setCustomReserveRate] = useState<number>(0.0);
  const [customUbuPrivilegeFeeRate, setCustomUbuPrivilegeFeeRate] = useState<number>(0.0);
  const [reviewUbuMode, setReviewUbuMode] = useState<boolean>(false);
  const [rejectingSessionId, setRejectingSessionId] = useState<string | null>(null);
  const [pendingRejectionReason, setPendingRejectionReason] = useState<string>('');
  const [submittingApproval, setSubmittingApproval] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      const [sessRes, amdRes, canRes] = await Promise.all([
        fetch('/api/owner/sessions'),
        fetch('/api/owner/sessions/amendments'),
        fetch('/api/owner/sessions/cancellations'),
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    setCustomReserveRate(0.0);
    setCustomUbuPrivilegeFeeRate(0.0);
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
          setCustomFeeRate(evFee.feeSettings.organizerFeeRate ?? 3.0);
          setCustomReserveRate(evFee.feeSettings.reservePercentage ?? 0.0);
          setCustomUbuPrivilegeFeeRate(evFee.feeSettings.organizerFeePrivilegeRate ?? 0.0);
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
          organizerFeeRate: customFeeRate,
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
      if (win?.start) payload.specialRefundWindowStart = new Date(win.start).toISOString();
      if (win?.end) payload.specialRefundWindowEnd = new Date(win.end).toISOString();

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
      setActionMessage(`อนุมัติการแก้ไขรอบของ "${eventTitle}" สำเร็จ (AC-67, AC-68, AC-38)`);
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

  return (
    <div
      id="owner-session-approval-manager"
      data-testid="owner-session-approval-manager"
      className="owner-approvals-section"
      style={{
        marginTop: '2rem',
        borderTop: '1px solid var(--color-border, #333)',
        paddingTop: '1.5rem',
      }}
    >
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
        การอนุมัติรอบและการแก้ไขรอบ (Owner Session & Amendment Review)
      </h2>

      {error && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '1rem',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}

      {actionMessage && (
        <div
          style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '1rem',
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <CheckCircleIcon />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* 1. Live Session Amendments (TASK-024, AC-67, AC-68, AC-109) */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: '#1848ed', marginBottom: '0.75rem' }}>
          คำขอแก้ไขรอบที่เปิดขายอยู่ (Live Session Amendments — AC-67, AC-68, AC-109)
        </h3>

        {loading ? (
          <p style={{ color: '#888' }}>กำลังโหลดคำขอแก้ไข...</p>
        ) : amendments.length === 0 ? (
          <p style={{ color: '#888', fontSize: '0.9rem' }}>ไม่มีคำขอแก้ไขรอบที่เปิดขายอยู่ในขณะนี้</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {amendments.map(amd => (
              <div
                key={amd.id}
                className="session-amendment-card"
                style={{
                  padding: '1.25rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 4px 0', color: '#0f172a' }}>
                      {amd.eventTitle}
                    </h4>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
                      ผู้จัดงาน: {amd.organizerName} ({amd.organizerEmail})
                    </p>
                  </div>
                  <span
                    style={{
                      backgroundColor: '#eff6ff',
                      color: '#1848ed',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <ClockIcon /> รออนุมัติการแก้ไข (pending)
                  </span>
                </div>

                {/* Compare ticket types */}
                <div style={{ marginTop: '12px', marginBottom: '12px', fontSize: '13px' }}>
                  <strong style={{ color: '#334155', display: 'block', marginBottom: '6px' }}>
                    รายละเอียดประเภทบัตรและโควตา (เปรียบเทียบเดิม vs แก้ไขใหม่):
                  </strong>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {amd.ticketTypes.map(newItem => {
                      const curItem = amd.currentTicketTypes.find(c => c.id === newItem.id);
                      return (
                        <div
                          key={newItem.id || newItem.name}
                          style={{
                            backgroundColor: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            padding: '8px 12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{newItem.name}</span>
                            {curItem && (
                              <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '6px' }}>
                                (สิทธิ์ขาย/กันแล้ว: {curItem.heldQuota} ใบ)
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '13px' }}>
                            {curItem ? (
                              <span>
                                ราคา: {formatBaht(curItem.price)} → <strong style={{ color: '#1848ed' }}>{formatBaht(newItem.price)}</strong> | โควตา: {curItem.quota} → <strong style={{ color: '#1848ed' }}>{newItem.quota} ใบ</strong>
                              </span>
                            ) : (
                              <span style={{ color: '#16a34a', fontWeight: 'bold' }}>
                                [เพิ่มประเภทใหม่] ราคา: {formatBaht(newItem.price)} | โควตา: {newItem.quota} ใบ
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reschedule Details if present (AC-38, AC-108) */}
                {amd.startTime && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '10px 14px',
                      backgroundColor: '#eff6ff',
                      borderRadius: '6px',
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e40af', marginBottom: '4px' }}>
                      ขอเลื่อนวันเวลาการแสดง (Reschedule Request — AC-38, AC-108):
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155' }}>
                      เวลาเดิม: {formatDateTime(new Date(amd.currentStartTime))} →{' '}
                      <strong style={{ color: '#1848ed' }}>เวลาใหม่: {formatDateTime(new Date(amd.startTime))}</strong>
                    </div>
                  </div>
                )}

                {/* Special Refund Window Input (AC-38) */}
                <div
                  style={{
                    marginBottom: '14px',
                    padding: '10px 14px',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '6px',
                    border: '1px solid #bbf7d0',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#166534', marginBottom: '4px' }}>
                    กำหนดช่วงเวลาขอคืนเงินพิเศษ (Special Refund Window — AC-38):
                  </div>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 8px 0' }}>
                    * เปิดให้ผู้ถือบัตรยื่นขอคืนเงินตามราคาหน้าบัตรได้แม้พ้นกำหนดปกติ 168 ชั่วโมง
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                    <div>
                      <label htmlFor={`srw-start-${amd.id}`} style={{ display: 'block', fontSize: '11px', color: '#334155', fontWeight: 'bold', marginBottom: '2px' }}>
                        เวลาเริ่มต้นช่วงพิเศษ
                      </label>
                      <input
                        id={`srw-start-${amd.id}`}
                        data-testid={`srw-start-${amd.id}`}
                        type="datetime-local"
                        value={specialWindows[amd.id]?.start || ''}
                        onChange={e =>
                          setSpecialWindows(prev => ({
                            ...prev,
                            [amd.id]: { ...prev[amd.id], start: e.target.value, end: prev[amd.id]?.end || '' },
                          }))
                        }
                        style={{ width: '100%', padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label htmlFor={`srw-end-${amd.id}`} style={{ display: 'block', fontSize: '11px', color: '#334155', fontWeight: 'bold', marginBottom: '2px' }}>
                        เวลาสิ้นสุดช่วงพิเศษ
                      </label>
                      <input
                        id={`srw-end-${amd.id}`}
                        data-testid={`srw-end-${amd.id}`}
                        type="datetime-local"
                        value={specialWindows[amd.id]?.end || ''}
                        onChange={e =>
                          setSpecialWindows(prev => ({
                            ...prev,
                            [amd.id]: { ...prev[amd.id], end: e.target.value, start: prev[amd.id]?.start || '' },
                          }))
                        }
                        style={{ width: '100%', padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                  * ลูกค้าที่กันบัตรก่อนอนุมัติจะยังคงยอดเดิมตลอด 15 นาที (AC-68); การซื้อใหม่จะใช้อัตราใหม่ทันทีที่อนุมัติ (AC-67)
                </div>

                {/* Actions */}
                {rejectingAmendmentId === amd.id ? (
                  <div style={{ marginTop: '8px' }}>
                    <label
                      htmlFor={`reject-amd-reason-${amd.id}`}
                      style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#991b1b', marginBottom: '4px' }}
                    >
                      ระบุเหตุผลการปฏิเสธคำขอแก้ไข
                    </label>
                    <input
                      id={`reject-amd-reason-${amd.id}`}
                      type="text"
                      value={rejectionReason}
                      onChange={e => setRejectionReason(e.target.value)}
                      placeholder="เช่น โควตาใหม่ขัดกับสัญญา หรือราคาเปลี่ยนแปลงกะทันหัน"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        marginBottom: '8px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleRejectAmendment(amd.id)}
                        data-testid={`confirm-reject-amendment-btn-${amd.id}`}
                        style={{
                          backgroundColor: '#0f172a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '6px 12px',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                      >
                        ยืนยันปฏิเสธ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingAmendmentId(null);
                          setRejectionReason('');
                        }}
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '6px 12px',
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setRejectingAmendmentId(amd.id)}
                      data-testid={`reject-amendment-btn-${amd.id}`}
                      style={{
                        backgroundColor: '#ffffff',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      ปฏิเสธคำขอ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveAmendment(amd.id, amd.eventTitle)}
                      data-testid={`approve-amendment-btn-${amd.id}`}
                      style={{
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 16px',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <CheckCircleIcon />
                      อนุมัติการแก้ไข (AC-67)
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Session Cancellations Waiting Approval (AC-35, AC-91, AC-108) */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#dc2626' }}>
          คำขอยกเลิกรอบการแสดงที่รอการอนุมัติ (Session Cancellations)
        </h3>

        {loading ? (
          <p style={{ color: '#888' }}>กำลังโหลดคำขอยกเลิก...</p>
        ) : cancellations.length === 0 ? (
          <p style={{ color: '#888', fontSize: '0.9rem' }}>ไม่มีคำขอยกเลิกรอบการแสดงที่รอการอนุมัติในขณะนี้</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {cancellations.map(can => (
              <div
                key={can.id}
                data-testid={`cancellation-request-${can.id}`}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #fca5a5',
                  borderRadius: '6px',
                  padding: '1.25rem',
                  color: '#0f172a',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', margin: '0 0 6px 0', color: '#b91c1c' }}>
                      {can.eventTitle}
                    </h4>
                    <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 4px 0' }}>
                      <strong>ผู้จัดงาน:</strong> {can.organizerName} ({can.organizerEmail})
                    </p>
                    <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 4px 0' }}>
                      <strong>สถานที่:</strong> {can.location}
                    </p>
                    <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 4px 0' }}>
                      <strong>เวลาแสดงเดิม:</strong> {formatDateTime(new Date(can.startTime))} - {formatDateTime(new Date(can.endTime))}
                    </p>
                    <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#fef2f2', borderRadius: '4px', borderLeft: '3px solid #dc2626' }}>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#991b1b' }}>เหตุผลในการยกเลิก:</span>
                      <p style={{ fontSize: '13px', color: '#7f1d1d', margin: '4px 0 0 0' }}>{can.reason}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setRejectingCancellationId(can.id)}
                      data-testid={`reject-cancellation-open-btn-${can.id}`}
                      style={{
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      ปฏิเสธ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveCancellation(can.id, can.eventTitle)}
                      data-testid={`approve-cancellation-btn-${can.id}`}
                      style={{
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 16px',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <CheckCircleIcon />
                      อนุมัติยกเลิกรอบ (AC-35)
                    </button>
                  </div>
                </div>

                {/* Rejection input inline modal/form */}
                {rejectingCancellationId === can.id && (
                  <div style={{ marginTop: '1rem', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <label htmlFor={`reject-reason-${can.id}`} style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                      ระบุเหตุผลในการปฏิเสธคำขอยกเลิก:
                    </label>
                    <input
                      id={`reject-reason-${can.id}`}
                      data-testid={`reject-cancellation-reason-${can.id}`}
                      type="text"
                      value={cancellationRejectionReason}
                      onChange={e => setCancellationRejectionReason(e.target.value)}
                      placeholder="เช่น ข้อมูลไม่ครบถ้วน, เอกสารเหตุผลไม่เพียงพอ"
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', marginBottom: '8px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingCancellationId(null);
                          setCancellationRejectionReason('');
                        }}
                        style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectCancellation(can.id)}
                        data-testid={`confirm-reject-cancellation-btn-${can.id}`}
                        style={{ backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '4px 12px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        ยืนยันปฏิเสธ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. New Sessions & Concerts Waiting Approval (D-219: Full Review Hub) */}
      <div data-testid="owner-pending-concerts-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <ClockIcon width={20} height={20} style={{ color: '#1848ed' }} />
              <span>รอบการแสดงและคอนเสิร์ตใหม่ที่รออนุมัติเปิดขาย (Pending Concert Approvals)</span>
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              ตรวจสอบข้อมูลคอนเสิร์ต สิทธิ์ ม.อุบล บัญชีรับเงิน นโยบายคืนเงิน และกำหนดอัตราค่าบริการ (%) ก่อนอนุมัติเปิดขาย
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', fontWeight: 600 }}>
            {sessions.length} รายการรออนุมัติ
          </span>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>กำลังโหลดรายการรออนุมัติ...</p>
        ) : sessions.length === 0 ? (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
            <p style={{ margin: 0, fontSize: '0.92rem' }}>ไม่มีรอบการแสดงหรือคอนเสิร์ตใหม่ที่รอการอนุมัติในขณะนี้</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {sessions.map(s => (
              <div
                key={s.sessionId}
                className="pending-session-card"
                data-testid={`pending-session-card-${s.sessionId}`}
                style={{
                  padding: '1.25rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '260px' }}>
                    {s.posterUrl ? (
                      // biome-ignore lint/performance/noImgElement: dynamic user-uploaded poster display
                      <img
                        src={s.posterUrl}
                        alt={s.eventTitle}
                        style={{ width: '70px', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{ width: '70px', height: '90px', background: '#f1f5f9', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexShrink: 0 }}>
                        <TicketIcon style={{ width: 28, height: 28 }} />
                      </div>
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <h4 style={{ fontSize: '1.15rem', margin: 0, color: '#0f172a', fontWeight: 700 }}>{s.eventTitle}</h4>
                        {s.ubuPrivilegeMode && (
                          <span style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#1848ed', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            สิทธิ์ ม.อุบล: เปิดใช้งาน
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                          รออนุมัติ (pending)
                        </span>
                      </div>
                      <p style={{ color: '#475569', fontSize: '0.85rem', margin: '0 0 3px 0' }}>
                        <strong>ผู้จัดงาน:</strong> {s.organizerName} ({s.organizerEmail})
                      </p>
                      <p style={{ color: '#475569', fontSize: '0.85rem', margin: '0 0 3px 0' }}>
                        <strong>สถานที่:</strong> {s.location}
                      </p>
                      <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>
                        <strong>วันเวลาแสดง:</strong> {new Date(s.startTime).toLocaleString('th-TH')} - {new Date(s.endTime).toLocaleString('th-TH')}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="button"
                      onClick={() => handleOpenReviewModal(s)}
                      data-testid={`review-session-btn-${s.sessionId}`}
                      style={{
                        backgroundColor: '#1848ed',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <EyeIcon width={16} height={16} />
                      <span>ตรวจสอบรายละเอียดและอนุมัติ</span>
                    </button>

                    <button
                      type="button"
                      className="button"
                      onClick={() => handleApproveSession(s.sessionId, s.eventTitle)}
                      data-testid={`fast-approve-session-btn-${s.sessionId}`}
                      style={{
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      อนุมัติด่วน
                    </button>

                    <button
                      type="button"
                      onClick={() => setRejectingSessionId(s.sessionId)}
                      data-testid={`reject-session-open-btn-${s.sessionId}`}
                      style={{
                        backgroundColor: '#ffffff',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                </div>

                {/* Inline Rejection Reason Form */}
                {rejectingSessionId === s.sessionId && (
                  <div style={{ marginTop: '1rem', padding: '12px', backgroundColor: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                    <label htmlFor={`reject-pending-reason-${s.sessionId}`} style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px', color: '#991b1b' }}>
                      ระบุเหตุผลในการปฏิเสธคำขอเปิดรอบการแสดง:
                    </label>
                    <input
                      id={`reject-pending-reason-${s.sessionId}`}
                      data-testid={`reject-pending-reason-input-${s.sessionId}`}
                      type="text"
                      value={pendingRejectionReason}
                      onChange={e => setPendingRejectionReason(e.target.value)}
                      placeholder="เช่น ข้อมูลรอบการแสดงไม่ครบถ้วน, เอกสารหรือใบอนุญาตไม่สมบูรณ์"
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #fca5a5', fontSize: '13px', marginBottom: '8px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingSessionId(null);
                          setPendingRejectionReason('');
                        }}
                        style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '5px 12px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectPendingSession(s.sessionId)}
                        data-testid={`confirm-reject-pending-btn-${s.sessionId}`}
                        disabled={submittingApproval}
                        style={{ backgroundColor: '#b91c1c', color: '#ffffff', border: 'none', padding: '5px 14px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        {submittingApproval ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Full Concert Review Modal (D-219) */}
        {reviewingSession && (
          <div
            className="admin-review-modal-backdrop"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem',
            }}
          >
            <div
              className="admin-review-modal-dialog"
              data-testid="admin-full-concert-review-modal"
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '850px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                border: '1px solid #cbd5e1',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Modal Header */}
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: 700 }}>
                    ตรวจสอบรายละเอียดคอนเสิร์ตเพื่ออนุมัติเปิดขาย (Full Concert Review)
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                    งาน: {reviewingSession.eventTitle} | ผู้จัด: {reviewingSession.organizerName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewingSession(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
                  aria-label="ปิดหน้าต่างตรวจสอบ"
                >
                  <XIcon width={22} height={22} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {loadingReviewDetails ? (
                  <p style={{ textAlign: 'center', color: '#64748b' }}>กำลังโหลดรายละเอียดงานคอนเสิร์ต...</p>
                ) : (
                  <>
                    {/* Zone 1: Basic Info & Commercial Governance */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.25rem', alignItems: 'flex-start' }}>
                      <div>
                        {reviewingSession.posterUrl ? (
                          // biome-ignore lint/performance/noImgElement: dynamic user-uploaded poster display
                          <img
                            src={reviewingSession.posterUrl}
                            alt={reviewingSession.eventTitle}
                            style={{ width: '100%', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ height: '220px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                            <TicketIcon style={{ width: 48, height: 48 }} />
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.88rem' }}>
                        <div>
                          <strong style={{ color: '#64748b', display: 'block', fontSize: '0.78rem' }}>สถานที่จัดงาน</strong>
                          <span style={{ color: '#0f172a', fontWeight: 600 }}>{reviewingSession.location}</span>
                          {reviewingEventDetails?.googleMapsUrl && (
                            <a href={reviewingEventDetails.googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginLeft: '6px', fontSize: '0.8rem', color: '#1848ed' }}>
                              [ดูแผนที่ Google Maps]
                            </a>
                          )}
                        </div>

                        <div>
                          <strong style={{ color: '#64748b', display: 'block', fontSize: '0.78rem' }}>การจำกัดอายุผู้ชม</strong>
                          <span style={{ color: '#0f172a', fontWeight: 600 }}>
                            {reviewingEventDetails?.ageRestriction === '18+' ? 'จำกัดอายุ 18 ปีบริบูรณ์ขึ้นไป (18+)' : reviewingEventDetails?.ageRestriction === '20+' ? 'จำกัดอายุ 20 ปีบริบูรณ์ขึ้นไป (20+)' : 'ไม่จำกัดอายุ (All Ages)'}
                          </span>
                        </div>

                        <div>
                          <strong style={{ color: '#64748b', display: 'block', fontSize: '0.78rem' }}>นโยบายการคืนเงิน</strong>
                          <span style={{ color: '#0f172a' }}>
                            {reviewingEventDetails?.refundPolicy || reviewingSession.refundPolicy || 'ขอคืนเงินได้ตามเงื่อนไขล่วงหน้าอย่างน้อย 7 วันก่อนวันแสดง'}
                          </span>
                        </div>

                        <div>
                          <strong style={{ color: '#64748b', display: 'block', fontSize: '0.78rem' }}>บัญชีธนาคารสำหรับรับเงินโอน</strong>
                          <span style={{ color: '#0f172a', fontWeight: 600 }}>
                            {reviewingEventDetails?.payoutBankName || reviewingSession.payoutBankName || 'ธนาคารกสิกรไทย (KBANK)'} {reviewingEventDetails?.payoutAccountNumber || reviewingSession.payoutAccountNumber || '123-4-56789-0'}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.8rem', color: '#64748b' }}>
                            ชื่อบัญชี: {reviewingEventDetails?.payoutAccountName || reviewingSession.payoutAccountName || reviewingSession.organizerName}
                          </span>
                        </div>

                        {reviewingEventDetails?.entryGuidelines && (
                          <div>
                            <strong style={{ color: '#64748b', display: 'block', fontSize: '0.78rem' }}>กติกาการเข้างาน</strong>
                            <p style={{ margin: 0, color: '#334155', fontSize: '0.82rem' }}>{reviewingEventDetails.entryGuidelines}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Zone 2: Sessions & Ticket Tiers */}
                    <div style={{ marginTop: '0.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <strong style={{ display: 'block', fontSize: '0.92rem', color: '#0f172a', marginBottom: '0.5rem' }}>
                        รอบการแสดงและประเภทบัตร (Sessions & Ticket Tiers)
                      </strong>
                      {reviewingEventDetails?.sessions?.map((sess: ReviewingSession, sIdx: number) => (
                        <div key={sess.id} style={{ marginBottom: sIdx < reviewingEventDetails.sessions.length - 1 ? '0.75rem' : 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                            รอบที่ {sIdx + 1}: {new Date(sess.startTime).toLocaleString('th-TH')} - {new Date(sess.endTime).toLocaleString('th-TH')}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                            {sess.ticketTypes?.map((tt: ReviewingTicketType) => (
                              <div key={tt.id} style={{ background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: tt.isStudentPrivilege ? '1px solid #93c5fd' : '1px solid #cbd5e1', fontSize: '0.82rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <strong style={{ color: '#0f172a' }}>{tt.name}</strong>
                                  {tt.isStudentPrivilege && (
                                    <span style={{ fontSize: '0.7rem', background: '#eff6ff', color: '#1848ed', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>
                                      สิทธิ์ ม.อุบล
                                    </span>
                                  )}
                                </div>
                                <div style={{ color: '#475569', marginTop: '2px' }}>
                                  {formatBaht(tt.price)} (โควตา {Number(tt.quota).toLocaleString()} ใบ)
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Zone 3: Custom Fee Adjustment Hub (D-219) */}
                    <div
                      className="admin-fee-adjustment-box"
                      data-testid="admin-fee-adjustment-box"
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '10px',
                        padding: '1.15rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.65rem' }}>
                        <BanknotesIcon width={20} height={20} style={{ color: '#166534' }} />
                        <strong style={{ fontSize: '0.95rem', color: '#166534' }}>
                          กำหนดอัตราค่าบริการและเงื่อนไขการเงิน (Platform Fee Settings — D-219)
                        </strong>
                      </div>
                      <p style={{ margin: '0 0 0.85rem', fontSize: '0.82rem', color: '#374151' }}>
                        ปรับแต่งอัตราค่าบริการฝั่งผู้จัดงานและอัตราเงินสำรองฉุกเฉินเฉพาะงานนี้ได้ก่อนอนุมัติ ค่าที่กำหนดจะถูกนำไปคิดคำนวณในรายงานการเงินและการโอนเงิน
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <div>
                          <label htmlFor="custom-organizer-fee" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                            อัตราค่าบริการแพลตฟอร์ม (%) *
                          </label>
                          <input
                            id="custom-organizer-fee"
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={customFeeRate}
                            onChange={e => setCustomFeeRate(Number(e.target.value))}
                            data-testid="custom-organizer-fee-input"
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem', fontWeight: 600 }}
                          />
                          <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px', display: 'block' }}>
                            * ค่าเริ่มต้นมาตรฐาน 3.00%
                          </small>
                        </div>

                        <div>
                          <label htmlFor="custom-reserve-percentage" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                            อัตราเงินสำรองฉุกเฉิน (%)
                          </label>
                          <input
                            id="custom-reserve-percentage"
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={customReserveRate}
                            onChange={e => setCustomReserveRate(Number(e.target.value))}
                            data-testid="custom-reserve-percentage-input"
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem', fontWeight: 600 }}
                          />
                          <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px', display: 'block' }}>
                            * ค่าเริ่มต้น 0.00% (กันเงินสำรองตามนโยบาย)
                          </small>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                            <input
                              type="checkbox"
                              checked={reviewUbuMode}
                              onChange={e => setReviewUbuMode(e.target.checked)}
                              data-testid="admin-review-ubu-toggle"
                              style={{ width: '16px', height: '16px' }}
                            />
                            <span>เปิดรับสิทธิ์ ม.อุบล (@ubu.ac.th)</span>
                          </label>
                          <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
                            ตรวจสอบสิทธิ์นักศึกษาผ่าน OTP อัตโนมัติ
                          </small>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setRejectingSessionId(reviewingSession.sessionId)}
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#b91c1c',
                    border: '1px solid #fca5a5',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ปฏิเสธคำขอ
                </button>

                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <button
                    type="button"
                    onClick={() => setReviewingSession(null)}
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    ปิด
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApproveWithFee(reviewingSession.sessionId)}
                    disabled={submittingApproval}
                    data-testid="admin-approve-concert-btn"
                    style={{
                      backgroundColor: '#1848ed',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 20px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircleIcon width={16} height={16} />
                    <span>{submittingApproval ? 'กำลังบันทึก...' : 'อนุมัติคอนเสิร์ตและเปิดขายทันที'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
