'use client';

import { formatDate, formatTime } from '@/lib/locale';
import type { EventMoneyReportDetail } from '@/server/reports';
import { useCallback, useEffect, useState } from 'react';

function AlertCircleIcon({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CheckCircleIcon({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

interface EventOption {
  id: string;
  title: string;
}

export function OwnerDebtRepaymentManager() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [report, setReport] = useState<EventMoneyReportDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [amount, setAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load events
  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch('/api/owner/events/fee-settings');
        if (res.ok) {
          const data = await res.json();
          const eventList: EventOption[] = (data.events || []).map((e: { eventId?: string; id?: string; title: string }) => ({
            id: e.eventId || e.id || '',
            title: e.title,
          }));
          setEvents(eventList);
          setSelectedEventId(prev => prev || (eventList[0]?.id || ''));
        }
      } catch (err) {
        console.error('Failed to load events for debt repayment manager:', err);
      }
    }
    fetchEvents();
  }, []);

  // Load event report
  const fetchReport = useCallback(async (eventId: string, preserveFeedback = false) => {
    if (!eventId) return;
    setLoading(true);
    if (!preserveFeedback) {
      setFeedback(null);
    }
    try {
      const res = await fetch(`/api/owner/events/${eventId}/money-report`);
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
        if (data.report?.isDebt && data.report?.debtAmount > 0) {
          setAmount(String(data.report.debtAmount));
        } else {
          setAmount('');
        }
      } else {
        setReport(null);
      }
    } catch (err) {
      console.error('Failed to load money report:', err);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchReport(selectedEventId);
    }
  }, [selectedEventId, fetchReport]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !selectedEventId) return;

    const numAmount = amount ? Number(amount) : report.debtAmount;
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      setFeedback({ type: 'error', message: 'กรุณาระบุจำนวนเงินที่ต้องการบันทึกรับคืนให้ถูกต้อง' });
      return;
    }

    if (numAmount > report.debtAmount) {
      setFeedback({
        type: 'error',
        message: `จำนวนเงินที่ระบุ (฿${numAmount.toFixed(2)}) เกินยอดหนี้ค้างชำระ (฿${report.debtAmount.toFixed(2)})`,
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/owner/events/${selectedEventId}/debt-repayments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || 'เกิดข้อผิดพลาดในการบันทึกรับเงินคืน' });
      } else {
        setFeedback({
          type: 'success',
          message: `บันทึกรับชำระเงินคืนจากผู้จัดงานสำเร็จเรียบร้อยจำนวน ฿${numAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (AC-86)`,
        });
        setNotes('');
        await fetchReport(selectedEventId, true);
      }
    } catch {
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="owner-debt-repayment-manager"
      data-testid="owner-debt-repayment-manager"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '24px',
        marginTop: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
            จัดการยอดค้างชำระและการรับเงินคืนจากผู้จัดงาน (Debt Repayment — TASK-031, AC-85, AC-86)
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
            ติดตามยอดค้างชำระจาก refund หลัง payout แยกตามงานเดิม และบันทึกรับเงินคืนจริงโดยไม่หักข้ามงาน
          </p>
        </div>

        {/* Event selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="owner-debt-repayment-event-select" style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>
            เลือกคอนเสิร์ต:
          </label>
          <select
            id="owner-debt-repayment-event-select"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '13px',
              backgroundColor: '#f8fafc',
              minWidth: '220px',
            }}
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: '14px' }}>
          กำลังดึงข้อมูลรายงานการเงินและยอดค้างชำระ...
        </div>
      )}

      {!loading && report && (
        <div>
          {/* Status badge & breakdown banner */}
          <div
            data-testid="event-debt-status-banner"
            style={{
              padding: '12px 16px',
              borderRadius: '6px',
              marginBottom: '20px',
              backgroundColor: report.isDebt ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${report.isDebt ? '#fecaca' : '#bbf7d0'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {report.isDebt ? (
                <AlertCircleIcon style={{ color: '#dc2626' }} />
              ) : (
                <CheckCircleIcon style={{ color: '#16a34a' }} />
              )}
              <div>
                <span
                  data-testid="event-debt-status-badge"
                  style={{
                    fontWeight: 'bold',
                    fontSize: '14px',
                    color: report.isDebt ? '#991b1b' : '#166534',
                  }}
                >
                  {report.isDebt ? 'มียอดค้างชำระ (Debt Outstanding — AC-85)' : 'ไม่มีหนี้ค้างชำระ (No Debt)'}
                </span>
                <div style={{ fontSize: '12px', color: report.isDebt ? '#b91c1c' : '#15803d', marginTop: '2px' }}>
                  {report.isDebt
                    ? 'ยอดค้างชำระนี้จะถูกหักจากรายรับถัดไปของงานนี้เท่านั้น และไม่ถูกนำไปหักข้ามไปยังงานคอนเสิร์ตอื่นของผู้จัดงาน (AC-85)'
                    : 'สถานะการเงินของคอนเสิร์ตนี้ไม่มีภาระหนี้สินคงค้าง'}
                </div>
              </div>
            </div>

            {report.isDebt && (
              <div data-testid="debt-breakdown-details" style={{ fontSize: '12px', color: '#7f1d1d', textAlign: 'right' }}>
                <div>
                  ยอดเกินจ่ายจาก refund: <strong data-testid="debt-refund-excess">฿{report.excessPayoutRefundDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
                </div>
                {report.flatFeeDebt > 0 && (
                  <div style={{ marginTop: '2px' }}>
                    ค่าบริการเหมาจ่ายรอหัก: <strong data-testid="debt-flat-fee-carry">฿{report.flatFeeDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Financial KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            {/* Net Entitlement */}
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>สิทธิ์สุทธิ (E)</div>
              <div data-testid="owner-net-entitlement" style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                ฿{report.netEntitlement.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Total Paid Out */}
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>โอนจ่ายแล้ว (P)</div>
              <div data-testid="owner-total-paid" style={{ fontSize: '18px', fontWeight: 'bold', color: '#0284c7' }}>
                ฿{report.totalPaidOut.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Total Debt Repaid */}
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>รับคืนแล้วสะสม (X)</div>
              <div data-testid="owner-total-debt-repaid" style={{ fontSize: '18px', fontWeight: 'bold', color: '#16a34a' }}>
                ฿{report.totalDebtRepaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Net Liability L */}
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>ยอดคงเหลือ (L = E - P + X)</div>
              <div
                data-testid="owner-net-liability"
                style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: report.netLiability < 0 ? '#dc2626' : '#0f172a',
                }}
              >
                ฿{report.netLiability.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Debt Amount */}
            <div
              style={{
                padding: '12px',
                backgroundColor: report.isDebt ? '#fef2f2' : '#f0fdf4',
                borderRadius: '6px',
                border: `1px solid ${report.isDebt ? '#fca5a5' : '#86efac'}`,
              }}
            >
              <div style={{ fontSize: '12px', color: report.isDebt ? '#991b1b' : '#166534', fontWeight: 600 }}>
                หนี้ค้างชำระ (Debt)
              </div>
              <div
                data-testid="owner-debt-amount"
                style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: report.isDebt ? '#dc2626' : '#16a34a',
                }}
              >
                ฿{report.debtAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                marginBottom: '16px',
                fontSize: '13px',
                backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                color: feedback.type === 'success' ? '#166534' : '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {feedback.type === 'success' ? <CheckCircleIcon /> : <AlertCircleIcon />}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Record Debt Repayment Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '16px',
              marginBottom: '24px',
            }}
          >
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 12px' }}>
              บันทึกการรับชำระเงินคืนจากผู้จัดงาน (Record Debt Repayment — AC-86)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label htmlFor="debt-repayment-amount-input" style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#475569', marginBottom: '4px' }}>
                  จำนวนเงินที่รับคืน (บาท) *
                </label>
                <input
                  id="debt-repayment-amount-input"
                  data-testid="debt-repayment-amount-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={report.debtAmount > 0 ? report.debtAmount : undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!report.isDebt || report.debtAmount <= 0 || submitting}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    backgroundColor: !report.isDebt || report.debtAmount <= 0 ? '#f1f5f9' : '#ffffff',
                  }}
                />
              </div>

              <div>
                <label htmlFor="debt-repayment-notes-input" style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#475569', marginBottom: '4px' }}>
                  หมายเหตุ / เลขที่อ้างอิงการโอนคืน (ถ้ามี)
                </label>
                <input
                  id="debt-repayment-notes-input"
                  data-testid="debt-repayment-notes-input"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!report.isDebt || report.debtAmount <= 0 || submitting}
                  placeholder="เช่น ผู้จัดงานโอนชดเชยยอดค้างชำระ"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    backgroundColor: !report.isDebt || report.debtAmount <= 0 ? '#f1f5f9' : '#ffffff',
                  }}
                />
              </div>

              <div>
                <button
                  id="submit-debt-repayment-btn"
                  data-testid="submit-debt-repayment-btn"
                  type="submit"
                  disabled={!report.isDebt || report.debtAmount <= 0 || submitting}
                  style={{
                    width: '100%',
                    minHeight: '38px',
                    padding: '8px 16px',
                    backgroundColor: !report.isDebt || report.debtAmount <= 0 ? '#94a3b8' : '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: !report.isDebt || report.debtAmount <= 0 || submitting ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  {submitting ? 'กำลังบันทึก...' : 'บันทึกรับเงินคืนจากผู้จัดงาน'}
                </button>
              </div>
            </div>

            {!report.isDebt && (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
                * ไม่สามารถบันทึกรับเงินคืนได้เนื่องจากคอนเสิร์ตนี้ไม่มียอดหนี้ค้างชำระ (Debt = ฿0.00)
              </p>
            )}
          </form>

          {/* Repayments History Table */}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 10px' }}>
              ประวัติการรับชำระเงินคืนจากผู้จัดงาน (Debt Repayment History — AC-86)
            </h3>

            {report.repayments.length === 0 ? (
              <div
                data-testid="empty-repayments-message"
                style={{
                  textAlign: 'center',
                  padding: '20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  color: '#64748b',
                  fontSize: '13px',
                  border: '1px solid #e2e8f0',
                }}
              >
                ยังไม่มีประวัติการบันทึกรับเงินคืนสำหรับคอนเสิร์ตนี้
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table data-testid="debt-repayments-history-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '8px 12px' }}>รหัสรายการ</th>
                      <th style={{ padding: '8px 12px' }}>วันที่บันทึกรับคืน</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>จำนวนเงินที่รับคืน</th>
                      <th style={{ padding: '8px 12px' }}>หมายเหตุ</th>
                      <th style={{ padding: '8px 12px' }}>ผู้บันทึก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.repayments.map((rp, idx) => (
                      <tr
                        key={rp.id}
                        data-testid={`repayment-row-${rp.id}`}
                        style={{ borderBottom: idx < report.repayments.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                      >
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{rp.id}</td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          {formatDate(new Date(rp.repaidAt))} {formatTime(new Date(rp.repaidAt))}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>
                          ฿{rp.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>{rp.notes || '-'}</td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>{rp.recordedByName || 'ผู้ดูแลระบบ'}</td>
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
