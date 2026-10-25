'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SessionAmendmentRecord, SessionCancellationRecord } from '@/server/events';
import { formatBaht, formatDateTime } from '@/lib/locale';
import { CheckCircleIcon, ClockIcon } from './icons';
import { AlertIcon } from './alert-icon';

interface PendingSession {
  sessionId: string;
  startTime: string;
  endTime: string;
  sessionStatus: string;
  eventId: string;
  eventTitle: string;
  location: string;
  posterUrl?: string | null;
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
                          backgroundColor: '#dc2626',
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
                        backgroundColor: '#1848ed',
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
          คำขอยกเลิกรอบการแสดงที่รอการอนุมัติ (Session Cancellations — AC-35, AC-108)
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
                        color: '#b91c1c',
                        border: '1px solid #fca5a5',
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
                        backgroundColor: '#dc2626',
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
                        style={{ backgroundColor: '#b91c1c', color: '#ffffff', border: 'none', padding: '4px 12px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
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

      {/* 3. New Sessions Waiting Approval */}
      <div>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
          รอบการแสดงใหม่ที่รออนุมัติเปิดขาย (New Sessions)
        </h3>

        {loading ? (
          <p style={{ color: '#888' }}>กำลังโหลดรายการรออนุมัติ...</p>
        ) : sessions.length === 0 ? (
          <p style={{ color: '#888', fontSize: '0.9rem' }}>ไม่มีรอบการแสดงใหม่ที่รอการอนุมัติในขณะนี้</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {sessions.map(s => (
              <div
                key={s.sessionId}
                className="pending-session-card"
                style={{
                  padding: '1rem',
                  border: '1px solid #444',
                  borderRadius: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', margin: '0 0 4px 0' }}>{s.eventTitle}</h4>
                    <p style={{ color: '#aaa', fontSize: '0.9rem', margin: '0 0 2px 0' }}>
                      ผู้จัดงาน: {s.organizerName} ({s.organizerEmail})
                    </p>
                    <p style={{ color: '#aaa', fontSize: '0.9rem', margin: '0 0 2px 0' }}>
                      สถานที่: {s.location}
                    </p>
                    <p style={{ color: '#aaa', fontSize: '0.9rem', margin: 0 }}>
                      เวลา: {new Date(s.startTime).toLocaleString('th-TH')} - {new Date(s.endTime).toLocaleString('th-TH')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => handleApproveSession(s.sessionId, s.eventTitle)}
                  >
                    อนุมัติรอบนี้
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
