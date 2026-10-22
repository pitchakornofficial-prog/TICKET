'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EventMoneyReportDetail } from '@/server/reports';
import { formatDate, formatTime } from '@/lib/locale';
import { RefreshIcon } from './icons';
import { AlertIcon } from './alert-icon';

export interface OrganizerMoneyReportViewProps {
  eventId: string;
  onClose?: () => void;
  apiEndpoint?: string; // default to '/api/organizer/events/${eventId}/money-report'
}

export function OrganizerMoneyReportView({
  eventId: _eventId,
  onClose,
  apiEndpoint = `/api/organizer/events/${_eventId}/money-report`,
}: OrganizerMoneyReportViewProps) {
  const [report, setReport] = useState<EventMoneyReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiEndpoint, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ไม่สามารถโหลดรายงานการเงินได้');
        return;
      }
      setReport(data.report);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อดึงรายงานการเงิน');
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div
      id="organizer-money-report-modal"
      className="money-report-card"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '24px',
        marginTop: '1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 4px 0' }}>
            รายงานการเงินและยอดพร้อมจ่าย (Organizer Financial Report — AC-28)
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            {report?.eventTitle || 'กำลังโหลด...'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={fetchReport}
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
          {onClose && (
            <button
              type="button"
              id="close-money-report-modal-btn"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              ปิดรายงาน
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
          กำลังคำนวณและประมวลผลรายงานการเงิน...
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}

      {!loading && report && (
        <div>
          {/* Fee settings banner */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              fontSize: '13px',
              color: '#1e3a8a',
            }}
          >
            <div>
              <strong>โหมดค่าบริการผู้จัดงาน:</strong>{' '}
              {report.organizerFeeMode === 'percentage'
                ? `คิดตามเปอร์เซ็นต์ (${report.organizerFeeRate}%)`
                : report.organizerFeeMode === 'per_ticket'
                  ? `คิดตามจำนวนใบ (฿${report.organizerFeeRate}/ใบ)`
                  : `คิดแบบเหมาจ่ายต่อคอนเสิร์ต (฿${report.organizerFeeRate})`}
            </div>
            <div>
              <strong>เงินสำรองที่ต้องกันไว้ (Reserve):</strong> {report.reservePercentage}% ของสิทธิ์สุทธิ
            </div>
          </div>

          {/* Debt Isolation Alert (AC-85, AC-86) */}
          {report.isDebt && (
            <div
              data-testid="debt-isolation-alert"
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#991b1b',
                fontSize: '13px',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                แจ้งเตือนยอดหนี้ค้างชำระ (Debt Outstanding — AC-85, AC-86)
              </div>
              <div>
                ยอดหนี้ค้างชำระจำนวน <strong>฿{report.debtAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>{' '}
                (ยอดเกินจ่ายจาก refund: ฿{report.excessPayoutRefundDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                {report.flatFeeDebt > 0 ? `, ค่าบริการเหมาจ่ายรอหัก: ฿${report.flatFeeDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : ''}){' '}
                จะถูกหักจากรายรับถัดไปของงานนี้เท่านั้น และไม่ถูกนำไปหักข้ามไปยังงานคอนเสิร์ตอื่นของผู้จัดงาน (AC-85)
              </div>
            </div>
          )}

          {/* KPI Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
              marginTop: '20px',
            }}
          >
            {/* Gross Sales */}
            <div
              className="kpi-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>ยอดขายบัตรทั้งหมด (Gross)</div>
              <div data-testid="gross-sales-amount" style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
                ฿{report.grossSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                ออกบัตรแล้ว {report.totalTicketsIssuedCount} ใบ
              </div>
            </div>

            {/* Approved Refund Deductions */}
            <div
              className="kpi-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>ยอดคืนเงินที่อนุมัติ (Refunds)</div>
              <div data-testid="refund-deductions-amount" style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc2626' }}>
                -฿{report.approvedRefundDeductions.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                คืนแล้ว {report.totalTicketsRefundedCount} ใบ
              </div>
            </div>

            {/* Net Sales */}
            <div
              className="kpi-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>ยอดขายสุทธิ (Net Sales)</div>
              <div data-testid="net-sales-amount" style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
                ฿{report.netSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                บัตรใช้งานได้ {report.totalTicketsValidCount} ใบ
              </div>
            </div>

            {/* Organizer Fee */}
            <div
              className="kpi-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>ค่าบริการระบบ (Organizer Fee)</div>
              <div data-testid="organizer-fee-amount" style={{ fontSize: '20px', fontWeight: 'bold', color: '#b45309' }}>
                -฿{report.organizerFee.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              {report.flatFeeCarry > 0 && (
                <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px' }}>
                  ค้างหักเหมาจ่าย: ฿{report.flatFeeCarry.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>

            {/* Net Entitlement E */}
            <div
              className="kpi-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>สิทธิ์สุทธิผู้จัดงาน (E)</div>
              <div data-testid="net-entitlement-amount" style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
                ฿{report.netEntitlement.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                ฐานยอดขายสุทธิ - ค่าบริการ
              </div>
            </div>

            {/* Reserve Target / Held */}
            <div
              className="kpi-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>เงินสำรองที่กันไว้จริง (Held H)</div>
              <div data-testid="held-reserve-amount" style={{ fontSize: '20px', fontWeight: 'bold', color: '#475569' }}>
                ฿{report.actualHeldReserve.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                เป้าหมายสำรอง: ฿{report.reserveTarget.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Total Paid Out P */}
            <div
              className="kpi-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>ยอดที่โอนจ่ายแล้ว (Paid P)</div>
              <div data-testid="total-paid-out-amount" style={{ fontSize: '20px', fontWeight: 'bold', color: '#0284c7' }}>
                ฿{report.totalPaidOut.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                {report.totalDebtRepaid > 0 ? `รับคืนหนี้แล้ว: ฿${report.totalDebtRepaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : 'โอนจ่ายตามรอบสำเร็จ'}
              </div>
            </div>

            {/* Payable Amount / Debt */}
            <div
              className="kpi-card"
              style={{
                backgroundColor: report.isDebt ? '#fef2f2' : '#f0fdf4',
                border: `2px solid ${report.isDebt ? '#ef4444' : '#16a34a'}`,
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: report.isDebt ? '#991b1b' : '#166534', fontWeight: 600, marginBottom: '4px' }}>
                {report.isDebt ? 'ยอดหนี้ค้างชำระ (Debt)' : 'ยอดพร้อมจ่าย (Payable)'}
              </div>
              <div data-testid={report.isDebt ? "debt-amount" : "payable-amount"} style={{ fontSize: '22px', fontWeight: 'bold', color: report.isDebt ? '#dc2626' : '#15803d' }}>
                {report.isDebt
                  ? `-฿${report.debtAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                  : `฿${report.payableAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
              </div>
              <div style={{ fontSize: '11px', color: report.isDebt ? '#991b1b' : '#166534', marginTop: '4px' }}>
                {report.isDebt ? 'ยอดจ่ายเกินสิทธิ์สุทธิจาก refund' : 'ยอดที่โอนให้ผู้จัดงานได้ทันที'}
              </div>
            </div>
          </div>

          {/* Session breakdown table */}
          {report.sessions.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginBottom: '12px' }}>
                สรุปยอดตามรอบการแสดง (Sessions)
              </h3>
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '10px 14px' }}>รอบการแสดง</th>
                      <th style={{ padding: '10px 14px' }}>สถานะรอบ</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>ออกบัตร (ใบ)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>บัตรคงเหลือ (ใบ)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>คืนบัตร (ใบ)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>ยอดขายรวม</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>ยอดคืนเงิน</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>ยอดสุทธิ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sessions.map((s, idx) => (
                      <tr key={s.sessionId} style={{ borderBottom: idx < report.sessions.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          {formatDate(new Date(s.sessionStartTime))} {formatTime(new Date(s.sessionStartTime))}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: s.sessionStatus === 'approved' ? '#dcfce7' : s.sessionStatus === 'cancelled' ? '#fee2e2' : '#f1f5f9',
                              color: s.sessionStatus === 'approved' ? '#166534' : s.sessionStatus === 'cancelled' ? '#991b1b' : '#475569',
                            }}
                          >
                            {s.sessionStatus === 'approved' ? 'เปิดขายปกติ' : s.sessionStatus === 'cancelled' ? 'ยกเลิกรอบ' : s.sessionStatus}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{s.issuedTicketsCount}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{s.validTicketsCount}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: s.refundedTicketsCount > 0 ? '#dc2626' : '#64748b' }}>
                          {s.refundedTicketsCount}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          ฿{s.grossSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: s.approvedRefunds > 0 ? '#dc2626' : '#64748b' }}>
                          {s.approvedRefunds > 0 ? `-฿${s.approvedRefunds.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'bold' }}>
                          ฿{s.netSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Line items orders table (AC-64, AC-110) */}
          <div style={{ marginTop: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
                รายการคำสั่งซื้อและค่าบริการรายคำสั่ง (Orders Breakdown — AC-110)
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                * ข้อมูลติดต่อผู้ซื้อถูกปิดบังบางส่วนเพื่อความปลอดภัย (AC-64)
              </span>
            </div>

            {report.orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', backgroundColor: '#f8fafc', borderRadius: '6px', color: '#64748b', fontSize: '13px' }}>
                ยังไม่มีรายการสั่งซื้อที่ชำระเงินสำเร็จ
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '10px 12px' }}>หมายเลขคำสั่งซื้อ</th>
                      <th style={{ padding: '10px 12px' }}>ผู้ซื้อ</th>
                      <th style={{ padding: '10px 12px' }}>อีเมล (Masked)</th>
                      <th style={{ padding: '10px 12px' }}>เบอร์โทร (Masked)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>จำนวนบัตร</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ยอดขายรวม</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ยอดคืนเงิน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ยอดขายสุทธิ</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ค่าบริการ (F_o)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ปรับค่าบริการ (ΔF_o)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.orders.map((o, idx) => (
                      <tr key={o.orderId} style={{ borderBottom: idx < report.orders.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{o.orderId}</td>
                        <td style={{ padding: '10px 12px' }}>{o.buyerName}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }} data-testid="masked-email">{o.buyerEmail}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }} data-testid="masked-phone">{o.buyerPhone}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {o.validTicketsCount} / {o.totalTicketsCount}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          ฿{o.grossSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: o.refundDeductions > 0 ? '#dc2626' : '#64748b' }}>
                          {o.refundDeductions > 0 ? `-฿${o.refundDeductions.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                          ฿{o.netSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b45309', fontWeight: 600 }}>
                          ฿{o.orderFeeAdjusted.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: o.feeAdjustment > 0 ? '#16a34a' : '#64748b' }}>
                          {o.feeAdjustment > 0 ? `-฿${o.feeAdjustment.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payout History Section (AC-31, AC-92) */}
          <div style={{ marginTop: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
                ประวัติการโอนเงินให้ผู้จัดงาน (Payout History — AC-31)
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                * ไฟล์หลักฐานการโอนเงินจำกัดสิทธิ์เฉพาะผู้ดูแลระบบ (AC-92)
              </span>
            </div>

            {report.payouts.length === 0 ? (
              <div
                data-testid="empty-payouts-message"
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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '10px 12px' }}>รหัสรายการ</th>
                      <th style={{ padding: '10px 12px' }}>วันที่บันทึกโอน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>จำนวนเงินที่โอน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>สถานะ</th>
                      <th style={{ padding: '10px 12px' }}>หมายเหตุ</th>
                      {report.payouts.some(p => p.transferProofUrl) && (
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>หลักฐาน (Owner)</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {report.payouts.map((p, idx) => (
                      <tr
                        key={p.id}
                        data-testid={`payout-row-${p.id}`}
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
                        {p.transferProofUrl && (
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
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
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Debt Repayment History Section (AC-86) */}
          <div style={{ marginTop: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
                ประวัติการรับชำระคืนหนี้จากผู้จัดงาน (Debt Repayment History — AC-86)
              </h3>
            </div>

            {report.repayments.length === 0 ? (
              <div
                data-testid="empty-repayments-message"
                style={{
                  textAlign: 'center',
                  padding: '24px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  color: '#64748b',
                  fontSize: '13px',
                }}
              >
                ยังไม่มีประวัติการบันทึกรับเงินคืนสำหรับคอนเสิร์ตนี้
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '10px 12px' }}>รหัสรายการ</th>
                      <th style={{ padding: '10px 12px' }}>วันที่บันทึกรับคืน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>จำนวนเงินที่รับคืน</th>
                      <th style={{ padding: '10px 12px' }}>หมายเหตุ</th>
                      <th style={{ padding: '10px 12px' }}>ผู้บันทึก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.repayments.map((rp, idx) => (
                      <tr
                        key={rp.id}
                        data-testid={`repayment-row-${rp.id}`}
                        style={{ borderBottom: idx < report.repayments.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                      >
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{rp.id}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          {formatDate(new Date(rp.repaidAt))} {formatTime(new Date(rp.repaidAt))}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>
                          ฿{rp.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{rp.notes || '-'}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{rp.recordedByName || 'ผู้ดูแลระบบ'}</td>
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
