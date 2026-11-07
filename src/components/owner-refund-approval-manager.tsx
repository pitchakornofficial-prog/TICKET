'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { OwnerRefundRequestItem } from '@/server/refunds';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import {
  CheckCircleIcon,
  RefreshIcon,
  SearchIcon,
  XIcon,
  DownloadIcon,
  EyeIcon,
} from './icons';
import { AlertIcon } from './alert-icon';

const SAMPLE_MOCK_REFUNDS: OwnerRefundRequestItem[] = [
  {
    id: 'REF-20261106-001',
    orderId: 'ORD-20261028-0842',
    eventId: 'mock-freshy-fest',
    eventTitle: 'เทศกาลดนตรีต้อนรับน้องใหม่ UBU Freshy Fest 2026',
    sessionId: 'sess-freshy-1',
    sessionStatus: 'published',
    buyerEmail: 'somchai.r@ubu.ac.th',
    buyerPhone: '0812345678',
    buyerName: 'สมชาย รักสงบ',
    requestedAmount: 1600,
    reason: 'ติดภารกิจด่วนช่วงเวลาการแสดง ไม่สามารถเดินทางมาร่วมงานได้',
    status: 'pending',
    bankName: 'ธนาคารกสิกรไทย',
    bankAccountNo: '123-2-34567-8',
    bankAccountName: 'สมชาย รักสงบ',
    submittedAt: '2026-11-05T14:20:00.000Z',
    reviewedAt: null,
    reviewedByName: null,
    rejectionReason: null,
    transferredAt: null,
    transferredAmount: null,
    transferProofKey: null,
    transferProofUrl: null,
    transferNote: null,
    transferFailureReason: null,
    transferFailedAt: null,
    liabilityStatus: null,
    items: [],
  },
  {
    id: 'REF-20261106-002',
    orderId: 'ORD-20261029-0115',
    eventId: 'mock-live-event-1',
    eventTitle: 'Isan Sound & Rhythm Music Festival 2026',
    sessionId: 'sess-isan-1',
    sessionStatus: 'published',
    buyerEmail: 'kanda.j@gmail.com',
    buyerPhone: '0898765432',
    buyerName: 'กานดา ใจดี',
    requestedAmount: 1200,
    reason: 'ขอคืนเงินตามนโยบาย Special Refund Window จากการเลื่อนวันแสดง',
    status: 'approved',
    bankName: 'ธนาคารไทยพาณิชย์',
    bankAccountNo: '987-1-65432-1',
    bankAccountName: 'กานดา ใจดี',
    submittedAt: '2026-11-04T10:15:00.000Z',
    reviewedAt: '2026-11-05T09:30:00.000Z',
    reviewedByName: 'เจ้าของระบบ (Admin)',
    rejectionReason: null,
    transferredAt: null,
    transferredAmount: null,
    transferProofKey: null,
    transferProofUrl: null,
    transferNote: null,
    transferFailureReason: null,
    transferFailedAt: null,
    liabilityStatus: 'unpaid',
    items: [],
  },
  {
    id: 'REF-20261106-003',
    orderId: 'ORD-20261030-0450',
    eventId: 'mock-rock-rimmool',
    eventTitle: 'Rock Rimmool Live Festival 2026',
    sessionId: 'sess-rock-1',
    sessionStatus: 'published',
    buyerEmail: 'piyapat.m@gmail.com',
    buyerPhone: '0865551234',
    buyerName: 'ปิยะภัทร มีสุข',
    requestedAmount: 2000,
    reason: 'ขอยกเลิกตั๋วคอนเสิร์ตรอบแสดงฉุกเฉิน',
    status: 'completed',
    bankName: 'ธนาคารกรุงเทพ',
    bankAccountNo: '456-3-78901-2',
    bankAccountName: 'ปิยะภัทร มีสุข',
    submittedAt: '2026-11-02T16:00:00.000Z',
    reviewedAt: '2026-11-03T11:00:00.000Z',
    reviewedByName: 'เจ้าของระบบ (Admin)',
    rejectionReason: null,
    transferredAt: '2026-11-04T13:45:00.000Z',
    transferredAmount: 2000,
    transferProofKey: 'private/proof-003.jpg',
    transferProofUrl: '/api/owner/refunds/REF-20261106-003/proof',
    transferNote: 'โอนผ่าน KBank Mobile Banking อ้างอิง 998877',
    transferFailureReason: null,
    transferFailedAt: null,
    liabilityStatus: 'settled',
    items: [],
  },
];

