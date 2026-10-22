'use client';

import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import type { EventMoneyReportDetail } from '@/server/reports';
import { formatDate, formatTime } from '@/lib/locale';
import { RefreshIcon } from './icons';
import { AlertIcon } from './alert-icon';

export interface EventOption {
  id: string;
  title: string;
}

export function OwnerWeeklyPayoutManager() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [report, setReport] = useState<EventMoneyReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states
  const [amount, setAmount] = useState<string>('');
  const [paidAtDate, setPaidAtDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [transferNote, setTransferNote] = useState<string>('');
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [isFailureMode, setIsFailureMode] = useState<boolean>(false);
  const [failureReason, setFailureReason] = useState<string>('');

  // Fetch events list
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/events/fee-settings', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.events) {
        setEvents(data.events.map((e: { id: string; title: string }) => ({ id: e.id, title: e.title })));
        setSelectedEventId(prev => prev || (data.events[0]?.id || ''));
      }
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Fetch event money report
  const fetchReport = useCallback(async (preserveFeedback = false) => {
    if (!selectedEventId) return;
    setLoading(true);
    if (!preserveFeedback) {
      setFeedback(null);
    }
    try {
      const res = await fetch(`/api/owner/events/${selectedEventId}/money-report`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.report) {
        setReport(data.report);
        setAmount(String(data.report.payableAmount || 0));
      } else {
        setFeedback({ type: 'error', message: data.message || 'ไม่สามารถโหลดรายงานการเงินของคอนเสิร์ตได้' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อดึงรายงานการเงิน' });
    } finally {
      setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setTransferFile(e.target.files[0]);
    } else {
      setTransferFile(null);
    }
  };

  const handleRecordPayout = async (status: 'completed' | 'failed') => {
    if (!selectedEventId) return;

    const numAmount = parseFloat(amount);
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      setFeedback({ type: 'error', message: 'กรุณาระบุจำนวนเงินที่ถูกต้องและมากกว่า 0 บาท' });
      return;
    }

    if (status === 'failed' && !failureReason.trim()) {
      setFeedback({ type: 'error', message: 'กรุณาระบุเหตุผลการโอนเงินไม่สำเร็จ (AC-93)' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      let transferProofKey: string | undefined;
      let transferProofUrl: string | undefined;

      // 1. Upload proof file if provided (private visibility for AC-92)
      if (transferFile && status === 'completed') {
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
          setSubmitting(false);
          return;
        }

        const uploadData = await uploadRes.json();
        transferProofKey = uploadData.key;
        transferProofUrl = uploadData.url;
      }

      // 2. Call record payout API
      const res = await fetch(`/api/owner/events/${selectedEventId}/payouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          status,
          paidAt: paidAtDate ? new Date(paidAtDate).toISOString() : new Date().toISOString(),
          transferProofKey,
          transferProofUrl,
          transferNote: transferNote.trim() || undefined,
          transferFailureReason: status === 'failed' ? failureReason.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || 'บันทึกการโอนเงินไม่สำเร็จ' });
      } else {
        setFeedback({
          type: 'success',
          message:
            status === 'completed'
              ? `บันทึกการโอนเงินสำเร็จเรียบร้อย (รหัสรายการ: ${data.result.payoutId}) ยอดพร้อมจ่ายคงเหลือ: ฿${data.result.payableAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
              : `บันทึกรายการโอนเงินไม่สำเร็จเรียบร้อย (AC-93) ยอดพร้อมจ่ายไม่ถูกลดทอนและสามารถลองใหม่ได้`,
        });
        setTransferFile(null);
        setTransferNote('');
        setFailureReason('');
        setIsFailureMode(false);
        await fetchReport(true);
      }
    } catch {
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อบันทึกการโอนเงิน' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="owner-weekly-payout-manager"
      data-testid="owner-weekly-payout-manager"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '24px',
        marginTop: '1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 4px 0' }}>
            รอบจ่ายเงินรายสัปดาห์ให้ผู้จัดงาน (Weekly Manual Payout — AC-27, AC-30, AC-79)
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            คำนวณยอดพร้อมจ่ายตามสูตร A_pay = max(0, L - H) และบันทึกหลักฐานการโอนแบบส่วนตัว (AC-92)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="payout-event-select" style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
            เลือกคอนเสิร์ต:
          </label>
          <select
            id="payout-event-select"
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              minWidth: '220px',
            }}
          >
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => fetchReport(false)}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshIcon style={{ width: '13px', height: '13px' }} />
            รีเฟรช
          </button>
        </div>
      </div>

      {feedback && (
        <div
          id={feedback.type === 'success' ? 'payout-feedback-success' : 'payout-feedback-error'}
          role="alert"
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            color: feedback.type === 'success' ? '#166534' : '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {feedback.type === 'error' && <AlertIcon />}
          <span>{feedback.message}</span>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
          กำลังดึงข้อมูลรายงานการเงิน...
        </div>
      )}

      {!loading && report && (
        <div>
          {/* Financial Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginBottom: '24px',
            }}
          >
            <div style={{ padding: '14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>สิทธิ์สุทธิผู้จัดงาน (E)</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                ฿{report.netEntitlement.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ padding: '14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>เงินสำรองที่กันไว้จริง (Held H)</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#475569' }}>
                ฿{report.actualHeldReserve.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>เป้าหมายสำรอง: ฿{report.reserveTarget.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
            </div>

            <div style={{ padding: '14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>ยอดที่โอนจ่ายแล้ว (Paid P)</div>
              <div data-testid="owner-total-paid-out" style={{ fontSize: '18px', fontWeight: 'bold', color: '#0284c7' }}>
                ฿{report.totalPaidOut.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                backgroundColor: report.isDebt ? '#fef2f2' : '#f0fdf4',
                border: `2px solid ${report.isDebt ? '#ef4444' : '#16a34a'}`,
                borderRadius: '6px',
              }}
            >
              <div style={{ fontSize: '11px', color: report.isDebt ? '#991b1b' : '#166534', fontWeight: 600, marginBottom: '2px' }}>
                {report.isDebt ? 'ยอดหนี้ค้างชำระ (Debt)' : 'ยอดพร้อมจ่าย (Payable A_pay)'}
              </div>
              <div
                data-testid="owner-payable-amount"
                style={{ fontSize: '20px', fontWeight: 'bold', color: report.isDebt ? '#dc2626' : '#15803d' }}
              >
                {report.isDebt
                  ? `-฿${report.debtAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                  : `฿${report.payableAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
              </div>
            </div>
          </div>

          {/* Payout Recording Form */}
          <div
            style={{
              padding: '20px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              backgroundColor: '#f8fafc',
              marginBottom: '28px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
                {isFailureMode ? 'บันทึกรายการโอนเงินไม่สำเร็จ (Record Payout Failure — AC-93)' : 'บันทึกการโอนเงินตามรอบ (Record Weekly Payout — AC-27)'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFailureMode(!isFailureMode)}
                style={{
                  fontSize: '12px',
                  color: isFailureMode ? '#2563eb' : '#dc2626',
                  background: 'none',
                  border: 'none',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {isFailureMode ? '← สลับเป็นบันทึกการโอนเงินสำเร็จ' : 'บันทึกกรณีโอนเงินล้มเหลว (Failure / Bounce)'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div>
                <label htmlFor="payout-amount-input" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  จำนวนเงินที่โอน (บาท) *
                </label>
                <input
                  id="payout-amount-input"
                  data-testid="payout-amount-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontWeight: 'bold',
                  }}
                />
              </div>

              <div>
                <label htmlFor="payout-date-input" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  วันที่โอนเงิน *
                </label>
                <input
                  id="payout-date-input"
                  data-testid="payout-date-input"
                  type="date"
                  value={paidAtDate}
                  onChange={e => setPaidAtDate(e.target.value)}
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                  }}
                />
              </div>

              <div>
                <label htmlFor="payout-note-input" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  หมายเหตุการโอน
                </label>
                <input
                  id="payout-note-input"
                  data-testid="payout-note-input"
                  type="text"
                  placeholder="เช่น โอนเงินรอบสัปดาห์ที่ 3"
                  value={transferNote}
                  onChange={e => setTransferNote(e.target.value)}
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                  }}
                />
              </div>

              {!isFailureMode ? (
                <div>
                  <label htmlFor="payout-proof-file" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    ไฟล์สลิปหลักฐานการโอน (AC-92 Private)
                  </label>
                  <input
                    id="payout-proof-file"
                    data-testid="payout-proof-file"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      padding: '6px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                    }}
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="payout-failure-reason-input" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#991b1b', marginBottom: '4px' }}>
                    เหตุผลการโอนล้มเหลว (AC-93) *
                  </label>
                  <input
                    id="payout-failure-reason-input"
                    data-testid="payout-failure-reason-input"
                    type="text"
                    placeholder="เช่น เลขที่บัญชีไม่ถูกต้อง หรือระบบธนาคารปฏิเสธ"
                    value={failureReason}
                    onChange={e => setFailureReason(e.target.value)}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '14px',
                      borderRadius: '6px',
                      border: '1px solid #fecaca',
                      backgroundColor: '#fff5f5',
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {!isFailureMode ? (
                <button
                  type="button"
                  id="submit-payout-btn"
                  data-testid="submit-payout-btn"
                  onClick={() => handleRecordPayout('completed')}
                  disabled={submitting || report.payableAmount <= 0}
                  style={{
                    padding: '8px 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    backgroundColor: report.payableAmount > 0 ? '#15803d' : '#94a3b8',
                    color: '#ffffff',
                    border: 'none',
                    cursor: submitting || report.payableAmount <= 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'กำลังบันทึก...' : 'บันทึกการโอนเงิน (Record Payout — AC-27)'}
                </button>
              ) : (
                <button
                  type="button"
                  id="submit-failure-btn"
                  data-testid="submit-failure-btn"
                  onClick={() => handleRecordPayout('failed')}
                  disabled={submitting}
                  style={{
                    padding: '8px 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'กำลังบันทึก...' : 'บันทึกรายการโอนไม่สำเร็จ (Record Failure — AC-93)'}
                </button>
              )}
            </div>
          </div>

          {/* Payout History Table */}
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a', marginBottom: '12px' }}>
              ประวัติการโอนเงินสำหรับคอนเสิร์ตนี้ (Payout History — AC-31, AC-92)
            </h3>

            {report.payouts.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  color: '#64748b',
                  fontSize: '13px',
                }}
              >
                ยังไม่มีประวัติการโอนเงินสำหรับคอนเสิร์ตนี้
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table id="payout-history-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '10px 12px' }}>รหัสรายการ</th>
                      <th style={{ padding: '10px 12px' }}>วันที่โอน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>จำนวนเงินที่โอน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>สถานะ</th>
                      <th style={{ padding: '10px 12px' }}>หมายเหตุ</th>
                      <th style={{ padding: '10px 12px' }}>บันทึกโดย</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>หลักฐาน (Owner — AC-92)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.payouts.map((p, idx) => (
                      <tr
                        key={p.id}
                        data-testid={`owner-payout-row-${p.id}`}
                        style={{ borderBottom: idx < report.payouts.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                      >
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{p.id}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          {formatDate(new Date(p.paidAt))} {formatTime(new Date(p.paidAt))}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: p.status === 'completed' ? '#0284c7' : '#991b1b' }}>
                          ฿{p.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: p.status === 'completed' ? '#e0f2fe' : '#fee2e2',
                              color: p.status === 'completed' ? '#0369a1' : '#991b1b',
                            }}
                          >
                            {p.status === 'completed' ? 'โอนสำเร็จ' : 'โอนไม่สำเร็จ'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                          {p.transferNote || (p.transferFailureReason ? `เหตุผล: ${p.transferFailureReason}` : '-')}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                          {p.recordedByName || '-'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {p.transferProofUrl ? (
                            <a
                              href={`/api/owner/payouts/${p.id}/proof`}
                              target="_blank"
                              rel="noreferrer"
                              data-testid={`payout-proof-link-${p.id}`}
                              style={{
                                color: '#2563eb',
                                textDecoration: 'underline',
                                fontWeight: 500,
                              }}
                            >
                              ดูหลักฐาน
                            </a>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>ไม่มีไฟล์</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
