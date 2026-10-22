'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EventMoneyReportDetail } from '@/server/reports';
import { formatDate, formatTime } from '@/lib/locale';
import { RefreshIcon, ClockIcon } from './icons';
import { AlertIcon } from './alert-icon';

export interface EventOption {
  id: string;
  title: string;
}

export function OwnerReserveReleaseManager() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [report, setReport] = useState<EventMoneyReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states
  const [amount, setAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

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

  // Fetch report detail
  const fetchReport = useCallback(async (preserveFeedback = false) => {
    if (!selectedEventId) return;
    setLoading(true);
    if (!preserveFeedback) {
      setFeedback(null);
    }
    try {
      const res = await fetch(`/api/organizer/events/${selectedEventId}/money-report`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || 'ไม่สามารถดึงข้อมูลรายงานการเงินได้' });
        setReport(null);
      } else {
        setReport(data.report);
        if (data.report?.actualHeldReserve !== undefined) {
          setAmount(data.report.actualHeldReserve > 0 ? String(data.report.actualHeldReserve) : '0');
        }
      }
    } catch {
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อดึงรายงานการเงิน' });
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleReleaseReserve = async () => {
    if (!selectedEventId || !report) return;

    if (!report.isFinalSessionEnded) {
      setFeedback({
        type: 'error',
        message: 'ยังไม่สามารถปล่อยเงินสำรองได้จนกว่ารอบสุดท้ายของคอนเสิร์ตจะสิ้นสุดลง (AC-83)',
      });
      return;
    }

    if (report.actualHeldReserve <= 0) {
      setFeedback({
        type: 'error',
        message: 'ไม่มีเงินสำรองที่กันไว้จริงให้ปล่อย (฿0.00)',
      });
      return;
    }

    const numAmount = amount ? Number(amount) : report.actualHeldReserve;
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      setFeedback({ type: 'error', message: 'กรุณาระบุจำนวนเงินที่ต้องการปล่อยให้ถูกต้อง' });
      return;
    }

    if (numAmount > report.actualHeldReserve) {
      setFeedback({
        type: 'error',
        message: `ยอดที่ต้องการปล่อย (฿${numAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}) เกินกว่าเงินสำรองที่กันไว้จริง (฿${report.actualHeldReserve.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`,
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/owner/events/${selectedEventId}/reserve-releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.message || 'ปล่อยเงินสำรองไม่สำเร็จ' });
      } else {
        const resAmount = data.result?.amount ?? numAmount;
        const newPayable = data.result?.newPayableAmount ?? (report.payableAmount + resAmount);
        setFeedback({
          type: 'success',
          message: `สั่งปล่อยเงินสำรองสำเร็จเรียบร้อยจำนวน ฿${resAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (รหัสรายการ: ${data.result?.releaseId || '-'}) ยอดพร้อมจ่ายปรับเป็น ฿${newPayable.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
        });
        setNotes('');
        await fetchReport(true);
      }
    } catch {
      setFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อสั่งปล่อยเงินสำรอง' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="owner-reserve-release-manager"
      data-testid="owner-reserve-release-manager"
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
            การปล่อยเงินสำรองหลังรอบสุดท้าย (Reserve Release — AC-83)
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Owner ตรวจสอบและสั่งปล่อยเงินสำรองที่กันไว้จริง (Held H) เข้าสู่ยอดพร้อมจ่ายหลังรอบสุดท้ายของงานสิ้นสุด
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            id="owner-reserve-release-event-select"
            data-testid="owner-reserve-release-event-select"
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
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
            onClick={() => fetchReport()}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              color: '#334155',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshIcon style={{ width: '14px', height: '14px' }} />
            รีเฟรช
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            color: feedback.type === 'success' ? '#166534' : '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
          }}
        >
          <AlertIcon />
          <span>{feedback.message}</span>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: '14px' }}>
          กำลังดึงข้อมูลสถานะเงินสำรอง...
        </div>
      )}

      {!loading && report && (
        <div>
          {/* Final Session Status Card */}
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              backgroundColor: report.isFinalSessionEnded ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${report.isFinalSessionEnded ? '#86efac' : '#fde68a'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ClockIcon style={{ width: '20px', height: '20px', color: report.isFinalSessionEnded ? '#16a34a' : '#d97706' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: report.isFinalSessionEnded ? '#166534' : '#92400e' }}>
                  {report.isFinalSessionEnded
                    ? 'รอบสุดท้ายของงานสิ้นสุดแล้ว (พร้อมตรวจสอบและปล่อยเงินสำรอง — AC-83)'
                    : 'รอบสุดท้ายยังไม่สิ้นสุด — ไม่ปล่อยตามเวลาเดิน ต้องรอรอบสุดท้ายจบ (AC-83)'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {report.finalSessionEnd
                    ? `เวลาสิ้นสุดรอบสุดท้าย: ${formatDate(new Date(report.finalSessionEnd))} ${formatTime(new Date(report.finalSessionEnd))} น.`
                    : 'ไม่พบข้อมูลรอบการแสดง'}
                </div>
              </div>
            </div>

            <div
              data-testid="final-session-status-badge"
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '4px',
                backgroundColor: report.isFinalSessionEnded ? '#dcfce7' : '#fef3c7',
                color: report.isFinalSessionEnded ? '#15803d' : '#b45309',
              }}
            >
              {report.isFinalSessionEnded ? 'จบรอบสุดท้ายแล้ว' : 'รอบสุดท้ายยังไม่จบ'}
            </div>
          </div>

          {/* Metric KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>เป้าหมายเงินสำรอง (Target)</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#475569' }}>
                ฿{report.reserveTarget.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>อัตราสำรอง {report.reservePercentage}%</div>
            </div>

            <div style={{ padding: '14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>สำรองที่ปล่อยแล้ว (Released U)</div>
              <div data-testid="owner-total-reserve-released" style={{ fontSize: '18px', fontWeight: 'bold', color: '#0284c7' }}>
                ฿{report.totalReserveReleased.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ padding: '14px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#334155', fontWeight: 600, marginBottom: '2px' }}>เงินสำรองที่กันไว้จริง (Held H)</div>
              <div
                data-testid="owner-held-reserve-amount"
                style={{ fontSize: '20px', fontWeight: 'bold', color: report.actualHeldReserve > 0 ? '#b45309' : '#64748b' }}
              >
                ฿{report.actualHeldReserve.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                backgroundColor: report.payableAmount > 0 ? '#f0fdf4' : '#f8fafc',
                border: `2px solid ${report.payableAmount > 0 ? '#16a34a' : '#cbd5e1'}`,
                borderRadius: '6px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600, marginBottom: '2px' }}>
                ยอดพร้อมจ่ายปัจจุบัน (Payable A_pay)
              </div>
              <div
                data-testid="owner-payable-after-release"
                style={{ fontSize: '20px', fontWeight: 'bold', color: '#15803d' }}
              >
                ฿{report.payableAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Reserve Release Action Form */}
          <div
            style={{
              padding: '20px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              backgroundColor: '#f8fafc',
              marginBottom: '28px',
            }}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 14px 0' }}>
              สั่งปล่อยเงินสำรองเข้ายอดพร้อมจ่าย (Release Reserve to Payable)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div>
                <label htmlFor="reserve-release-amount-input" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  จำนวนเงินที่ต้องการปล่อย (บาท) *
                </label>
                <input
                  id="reserve-release-amount-input"
                  data-testid="reserve-release-amount-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={report.actualHeldReserve}
                  placeholder={`สูงสุด ฿${report.actualHeldReserve.toFixed(2)}`}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  disabled={submitting || !report.isFinalSessionEnded || report.actualHeldReserve <= 0}
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
                <label htmlFor="reserve-release-notes-input" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  หมายเหตุการปล่อยเงินสำรอง (ถ้ามี)
                </label>
                <input
                  id="reserve-release-notes-input"
                  data-testid="reserve-release-notes-input"
                  type="text"
                  placeholder="เช่น ปล่อยเงินสำรองครบกำหนดหลังจบรอบสุดท้าย"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={submitting || !report.isFinalSessionEnded || report.actualHeldReserve <= 0}
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
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                id="submit-reserve-release-btn"
                data-testid="submit-reserve-release-btn"
                onClick={handleReleaseReserve}
                disabled={submitting || !report.isFinalSessionEnded || report.actualHeldReserve <= 0}
                style={{
                  padding: '8px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  backgroundColor:
                    report.isFinalSessionEnded && report.actualHeldReserve > 0 ? '#0284c7' : '#94a3b8',
                  color: '#ffffff',
                  border: 'none',
                  cursor:
                    submitting || !report.isFinalSessionEnded || report.actualHeldReserve <= 0
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {submitting ? 'กำลังบันทึก...' : 'ปล่อยเงินสำรองเข้ายอดพร้อมจ่าย (AC-83)'}
              </button>
            </div>
          </div>

          {/* Reserve Release History Table */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 12px 0' }}>
              ประวัติการปล่อยเงินสำรองของงาน (Reserve Release History)
            </h3>

            {report.reserveReleases.length === 0 ? (
              <div
                data-testid="empty-reserve-releases-message"
                style={{
                  textAlign: 'center',
                  padding: '24px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  color: '#64748b',
                  fontSize: '13px',
                }}
              >
                ยังไม่มีประวัติการปล่อยเงินสำรองสำหรับคอนเสิร์ตนี้
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '10px 12px' }}>รหัสรายการ</th>
                      <th style={{ padding: '10px 12px' }}>วันที่ปล่อย</th>
                      <th style={{ padding: '10px 12px' }}>ยอดที่ปล่อย (บาท)</th>
                      <th style={{ padding: '10px 12px' }}>หมายเหตุ</th>
                      <th style={{ padding: '10px 12px' }}>ผู้บันทึก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.reserveReleases.map(r => (
                      <tr
                        key={r.id}
                        data-testid={`reserve-release-row-${r.id}`}
                        style={{ borderBottom: '1px solid #f1f5f9' }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{r.id}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                          {formatDate(new Date(r.releasedAt))} {formatTime(new Date(r.releasedAt))} น.
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0284c7' }}>
                          ฿{r.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{r.notes || '-'}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{r.recordedByName || '-'}</td>
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