export function OwnerRefundApprovalManager() {
  const [requests, setRequests] = useState<OwnerRefundRequestItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'completed' | 'all'>('pending');
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Search and Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'amount_desc' | 'alphabetical'>('latest');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Inspect detail modal
  const [inspectingReq, setInspectingReq] = useState<OwnerRefundRequestItem | null>(null);

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

    if (requestId.startsWith('REF-20261106-')) {
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'approved' as const, reviewedAt: new Date().toISOString() } : r)),
      );
      setFeedback({
        type: 'success',
        message: 'อนุมัติการคืนเงินสำเร็จ เพิกถอนสิทธิ์บัตรและบันทึกภาระหนี้แล้ว (จำลองการทำงาน)',
      });
      setProcessingId(null);
      return;
    }

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

    if (requestId.startsWith('REF-20261106-')) {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId ? { ...r, status: 'rejected' as const, rejectionReason: rejectionReason.trim() } : r,
        ),
      );
      setFeedback({ type: 'success', message: 'ปฏิเสธคำขอคืนเงินเรียบร้อยแล้ว (จำลองการทำงาน)' });
      setRejectingId(null);
      setRejectionReason('');
      setProcessingId(null);
      return;
    }

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

    if (req.id.startsWith('REF-20261106-')) {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === req.id
            ? {
                ...r,
                status: 'completed' as const,
                transferredAt: new Date().toISOString(),
                transferredAmount: req.requestedAmount,
                transferNote: transferNote.trim() || 'บันทึกการโอนเงินคืนสำเร็จ',
              }
            : r,
        ),
      );
      setFeedback({
        type: 'success',
        message: 'บันทึกการโอนเงินคืนสำเร็จ ปรับสถานะเป็นโอนสำเร็จแล้ว (AC-37) (จำลองการทำงาน)',
      });
      setTransferringId(null);
      setTransferFile(null);
      setTransferNote('');
      setProcessingId(null);
      return;
    }

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

    if (requestId.startsWith('REF-20261106-')) {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, transferFailureReason: transferFailureReason.trim() }
            : r,
        ),
      );
      setFeedback({
        type: 'success',
        message: 'บันทึกเหตุผลการโอนเงินล้มเหลวเรียบร้อยแล้ว ยอดหนี้ยังคงค้างชำระตาม AC-93 (จำลองการทำงาน)',
      });
      setFailureRecordingId(null);
      setTransferFailureReason('');
      setProcessingId(null);
      return;
    }

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

  // Combine real requests with sample mock data fallback if real list is empty
  const allAvailableRequests = useMemo(() => {
    if (requests.length > 0) return requests;
    return SAMPLE_MOCK_REFUNDS;
  }, [requests]);

  // Tab Filtering
  const pendingRequests = useMemo(() => {
    return allAvailableRequests.filter((r) => r.status === 'pending');
  }, [allAvailableRequests]);

  const approvedRequests = useMemo(() => {
    return allAvailableRequests.filter((r) => r.status === 'approved');
  }, [allAvailableRequests]);

  const completedRequests = useMemo(() => {
    return allAvailableRequests.filter((r) => r.status === 'completed' || r.status === 'rejected');
  }, [allAvailableRequests]);

  // Active Tab Dataset
  const activeTabDataset = useMemo(() => {
    if (filterStatus === 'pending') return pendingRequests;
    if (filterStatus === 'approved') return approvedRequests;
    if (filterStatus === 'completed') return completedRequests;
    return allAvailableRequests;
  }, [filterStatus, pendingRequests, approvedRequests, completedRequests, allAvailableRequests]);

  // Search Filter
  const filteredDataset = useMemo(() => {
    if (!searchQuery.trim()) return activeTabDataset;
    const q = searchQuery.toLowerCase().trim();
    return activeTabDataset.filter((r) => {
      const idMatch = r.id.toLowerCase().includes(q);
      const orderMatch = r.orderId.toLowerCase().includes(q);
      const eventMatch = r.eventTitle.toLowerCase().includes(q);
      const buyerMatch = r.buyerName.toLowerCase().includes(q) || r.buyerEmail.toLowerCase().includes(q);
      const bankMatch = r.bankName?.toLowerCase().includes(q) || r.bankAccountNo?.includes(q);
      return idMatch || orderMatch || eventMatch || buyerMatch || bankMatch;
    });
  }, [activeTabDataset, searchQuery]);

  // Sort
  const sortedDataset = useMemo(() => {
    const list = [...filteredDataset];
    if (sortBy === 'amount_desc') {
      return list.sort((a, b) => b.requestedAmount - a.requestedAmount);
    }
    if (sortBy === 'alphabetical') {
      return list.sort((a, b) => a.eventTitle.localeCompare(b.eventTitle, 'th'));
    }
    return list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [filteredDataset, sortBy]);

  // Counts for tabs
  const pendingCount = pendingRequests.length;
  const approvedCount = approvedRequests.length;
  const completedCount = completedRequests.length;

  return (
    <div id="owner-refund-approval-manager" className="owner-refund-management-hub">
      {/* 1. Header & Title Bar (D-247 Flat Canvas) */}
      <div className="hub-top-bar">
        <div className="hub-header-left">
          <h2 className="pipeline-title">จัดการคำขอคืนเงินและการโอนคืน (Owner Refunds & Payouts)</h2>
          <p className="pipeline-subtitle">
            ตรวจสอบคำขอคืนเงิน เพิกถอนสิทธิ์ตั๋ว และบันทึกหลักฐานการโอนเงินคืนลูกค้าแบบส่วนตัว
          </p>
          {isLoading && (
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
              กำลังโหลดข้อมูลล่าสุด...
            </p>
          )}
        </div>
      </div>

      {/* Feedback Banner (D-247) */}
      {feedback && (
        <div
          id="owner-refund-feedback-banner"
          className={`hub-feedback-banner ${feedback.type === 'success' ? 'success' : 'error'}`}
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: feedback.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          {feedback.type === 'success' ? (
            <CheckCircleIcon style={{ width: '18px', height: '18px', flexShrink: 0 }} />
          ) : (
            <AlertIcon style={{ width: '18px', height: '18px', flexShrink: 0 }} />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 2. Balanced Hub Toolbar: Underline Tabs on Left + Search/Sort/Refresh on Right (D-245, D-247) */}
      <section className="hub-toolbar-row" aria-label="แถบสลับแท็บและเครื่องมือจัดการคำขอคืนเงิน">
        {/* Left: Underline Status Tabs */}
        <div className="hub-filter-tabs-bar pipeline-status-tabs" role="tablist" aria-label="ตัวกรองสถานะคำขอคืนเงิน">
          <button
            type="button"
            className={`hub-filter-tab pipeline-status-tab ${filterStatus === 'pending' ? 'is-active active' : ''}`}
            onClick={() => {
              setFilterStatus('pending');
              setCurrentPage(1);
            }}
            role="tab"
            aria-selected={filterStatus === 'pending'}
          >
            <span>รอตรวจสอบ</span>
            <span className="hub-tab-badge status-counter-pill">{pendingCount}</span>
          </button>

          <button
            type="button"
            className={`hub-filter-tab pipeline-status-tab ${filterStatus === 'approved' ? 'is-active active' : ''}`}
            onClick={() => {
              setFilterStatus('approved');
              setCurrentPage(1);
            }}
            role="tab"
            aria-selected={filterStatus === 'approved'}
          >
            <span>รอโอนเงินคืน (Approved)</span>
            <span className="hub-tab-badge status-counter-pill">{approvedCount}</span>
          </button>

          <button
            type="button"
            className={`hub-filter-tab pipeline-status-tab ${filterStatus === 'completed' ? 'is-active active' : ''}`}
            onClick={() => {
              setFilterStatus('completed');
              setCurrentPage(1);
            }}
            role="tab"
            aria-selected={filterStatus === 'completed'}
          >
            <span>โอนสำเร็จแล้ว (Completed)</span>
            <span className="hub-tab-badge status-counter-pill">{completedCount}</span>
          </button>
        </div>

        {/* Right: Search, Sort Dropdown & Live Refresh */}
        <div className="hub-toolbar-tools-right">
          <div className="hub-search-box">
            <SearchIcon className="hub-search-icon" />
            <input
              type="search"
              className="hub-search-input"
              placeholder="ค้นหาเลขออเดอร์, คอนเสิร์ต หรือลูกค้า..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="ค้นหาคำขอคืนเงิน"
            />
            {searchQuery && (
              <button
                type="button"
                className="hub-search-clear"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                aria-label="ล้างการค้นหา"
              >
                <XIcon style={{ width: '14px', height: '14px' }} />
              </button>
            )}
          </div>

          <div className="hub-sort-wrap">
            <label htmlFor="refund-sort-select" className="sr-only">จัดเรียงตาม</label>
            <select
              id="refund-sort-select"
              className="hub-sort-select"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'latest' | 'amount_desc' | 'alphabetical');
                setCurrentPage(1);
              }}
              aria-label="จัดเรียงตาม"
            >
              <option value="latest">เรียงตาม: ล่าสุด</option>
              <option value="amount_desc">เรียงตาม: ยอดเงิน มาก-น้อย</option>
              <option value="alphabetical">เรียงตาม: ชื่องาน ก-ฮ</option>
            </select>
          </div>

          <button
            type="button"
            className="secondary-button hub-refresh-btn"
            onClick={() => fetchRequests()}
            title="รีเฟรชข้อมูลล่าสุด"
            aria-label="รีเฟรชข้อมูลล่าสุด"
          >
            <RefreshIcon className="btn-icon" />
            <span>รีเฟรช</span>
          </button>
        </div>
      </section>

      {/* 3. Refund Request Cards List (D-246 & D-247 Uniform Horizontal Cards) */}
      <div className="concert-horizontal-list">
        {sortedDataset.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
            <p style={{ fontSize: '1rem', fontWeight: 500 }}>
              {searchQuery
                ? `ไม่พบคำขอคืนเงินที่ตรงกับคำค้นหา "${searchQuery}"`
                : 'ไม่มีคำขอคืนเงินในสถานะนี้ในขณะนี้'}
            </p>
            {searchQuery && (
              <button
                type="button"
                className="secondary-button"
                style={{ marginTop: '0.75rem' }}
                onClick={() => setSearchQuery('')}
              >
                ล้างคำค้นหา
              </button>
            )}
          </div>
        ) : (
          sortedDataset.map((req) => {
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const isCompleted = req.status === 'completed';
            const isRejected = req.status === 'rejected';

            return (
              <article
                key={req.id}
                id={`refund-card-${req.id}`}
                className="concert-horizontal-row-card refund-request-card"
                data-testid={`refund-request-item-${req.id}`}
              >
                <div className="row-card-center">
                  {/* Row 1: Status Badge & Ref Numbers (D-243) */}
                  <div className="row-card-badge-row">
                    <span className={`status-badge ${isPending ? 'pending' : isApproved ? 'approved' : isCompleted ? 'completed' : 'revision'}`}>
                      {isPending
                        ? 'รอตรวจสอบ'
                        : isApproved
                          ? 'รอโอนเงินคืน'
                          : isCompleted
                            ? 'โอนสำเร็จแล้ว (completed)'
                            : 'ปฏิเสธคำขอ'}
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                      {req.id}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      (คำสั่งซื้อ: {req.orderId})
                    </span>
                  </div>

                  {/* Row 2: Event Title (D-243) */}
                  <h3 className="row-event-title">{req.eventTitle}</h3>

                  {/* Row 3: Buyer & Bank Info (D-243) */}
                  <div className="row-meta-strip">
                    <span className="row-meta-item">
                      <strong>ลูกค้า:</strong> {req.buyerName} ({req.buyerEmail})
                    </span>
                    {req.buyerPhone && (
                      <>
                        <span className="row-meta-dot">·</span>
                        <span className="row-meta-item">
                          <strong>โทร:</strong> {req.buyerPhone}
                        </span>
                      </>
                    )}
                    {req.bankName && (
                      <>
                        <span className="row-meta-dot">·</span>
                        <span className="row-meta-item">
                          <strong>บัญชีรับเงิน:</strong> {req.bankName} {req.bankAccountNo} ({req.bankAccountName || req.buyerName})
                        </span>
                      </>
                    )}
                  </div>

                  {/* Row 4: Ticket Details & Submitted Date (D-243) */}
                  <div className="row-meta-strip">
                    <span className="row-meta-item">
                      <strong>ตั๋วที่ขอคืน:</strong> {req.items?.length ? `${req.items.length} ใบ (${req.items.map((i) => i.ticketCode).join(', ')})` : '1 ใบ'}
                    </span>
                    <span className="row-meta-dot">·</span>
                    <span className="row-meta-item">
                      <strong>ยื่นคำขอเมื่อ:</strong> {formatDate(new Date(req.submittedAt))} เวลา {formatTime(new Date(req.submittedAt))}
                    </span>
                  </div>

                  {/* Row 5: Tags Strip (Amount & Reason - D-243, D-246) */}
                  <div className="row-tags-strip">
                    <span
                      className="row-detail-pill"
                      style={{ fontWeight: 700, color: '#0f172a', backgroundColor: '#f1f5f9' }}
                    >
                      ยอดเงินคืนสุทธิ: {formatBaht(req.requestedAmount)}
                    </span>
                    <span className="row-detail-pill">
                      เหตุผล: {req.reason}
                    </span>
                    {req.transferNote && (
                      <span
                        className="row-detail-pill"
                        style={{ color: '#15803d', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}
                      >
                        บันทึก: {req.transferNote}
                      </span>
                    )}
                    {req.transferFailureReason && (
                      <span
                        className="row-detail-pill"
                        style={{ color: '#b91c1c', backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
                      >
                        การโอนเงินครั้งก่อนล้มเหลว (AC-93): {req.transferFailureReason}
                      </span>
                    )}
                    {req.rejectionReason && (
                      <span
                        className="row-detail-pill"
                        style={{ color: '#b91c1c', backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
                      >
                        เหตุผลปฏิเสธ: {req.rejectionReason}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Action Column (D-246: Fixed width 240px, Hairline divider) */}
                <div className="row-card-right">
                  {isPending && (
                    <>
                      <button
                        type="button"
                        className="primary-button row-action-btn"
                        disabled={processingId === req.id}
                        onClick={() => handleApprove(req.id)}
                      >
                        <CheckCircleIcon className="btn-icon" />
                        <span>{processingId === req.id ? 'กำลังอนุมัติ...' : 'อนุมัติการคืนเงิน'}</span>
                      </button>

                      <button
                        type="button"
                        className="danger-button reject-btn row-action-btn"
                        onClick={() => {
                          setRejectingId(req.id);
                          setRejectionReason('');
                        }}
                      >
                        <XIcon className="btn-icon" />
                        <span>ปฏิเสธคำขอคืนเงิน</span>
                      </button>
                    </>
                  )}

                  {isApproved && (
                    <>
                      <button
                        type="button"
                        className="primary-button row-action-btn"
                        onClick={() => {
                          setTransferringId(req.id);
                          setTransferFile(null);
                          setTransferNote('');
                        }}
                      >
                        <CheckCircleIcon className="btn-icon" />
                        <span>บันทึกการโอนเงิน (AC-37)</span>
                      </button>

                      <button
                        type="button"
                        className="danger-button reject-btn row-action-btn"
                        onClick={() => {
                          setFailureRecordingId(req.id);
                          setTransferFailureReason('');
                        }}
                      >
                        <AlertIcon className="btn-icon" />
                        <span>บันทึกโอนล้มเหลว (AC-93)</span>
                      </button>
                    </>
                  )}

                  {(isCompleted || isRejected) && (
                    <>
                      <button
                        type="button"
                        className="secondary-button row-action-btn"
                        onClick={() => setInspectingReq(req)}
                      >
                        <EyeIcon className="btn-icon" />
                        <span>ดูรายละเอียดคำขอ</span>
                      </button>

                      {req.transferProofUrl && (
                        <a
                          href={req.transferProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="secondary-button row-action-btn"
                          download
                        >
                          <DownloadIcon className="btn-icon" />
                          <span>ดาวน์โหลดสลิป</span>
                        </a>
                      )}
                    </>
                  )}
                </div>

                {/* Modal Overlay: Complete Transfer Dialog (Inside card for E2E locator compatibility) */}
                {transferringId === req.id && (
                  <div
                    className="modal-backdrop review-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                  >
                    <button
                      type="button"
                      className="review-modal-backdrop-btn"
                      onClick={() => setTransferringId(null)}
                      aria-label="ปิดหน้าต่าง"
                      tabIndex={-1}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', border: 'none', cursor: 'default' }}
                    />
                    <div
                      className="review-modal-panel"
                      style={{ position: 'relative', zIndex: 1, background: '#ffffff', borderRadius: '14px', maxWidth: '520px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                          บันทึกการโอนเงินคืนลูกค้า (Complete Transfer)
                        </h4>
                        <button
                          type="button"
                          className="review-modal-close"
                          onClick={() => setTransferringId(null)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}
                          aria-label="ปิดหน้าต่าง"
                        >
                          <XIcon style={{ width: '18px', height: '18px' }} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                          <p style={{ margin: '0 0 0.35rem 0' }}>
                            <strong>รหัสคำขอ:</strong> {req.id} (คำสั่งซื้อ: {req.orderId})
                          </p>
                          <p style={{ margin: '0 0 0.35rem 0' }}>
                            <strong>ยอดเงินที่ต้องโอนคืน:</strong> <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{formatBaht(req.requestedAmount)}</span>
                          </p>
                          <p style={{ margin: 0 }}>
                            <strong>บัญชีปลายทาง:</strong> {req.bankName} {req.bankAccountNo} ({req.bankAccountName || req.buyerName})
                          </p>
                        </div>

                        <div>
                          <label htmlFor={`file-input-${req.id}`} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.35rem' }}>
                            สลิปหลักฐานการโอนเงิน (Private Proof):
                          </label>
                          <input
                            id={`file-input-${req.id}`}
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => setTransferFile(e.target.files?.[0] || null)}
                            style={{ fontSize: '0.85rem' }}
                          />
                        </div>

                        <div>
                          <label htmlFor={`note-input-${req.id}`} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.35rem' }}>
                            บันทึกช่วยจำ / เลขที่อ้างอิงสลิป:
                          </label>
                          <input
                            id={`note-input-${req.id}`}
                            data-testid={`transfer-note-input-${req.id}`}
                            type="text"
                            className="form-input text-input"
                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            placeholder="เช่น โอนผ่าน KBank สลิปเลขที่ 998877 เรียบร้อย"
                            value={transferNote}
                            onChange={(e) => setTransferNote(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setTransferringId(null)}
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          data-testid={`confirm-complete-transfer-btn-${req.id}`}
                          className="primary-button"
                          disabled={processingId === req.id}
                          onClick={() => handleCompleteTransfer(req)}
                        >
                          <CheckCircleIcon className="btn-icon" />
                          <span>{processingId === req.id ? 'กำลังบันทึก...' : 'ยืนยันบันทึกการโอนเงิน'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Modal Overlay: Rejection Dialog */}
                {rejectingId === req.id && (
                  <div
                    className="modal-backdrop review-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                  >
                    <button
                      type="button"
                      className="review-modal-backdrop-btn"
                      onClick={() => setRejectingId(null)}
                      aria-label="ปิดหน้าต่าง"
                      tabIndex={-1}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', border: 'none', cursor: 'default' }}
                    />
                    <div
                      className="review-modal-panel"
                      style={{ position: 'relative', zIndex: 1, background: '#ffffff', borderRadius: '14px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>
                          ปฏิเสธคำขอคืนเงิน (Reject Refund)
                        </h4>
                        <button
                          type="button"
                          className="review-modal-close"
                          onClick={() => setRejectingId(null)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}
                          aria-label="ปิดหน้าต่าง"
                        >
                          <XIcon style={{ width: '18px', height: '18px' }} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}>
                          คำขอของ <strong>{req.buyerName}</strong> ({req.eventTitle}) ยอดเงิน {formatBaht(req.requestedAmount)}
                        </p>
                        <div>
                          <label htmlFor={`reject-reason-${req.id}`} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.35rem' }}>
                            ระบุเหตุผลในการปฏิเสธคำขอ (ลูกค้าจะเห็นข้อความนี้):
                          </label>
                          <textarea
                            id={`reject-reason-${req.id}`}
                            className="form-input text-input"
                            rows={3}
                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            placeholder="ระบุเหตุผล เช่น ไม่เข้าเกณฑ์การคืนเงิน หรือเลยกำหนดเวลา..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setRejectingId(null)}
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          className="primary-button danger-button"
                          disabled={processingId === req.id || !rejectionReason.trim()}
                          onClick={() => handleReject(req.id)}
                          style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' }}
                        >
                          <span>{processingId === req.id ? 'กำลังดำเนินการ...' : 'ยืนยันปฏิเสธคำขอ'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Modal Overlay: Record Failure Dialog */}
                {failureRecordingId === req.id && (
                  <div
                    className="modal-backdrop review-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                  >
                    <button
                      type="button"
                      className="review-modal-backdrop-btn"
                      onClick={() => setFailureRecordingId(null)}
                      aria-label="ปิดหน้าต่าง"
                      tabIndex={-1}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', border: 'none', cursor: 'default' }}
                    />
                    <div
                      className="review-modal-panel"
                      style={{ position: 'relative', zIndex: 1, background: '#ffffff', borderRadius: '14px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>
                          บันทึกการโอนเงินล้มเหลว (Record Transfer Failure)
                        </h4>
                        <button
                          type="button"
                          className="review-modal-close"
                          onClick={() => setFailureRecordingId(null)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}
                          aria-label="ปิดหน้าต่าง"
                        >
                          <XIcon style={{ width: '18px', height: '18px' }} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                          บันทึกเหตุผลที่ธนาคารปฏิเสธการโอนเงิน (เช่น เลขที่บัญชีไม่ถูกต้อง หรือบัญชีปิด) โดยยอดหนี้ยังคงค้างชำระเพื่อรอการติดต่อแก้ไขตาม AC-93
                        </p>
                        <div>
                          <label htmlFor={`failure-reason-${req.id}`} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.35rem' }}>
                            ระบุเหตุผลที่การโอนเงินล้มเหลว:
                          </label>
                          <input
                            id={`failure-reason-${req.id}`}
                            type="text"
                            className="form-input text-input"
                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            placeholder="เช่น เลขที่บัญชีไม่ถูกต้อง หรือชื่อบัญชีไม่ตรงกับธนาคาร..."
                            value={transferFailureReason}
                            onChange={(e) => setTransferFailureReason(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setFailureRecordingId(null)}
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          className="primary-button danger-button"
                          disabled={processingId === req.id || !transferFailureReason.trim()}
                          onClick={() => handleRecordFailure(req.id)}
                          style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' }}
                        >
                          <span>{processingId === req.id ? 'กำลังบันทึก...' : 'ยืนยันบันทึกโอนล้มเหลว'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* 4. Detail Inspection Modal (For completed/history items) */}
      {inspectingReq && (
        <div
          className="modal-backdrop review-modal-backdrop"
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <button
            type="button"
            className="review-modal-backdrop-btn"
            onClick={() => setInspectingReq(null)}
            aria-label="ปิดหน้าต่าง"
            tabIndex={-1}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', border: 'none', cursor: 'default' }}
          />
          <div
            className="review-modal-panel"
            style={{ position: 'relative', zIndex: 1, background: '#ffffff', borderRadius: '14px', maxWidth: '580px', width: '100%', padding: '1.75rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  รายละเอียดคำขอคืนเงิน ({inspectingReq.id})
                </h3>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  คำสั่งซื้อ: {inspectingReq.orderId}
                </span>
              </div>
              <button
                type="button"
                className="review-modal-close"
                onClick={() => setInspectingReq(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: '20px', height: '20px' }} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <p style={{ margin: '0 0 0.4rem 0' }}>
                  <strong>คอนเสิร์ต:</strong> {inspectingReq.eventTitle}
                </p>
                <p style={{ margin: '0 0 0.4rem 0' }}>
                  <strong>ผู้ขอคืนเงิน:</strong> {inspectingReq.buyerName} ({inspectingReq.buyerEmail})
                </p>
                <p style={{ margin: '0 0 0.4rem 0' }}>
                  <strong>เบอร์โทรศัพท์:</strong> {inspectingReq.buyerPhone || '-'}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>บัญชีรับเงิน:</strong> {inspectingReq.bankName} {inspectingReq.bankAccountNo} ({inspectingReq.bankAccountName || inspectingReq.buyerName})
                </p>
              </div>

              <div>
                <p style={{ margin: '0 0 0.35rem 0', fontWeight: 600, color: '#0f172a' }}>
                  ยอดเงินและเหตุผลการขอคืน:
                </p>
                <p style={{ margin: '0 0 0.35rem 0' }}>
                  <strong>ยอดเงินคืนสุทธิ:</strong> <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{formatBaht(inspectingReq.requestedAmount)}</span>
                </p>
                <p style={{ margin: 0, color: '#475569' }}>
                  <strong>เหตุผล:</strong> {inspectingReq.reason}
                </p>
              </div>

              {inspectingReq.transferredAt && (
                <div style={{ background: '#f0fdf4', padding: '0.85rem', borderRadius: '8px', border: '1px solid #bbf7d0', color: '#166534' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 700 }}>
                    โอนเงินคืนสำเร็จแล้วเมื่อ: {formatDate(new Date(inspectingReq.transferredAt))} เวลา {formatTime(new Date(inspectingReq.transferredAt))}
                  </p>
                  {inspectingReq.transferNote && (
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>
                      <strong>บันทึกช่วยจำ:</strong> {inspectingReq.transferNote}
                    </p>
                  )}
                </div>
              )}

              {inspectingReq.rejectionReason && (
                <div style={{ background: '#fef2f2', padding: '0.85rem', borderRadius: '8px', border: '1px solid #fecaca', color: '#991b1b' }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    เหตุผลการปฏิเสธ: {inspectingReq.rejectionReason}
                  </p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="primary-button"
                onClick={() => setInspectingReq(null)}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Pagination Bar (D-244, D-247) */}
      {sortedDataset.length > 0 && (
        <section className="hub-pagination-bar" aria-label="แถบแบ่งหน้าคำขอคืนเงิน">
          <div className="pagination-info">
            แสดง 1–{sortedDataset.length} จากทั้งหมด {sortedDataset.length} รายการ
          </div>
          <div className="pagination-controls">
            <button
              type="button"
              className="secondary-button pagination-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ก่อนหน้า
            </button>
            <span className="pagination-current-page">
              หน้า {currentPage} จาก {Math.max(1, Math.ceil(sortedDataset.length / PAGE_SIZE))}
            </span>
            <button
              type="button"
              className="secondary-button pagination-btn"
              disabled={currentPage >= Math.max(1, Math.ceil(sortedDataset.length / PAGE_SIZE))}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              ถัดไป
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
