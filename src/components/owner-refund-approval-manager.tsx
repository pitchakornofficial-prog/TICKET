'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { OwnerRefundRequestItem } from '@/server/refunds';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { CheckCircleIcon, ClockIcon, RefreshIcon } from './icons';
import { AlertIcon } from './alert-icon';

export function OwnerRefundApprovalManager() {
  const [requests, setRequests] = useState<OwnerRefundRequestItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'completed' | 'all'>('pending');
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Rejection state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Transfer completion state (AC-37, AC-92)
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [transferNote, setTransferNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Transfer failure state (AC-93)
  const [failureRecordingId, setFailureRecordingId] = useState<string | null>(null);
  const [transferFailureReason, setTransferFailureReason] = useState('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const activeFetchIdRef = useRef(0);

  const fetchRequests = useCallback(async (preserveFeedback = false) => {
    const fetchId = ++activeFetchIdRef.current;
    setIsLoading(true);
    if (!preserveFeedback) {
      setFeedback(null);
    }
    try {
      const res = await fetch(`/api/owner/refunds?status=${filterStatus}`);
      if (fetchId !== activeFetchIdRef.current) return;
      if (!res.ok) {
        const data = await res.json();
        setFeedback({ type: 'error', message: data.message || 'ไม่สามารถโหลดรายการคำขอคืนเงินได้' });
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      if (fetchId !== activeFetchIdRef.current) return;
      setRequests(data.requests || []);
      setIsLoading(false);
    } catch {
      if (fetchId !== activeFetchIdRef.current) return;
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง' });
      setIsLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (requestId: string) => {
    setProcessingId(requestId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/owner/refunds/${requestId}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || 'ไม่สามารถอนุมัติการคืนเงินได้' });
        setProcessingId(null);
        return;
      }

      setFeedback({
        type: 'success',
        message: data.message || 'อนุมัติการคืนเงินสำเร็จ เพิกถอนสิทธิ์บัตรและบันทึกภาระหนี้แล้ว',
      });
      setProcessingId(null);
      await fetchRequests(true);
    } catch {
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการอนุมัติการคืนเงิน' });
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!rejectionReason.trim()) {
      setFeedback({ type: 'error', message: 'กรุณาระบุเหตุผลการปฏิเสธคำขอคืนเงิน' });
      return;
    }

    setProcessingId(requestId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/owner/refunds/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || 'ไม่สามารถปฏิเสธคำขอคืนเงินได้' });
        setProcessingId(null);
        return;
      }

      setFeedback({ type: 'success', message: 'ปฏิเสธคำขอคืนเงินเรียบร้อยแล้ว' });
      setRejectingId(null);
      setRejectionReason('');
      setProcessingId(null);
      await fetchRequests(true);
    } catch {
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการปฏิเสธการคืนเงิน' });
      setProcessingId(null);
    }
  };

  const handleCompleteTransfer = async (req: OwnerRefundRequestItem) => {
    setProcessingId(req.id);
    setFeedback(null);
    try {
      let transferProofKey: string | undefined;
      let transferProofUrl: string | undefined;

      // 1. Upload proof file if selected (visibility: 'private' for AC-92)
      if (transferFile) {
        const formData = new FormData();
        formData.append('file', transferFile);
        formData.append('visibility', 'private');

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.json();
          setFeedback({ type: 'error', message: uploadErr.message || 'อัปโหลดสลิปหลักฐานไม่สำเร็จ' });
          setProcessingId(null);
          return;
        }

        const uploadData = await uploadRes.json();
        transferProofKey = uploadData.key;
        transferProofUrl = uploadData.url;
      }

      // 2. Call complete-transfer API
      const res = await fetch(`/api/owner/refunds/${req.id}/complete-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferredAmount: req.requestedAmount,
          transferProofKey,
          transferProofUrl,
          transferNote: transferNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || 'ไม่สามารถบันทึกการโอนเงินคืนได้' });
        setProcessingId(null);
        return;
      }

      setFeedback({
        type: 'success',
        message: data.message || 'บันทึกการโอนเงินคืนสำเร็จ ปรับสถานะเป็นโอนสำเร็จแล้ว (AC-37)',
      });
      setTransferringId(null);
      setTransferFile(null);
      setTransferNote('');
      setProcessingId(null);
      await fetchRequests(true);
    } catch {
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกการโอนเงินคืน' });
      setProcessingId(null);
    }
  };

  const handleRecordFailure = async (requestId: string) => {
    if (!transferFailureReason.trim()) {
      setFeedback({ type: 'error', message: 'กรุณาระบุเหตุผลที่การโอนเงินล้มเหลว' });
      return;
    }

    setProcessingId(requestId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/owner/refunds/${requestId}/record-transfer-failure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ failureReason: transferFailureReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || 'ไม่สามารถบันทึกการโอนเงินล้มเหลวได้' });
        setProcessingId(null);
        return;
      }

      setFeedback({
        type: 'success',
        message: 'บันทึกเหตุผลการโอนเงินล้มเหลวเรียบร้อยแล้ว ยอดหนี้ยังคงค้างชำระตาม AC-93',
      });
      setFailureRecordingId(null);
      setTransferFailureReason('');
      setProcessingId(null);
      await fetchRequests(true);
    } catch {
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกการโอนเงินล้มเหลว' });
      setProcessingId(null);
    }
  };

  return (
    <div
      id="owner-refund-approval-manager"
      className="owner-refund-manager-card"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 4px 0' }}>
            จัดการคำขอคืนเงินและการโอนคืน (Owner Refunds & Payouts)
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            อนุมัติคำขอคืนเงิน เพิกถอนสิทธิ์ QR บันทึกการโอนเงินนอกระบบ พร้อมจัดเก็บหลักฐานแบบส่วนตัวเฉพาะผู้ดูแล
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setFilterStatus('pending')}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 'bold',
              borderRadius: '6px',
              border: filterStatus === 'pending' ? '1px solid #1848ed' : '1px solid #cbd5e1',
              backgroundColor: filterStatus === 'pending' ? '#eff6ff' : '#ffffff',
              color: filterStatus === 'pending' ? '#1848ed' : '#475569',
              cursor: 'pointer',
            }}
          >
            รอตรวจสอบ
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('approved')}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 'bold',
              borderRadius: '6px',
              border: filterStatus === 'approved' ? '1px solid #1848ed' : '1px solid #cbd5e1',
              backgroundColor: filterStatus === 'approved' ? '#eff6ff' : '#ffffff',
              color: filterStatus === 'approved' ? '#1848ed' : '#475569',
              cursor: 'pointer',
            }}
          >
            รอโอนเงินคืน (Approved)
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('completed')}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 'bold',
              borderRadius: '6px',
              border: filterStatus === 'completed' ? '1px solid #1848ed' : '1px solid #cbd5e1',
              backgroundColor: filterStatus === 'completed' ? '#eff6ff' : '#ffffff',
              color: filterStatus === 'completed' ? '#1848ed' : '#475569',
              cursor: 'pointer',
            }}
          >
            โอนสำเร็จแล้ว (Completed)
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 'bold',
              borderRadius: '6px',
              border: filterStatus === 'all' ? '1px solid #1848ed' : '1px solid #cbd5e1',
              backgroundColor: filterStatus === 'all' ? '#eff6ff' : '#ffffff',
              color: filterStatus === 'all' ? '#1848ed' : '#475569',
              cursor: 'pointer',
            }}
          >
            ทั้งหมด
          </button>
          <button
            type="button"
            onClick={() => fetchRequests(false)}
            disabled={isLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              fontSize: '13px',
              color: '#475569',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshIcon />
            {isLoading ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          id="owner-refund-feedback-banner"
          style={{
            backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: feedback.type === 'success' ? '#166534' : '#991b1b',
          }}
        >
          {feedback.type === 'success' ? <CheckCircleIcon /> : <AlertIcon />}
          <span>{feedback.message}</span>
        </div>
      )}

      {requests.length === 0 ? (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            color: '#64748b',
            fontSize: '14px',
          }}
        >
          {filterStatus === 'pending' && 'ไม่มีคำขอคืนเงินที่รอการตรวจสอบในขณะนี้'}
          {filterStatus === 'approved' && 'ไม่มีรายการที่รอการโอนเงินในขณะนี้'}
          {filterStatus === 'completed' && 'ยังไม่มีรายการที่โอนสำเร็จ'}
          {filterStatus === 'all' && 'ยังไม่มีประวัติคำขอคืนเงินในระบบ'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {requests.map(req => {
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const isCompleted = req.status === 'completed';
            const isRejected = req.status === 'rejected';
            const isProcessing = processingId === req.id;
            const isRejecting = rejectingId === req.id;
            const isTransferring = transferringId === req.id;
            const isRecordingFailure = failureRecordingId === req.id;

            return (
              <div
                key={req.id}
                id={`refund-card-${req.id}`}
                className="refund-request-card"
                style={{
                  border: isPending
                    ? '1px solid #cbd5e1'
                    : isApproved
                      ? '1px solid #93c5fd'
                      : isCompleted
                        ? '1px solid #86efac'
                        : '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '16px',
                  backgroundColor: isPending ? '#ffffff' : '#f8fafc',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
                        {req.id}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        (คำสั่งซื้อ: {req.orderId})
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1848ed' }}>
                      {req.eventTitle}
                    </div>
                  </div>

                  <div>
                    {isPending && (
                      <span
                        style={{
                          backgroundColor: '#fef3c7',
                          color: '#92400e',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <ClockIcon /> รอการตรวจสอบ (pending)
                      </span>
                    )}
                    {isApproved && (
                      <span
                        style={{
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <ClockIcon /> อนุมัติแล้ว — รอโอนเงิน (approved)
                      </span>
                    )}
                    {isCompleted && (
                      <span
                        style={{
                          backgroundColor: '#dcfce7',
                          color: '#166534',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckCircleIcon /> โอนสำเร็จแล้ว (completed)
                      </span>
                    )}
                    {isRejected && (
                      <span
                        style={{
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <AlertIcon /> ปฏิเสธ (rejected)
                      </span>
                    )}
                  </div>
                </div>

                {/* Details grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    fontSize: '13px',
                    color: '#334155',
                    marginBottom: '12px',
                    backgroundColor: '#f1f5f9',
                    padding: '12px',
                    borderRadius: '6px',
                  }}
                >
                  <div>
                    <strong>ผู้ซื้อ:</strong> {req.buyerName}
                    <div style={{ color: '#64748b', fontSize: '12px' }}>
                      {req.buyerEmail} · {req.buyerPhone}
                    </div>
                  </div>

                  <div>
                    <strong>ยอดเงินขอคืน (Face Value):</strong>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1848ed' }}>
                      {formatBaht(req.requestedAmount)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {req.items && req.items.length > 0
                        ? `(เฉพาะราคาบัตร ${req.items.length} ใบ ไม่รวมค่าบริการ)`
                        : '(คืนเงินคำสั่งซื้อที่ยกเลิกรอบก่อนออกบัตร)'}
                    </div>
                  </div>

                  <div>
                    <strong>บัญชีรับเงินโอน:</strong>
                    <div>{req.bankName || 'ไม่ระบุธนาคาร'}</div>
                    <div style={{ fontFamily: 'monospace' }}>{req.bankAccountNo || '-'}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>ชื่อ: {req.bankAccountName || '-'}</div>
                  </div>

                  <div>
                    <strong>วันที่ยื่น:</strong>
                    <div>{formatDate(new Date(req.submittedAt))}</div>
                    <div style={{ color: '#64748b', fontSize: '12px' }}>เวลา {formatTime(new Date(req.submittedAt))}</div>
                  </div>
                </div>

                {/* Tickets list */}
                {req.items && req.items.length > 0 && (
                  <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                    <strong>บัตรที่ขอคืน ({req.items.length} ใบ): </strong>
                    <span style={{ color: '#0f172a' }}>
                      {req.items.map(it => `${it.ticketCode} (${formatBaht(it.ticketPrice)})`).join(', ')}
                    </span>
                  </div>
                )}

                {req.reason && (
                  <div style={{ marginBottom: '12px', fontSize: '13px', color: '#475569' }}>
                    <strong>เหตุผลที่ขอคืน:</strong> {req.reason}
                  </div>
                )}

                {/* Transfer failure warning if present (AC-93) */}
                {isApproved && req.transferFailureReason && (
                  <div
                    style={{
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      marginBottom: '12px',
                      fontSize: '13px',
                      color: '#991b1b',
                    }}
                  >
                    <strong>การโอนเงินครั้งก่อนล้มเหลว (AC-93):</strong> {req.transferFailureReason}
                    <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
                      (ภาระหนี้ยังคงค้างชำระ &quot;unpaid&quot; บัตรยังคงถูกเพิกถอน ไม่ถูกฟื้นฟูกลับมา)
                    </div>
                  </div>
                )}

                {/* Completed transfer details & proof link (AC-37, AC-92) */}
                {isCompleted && (
                  <div
                    style={{
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '6px',
                      padding: '12px',
                      marginBottom: '12px',
                      fontSize: '13px',
                      color: '#166534',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                      ข้อมูลการโอนเงินคืน (Manual Transfer Completed)
                    </div>
                    <div>
                      ยอดเงินโอน: <strong>{formatBaht(req.transferredAmount ?? req.requestedAmount)}</strong>
                      {req.transferredAt && (
                        <span>
                          {' '}เมื่อ {formatDate(new Date(req.transferredAt))} {formatTime(new Date(req.transferredAt))}
                        </span>
                      )}
                    </div>
                    {req.transferNote && (
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>
                        บันทึก: {req.transferNote}
                      </div>
                    )}
                    {req.transferProofKey && (
                      <div style={{ marginTop: '8px' }}>
                        <a
                          href={`/api/owner/refunds/${req.id}/proof`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`view-proof-btn-${req.id}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: '#ffffff',
                            color: '#1848ed',
                            border: '1px solid #93c5fd',
                            borderRadius: '4px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            textDecoration: 'none',
                          }}
                        >
                          เปิดดูหลักฐานการโอน (สิทธิ์เฉพาะ Owner — AC-92)
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Review status details */}
                {req.reviewedByName && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                    อนุมัติ/ตรวจสอบโดย: {req.reviewedByName}
                    {req.reviewedAt && ` เมื่อ ${formatDate(new Date(req.reviewedAt))} ${formatTime(new Date(req.reviewedAt))}`}
                  </div>
                )}

                {req.rejectionReason && (
                  <div style={{ fontSize: '12px', color: '#991b1b', marginBottom: '8px' }}>
                    <strong>เหตุผลที่ปฏิเสธ:</strong> {req.rejectionReason}
                  </div>
                )}

                {/* Actions for pending requests (AC-36) */}
                {isPending && (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px' }}>
                    {isRejecting ? (
                      <div>
                        <label
                          htmlFor={`reject-reason-${req.id}`}
                          style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#991b1b', marginBottom: '4px' }}
                        >
                          ระบุเหตุผลการปฏิเสธคำขอคืนเงิน <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          id={`reject-reason-${req.id}`}
                          type="text"
                          value={rejectionReason}
                          onChange={e => setRejectionReason(e.target.value)}
                          placeholder="เช่น ตรวจพบว่าบัตรเคยสแกนเข้างานแล้ว หรือพ้นกำหนดเวลา"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '13px',
                            marginBottom: '8px',
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleReject(req.id)}
                            disabled={isProcessing}
                            data-testid={`confirm-reject-btn-${req.id}`}
                            style={{
                              backgroundColor: '#dc2626',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 14px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isProcessing ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(null);
                              setRejectionReason('');
                            }}
                            disabled={isProcessing}
                            style={{
                              backgroundColor: '#ffffff',
                              color: '#475569',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '6px 14px',
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          * การอนุมัติจะเพิกถอนสิทธิ์บัตรและ QR Code ทันที และคืนโควตาสู่รอบหากรอบยังเปิดขายอยู่ (AC-36, AC-90)
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setRejectingId(req.id)}
                            disabled={isProcessing}
                            data-testid={`reject-refund-btn-${req.id}`}
                            style={{
                              backgroundColor: '#ffffff',
                              color: '#b91c1c',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              padding: '6px 14px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ปฏิเสธคำขอ
                          </button>

                          <button
                            type="button"
                            onClick={() => handleApprove(req.id)}
                            disabled={isProcessing}
                            data-testid={`approve-refund-btn-${req.id}`}
                            style={{
                              backgroundColor: '#1848ed',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 16px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              opacity: isProcessing ? 0.7 : 1,
                            }}
                          >
                            <CheckCircleIcon />
                            {isProcessing ? 'กำลังอนุมัติ...' : 'อนุมัติการคืนเงิน (AC-36)'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions for approved requests: Complete transfer (AC-37) or Record failure (AC-93) */}
                {isApproved && (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px' }}>
                    {isTransferring ? (
                      <div
                        style={{
                          backgroundColor: '#f8fafc',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '16px',
                        }}
                      >
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
                          บันทึกการโอนเงินคืนจริง (Manual Transfer — AC-37, AC-92)
                        </h4>
                        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b' }}>
                          ระบุข้อมูลการโอนเงินนอกระบบและแนบไฟล์สลิปหลักฐาน ไฟล์จะถูกจัดเก็บแบบส่วนตัว (Private) เข้าถึงได้เฉพาะ Owner
                        </p>

                        <div style={{ marginBottom: '12px' }}>
                          <label
                            htmlFor={`transfer-file-${req.id}`}
                            style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}
                          >
                            แนบสลิป/หลักฐานการโอน (PNG, JPG, PDF)
                          </label>
                          <input
                            id={`transfer-file-${req.id}`}
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.pdf"
                            onChange={e => setTransferFile(e.target.files?.[0] || null)}
                            data-testid={`transfer-file-input-${req.id}`}
                            style={{ fontSize: '13px' }}
                          />
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                          <label
                            htmlFor={`transfer-note-${req.id}`}
                            style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}
                          >
                            บันทึกเพิ่มเติม (ไม่บังคับ)
                          </label>
                          <input
                            id={`transfer-note-${req.id}`}
                            type="text"
                            value={transferNote}
                            onChange={e => setTransferNote(e.target.value)}
                            placeholder="เช่น โอนผ่าน KBank เลขอ้างอิง 123456"
                            data-testid={`transfer-note-input-${req.id}`}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '13px',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleCompleteTransfer(req)}
                            disabled={isProcessing}
                            data-testid={`confirm-complete-transfer-btn-${req.id}`}
                            style={{
                              backgroundColor: '#16a34a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '8px 16px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <CheckCircleIcon />
                            {isProcessing ? 'กำลังบันทึก...' : `ยืนยันบันทึกโอนสำเร็จ (${formatBaht(req.requestedAmount)})`}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTransferringId(null);
                              setTransferFile(null);
                              setTransferNote('');
                            }}
                            disabled={isProcessing}
                            style={{
                              backgroundColor: '#ffffff',
                              color: '#475569',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '8px 16px',
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : isRecordingFailure ? (
                      <div
                        style={{
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          padding: '16px',
                        }}
                      >
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#991b1b' }}>
                          บันทึกการโอนเงินล้มเหลว (AC-93)
                        </h4>
                        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#b91c1c' }}>
                          ระบุสาเหตุที่โอนเงินไม่สำเร็จ ระบบจะคงสถานะรอโอน (approved) และหนี้ค้างชำระ (unpaid) โดยบัตรยังคงถูกเพิกถอนสิทธิ์ตามเดิม
                        </p>

                        <div style={{ marginBottom: '12px' }}>
                          <label
                            htmlFor={`failure-reason-${req.id}`}
                            style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#991b1b', marginBottom: '4px' }}
                          >
                            สาเหตุการโอนล้มเหลว <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <input
                            id={`failure-reason-${req.id}`}
                            type="text"
                            value={transferFailureReason}
                            onChange={e => setTransferFailureReason(e.target.value)}
                            placeholder="เช่น เลขที่บัญชีปลายทางไม่ถูกต้อง หรือบัญชีปิดใช้งาน"
                            data-testid={`failure-reason-input-${req.id}`}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '13px',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleRecordFailure(req.id)}
                            disabled={isProcessing}
                            data-testid={`confirm-record-failure-btn-${req.id}`}
                            style={{
                              backgroundColor: '#dc2626',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '8px 16px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isProcessing ? 'กำลังบันทึก...' : 'ยืนยันบันทึกโอนล้มเหลว'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFailureRecordingId(null);
                              setTransferFailureReason('');
                            }}
                            disabled={isProcessing}
                            style={{
                              backgroundColor: '#ffffff',
                              color: '#475569',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '8px 16px',
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          * อนุมัติคืนเงินแล้ว อยู่ระหว่างดำเนินการโอนเงินคืนเข้าบัญชีผู้ซื้อ (ภาระหนี้: {req.liabilityStatus || 'unpaid'})
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setFailureRecordingId(req.id)}
                            disabled={isProcessing}
                            data-testid={`record-failure-btn-${req.id}`}
                            style={{
                              backgroundColor: '#ffffff',
                              color: '#b91c1c',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              padding: '6px 14px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            บันทึกโอนล้มเหลว (AC-93)
                          </button>

                          <button
                            type="button"
                            onClick={() => setTransferringId(req.id)}
                            disabled={isProcessing}
                            data-testid={`open-transfer-btn-${req.id}`}
                            style={{
                              backgroundColor: '#16a34a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 16px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <CheckCircleIcon />
                            บันทึกการโอนเงิน (AC-37)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
