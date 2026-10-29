'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { EventMoneyReportDetail, PayoutHistoryItem } from '@/server/reports';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import {
  BanknotesIcon,
  PrinterIcon,
  RefreshIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  ClockIcon,
  AlertTriangleIcon,
  SearchIcon,
  XIcon,
  EyeIcon,
  ChevronDownIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';

export interface OrganizerEventItem {
  id: string;
  title: string;
  location?: string;
  status: string;
}

export type FinanceTab = 'breakdown' | 'payouts';

export function OrganizerFinanceView() {
  const [events, setEvents] = useState<OrganizerEventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<FinanceTab>('breakdown');
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active event's report
  const [currentReport, setCurrentReport] = useState<EventMoneyReportDetail | null>(null);

  // All reports cache for top KPI aggregate
  const [allReports, setAllReports] = useState<Record<string, EventMoneyReportDetail>>({});

  // Search in concert selector
  const [concertSearchQuery, setConcertSearchQuery] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);

  // Selected payout for proof modal
  const [selectedPayout, setSelectedPayout] = useState<
    (PayoutHistoryItem & { eventTitle?: string }) | null
  >(null);

  // Scroll to top button
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedPayout) {
        setSelectedPayout(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPayout]);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1. Load organizer's events list
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scanner/events', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ไม่สามารถโหลดรายชื่อคอนเสิร์ตได้');
        return;
      }
      const loadedEvents: OrganizerEventItem[] = data.events || [];
      setEvents(loadedEvents);
      if (loadedEvents.length > 0) {
        setSelectedEventId((prev) => (prev ? prev : loadedEvents[0].id));
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อดึงข้อมูลคอนเสิร์ต');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // 2. Load report for selected event
  const loadReport = useCallback(async (eventId: string) => {
    if (!eventId) return;
    setReportLoading(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/money-report`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok && data.report) {
        setCurrentReport(data.report);
        setAllReports((prev) => ({ ...prev, [eventId]: data.report }));
      }
    } catch {
      // Keep previous report if fetch fails
    } finally {
      setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadReport(selectedEventId);
    }
  }, [selectedEventId, loadReport]);

  // Pre-load all reports in the background to calculate aggregate KPIs
  useEffect(() => {
    if (events.length > 0) {
      for (const ev of events) {
        if (!allReports[ev.id]) {
          fetch(`/api/organizer/events/${ev.id}/money-report`, { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.report) {
                setAllReports((prev) => ({ ...prev, [ev.id]: data.report }));
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [events, allReports]);

  // Refresh handler
  const handleRefresh = async () => {
    await loadEvents();
    if (selectedEventId) {
      await loadReport(selectedEventId);
    }
  };

  // Top Summary KPIs aggregated across loaded reports (or current report)
  const aggregatedKPIs = useMemo(() => {
    const reportList = Object.values(allReports);
    if (reportList.length === 0) {
      if (currentReport) {
        return {
          grossSales: currentReport.grossSales,
          totalTickets: currentReport.totalTicketsIssuedCount,
          feesAndRefunds: currentReport.organizerFee + currentReport.approvedRefundDeductions,
          payableAmount: currentReport.payableAmount,
          totalPaidOut: currentReport.totalPaidOut,
        };
      }
      return {
        grossSales: 0,
        totalTickets: 0,
        feesAndRefunds: 0,
        payableAmount: 0,
        totalPaidOut: 0,
      };
    }

    return reportList.reduce(
      (acc, r) => ({
        grossSales: acc.grossSales + r.grossSales,
        totalTickets: acc.totalTickets + r.totalTicketsIssuedCount,
        feesAndRefunds: acc.feesAndRefunds + r.organizerFee + r.approvedRefundDeductions,
        payableAmount: acc.payableAmount + r.payableAmount,
        totalPaidOut: acc.totalPaidOut + r.totalPaidOut,
      }),
      {
        grossSales: 0,
        totalTickets: 0,
        feesAndRefunds: 0,
        payableAmount: 0,
        totalPaidOut: 0,
      },
    );
  }, [allReports, currentReport]);

  // All payout records collected across all loaded reports
  const allPayouts = useMemo(() => {
    const reportList = Object.values(allReports);
    const combined: (PayoutHistoryItem & { eventTitle?: string })[] = [];
    for (const rep of reportList) {
      if (rep.payouts && rep.payouts.length > 0) {
        for (const p of rep.payouts) {
          combined.push({
            ...p,
            eventTitle: rep.eventTitle,
          });
        }
      }
    }
    // Sort by paidAt or createdAt desc
    return combined.sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime());
  }, [allReports]);

  // Filtered events for selector
  const filteredEventsForSelector = useMemo(() => {
    if (!concertSearchQuery.trim()) return events;
    const q = concertSearchQuery.toLowerCase().trim();
    return events.filter(
      (e) => e.title.toLowerCase().includes(q) || Boolean(e.location?.toLowerCase().includes(q)),
    );
  }, [events, concertSearchQuery]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="finance-management-container" data-testid="organizer-finance-view">
      {/* 1. Header Toolbar & Quick Utilities */}
      <header className="finance-management-header">
        <div className="finance-management-title-wrap">
          <h1 className="finance-management-title">รายงานการเงินและยอดรับเงิน</h1>
          <p className="finance-management-desc">
            ตรวจสอบภาพรวมรายได้จากการขายบัตร ยอดเงินสุทธิพร้อมรับ และประวัติการโอนเงินรายสัปดาห์
          </p>
        </div>
        <div className="finance-header-actions">
          <button
            type="button"
            className="finance-action-btn btn-print"
            onClick={() => window.print()}
            data-testid="finance-print-btn"
            title="พิมพ์หรือบันทึกเป็นเอกสาร PDF"
            aria-label="พิมพ์หรือบันทึกเป็นเอกสาร PDF"
          >
            <PrinterIcon width={16} height={16} />
            <span>พิมพ์ / บันทึก PDF รายงาน</span>
          </button>
          <button
            type="button"
            className="finance-action-btn btn-refresh"
            onClick={handleRefresh}
            disabled={loading || reportLoading}
            data-testid="finance-refresh-btn"
            title="รีเฟรชข้อมูลการเงินล่าสุด"
            aria-label="รีเฟรชข้อมูลการเงินล่าสุด"
          >
            <RefreshIcon width={16} height={16} className={reportLoading ? 'icon-spinning' : ''} />
            <span>รีเฟรชข้อมูล</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="finance-alert-banner error" role="alert">
          <AlertTriangleIcon width={18} height={18} />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Top Summary 4-KPI Strip (ภาพรวมการเงินทุกคอนเสิร์ต) */}
      <section className="finance-summary-strip" aria-label="ภาพรวมสรุปตัวเลขการเงินทุกคอนเสิร์ต">
        {/* KPI 1: Total Gross Sales */}
        <div className="finance-kpi-card" data-testid="finance-kpi-gross">
          <div className="finance-kpi-header">
            <span className="finance-kpi-label">ยอดขายบัตรทั้งหมด</span>
            <div className="finance-kpi-icon-wrap" aria-hidden="true">
              <TicketIcon style={{ width: '18px', height: '18px' }} />
            </div>
          </div>
          <div className="finance-kpi-value" data-testid="finance-gross-value">
            {formatBaht(aggregatedKPIs.grossSales)}
          </div>
          <div className="finance-kpi-sub">ออกบัตรแล้วรวม {aggregatedKPIs.totalTickets} ใบ</div>
        </div>

        {/* KPI 2: Fees & Refunds */}
        <div className="finance-kpi-card" data-testid="finance-kpi-fees">
          <div className="finance-kpi-header">
            <span className="finance-kpi-label">ค่าบริการและคืนเงิน</span>
            <div className="finance-kpi-icon-wrap" aria-hidden="true">
              <BanknotesIcon width={18} height={18} />
            </div>
          </div>
          <div className="finance-kpi-value value-negative" data-testid="finance-fees-value">
            -{formatBaht(aggregatedKPIs.feesAndRefunds)}
          </div>
          <div className="finance-kpi-sub">ค่าบริการระบบ 3%/5% และยอดคืนเงิน</div>
        </div>

        {/* KPI 3: Net Ready for Payout (Highlight) */}
        <div className="finance-kpi-card highlight-payable" data-testid="finance-kpi-payable">
          <div className="finance-kpi-header">
            <span className="finance-kpi-label">ยอดเงินสุทธิพร้อมรับ / รอบถัดไป</span>
            <div className="finance-kpi-icon-wrap" aria-hidden="true">
              <CheckCircleIcon width={18} height={18} />
            </div>
          </div>
          <div className="finance-kpi-value value-payable" data-testid="finance-payable-value">
            {formatBaht(aggregatedKPIs.payableAmount)}
          </div>
          <div className="finance-kpi-sub">โอนเข้าบัญชีผู้จัดทุกวันจันทร์</div>
        </div>

        {/* KPI 4: Total Paid Out */}
        <div className="finance-kpi-card" data-testid="finance-kpi-paidout">
          <div className="finance-kpi-header">
            <span className="finance-kpi-label">ยอดเงินโอนแล้วทั้งหมด</span>
            <div className="finance-kpi-icon-wrap" aria-hidden="true">
              <ShieldCheckIcon width={18} height={18} />
            </div>
          </div>
          <div className="finance-kpi-value" data-testid="finance-paidout-value">
            {formatBaht(aggregatedKPIs.totalPaidOut)}
          </div>
          <div className="finance-kpi-sub">โอนเข้าบัญชีหลักสำเร็จแล้ว</div>
        </div>
      </section>

      {/* 3. Two Core Tabs Navigation */}
      <nav className="finance-tabs-nav" aria-label="แถบสลับรายงานการเงิน">
        <button
          type="button"
          className={`finance-tab-btn ${activeTab === 'breakdown' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('breakdown')}
          data-testid="finance-tab-breakdown"
        >
          <BanknotesIcon width={16} height={16} />
          <span>รายงานแยกรายคอนเสิร์ต</span>
        </button>
        <button
          type="button"
          className={`finance-tab-btn ${activeTab === 'payouts' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('payouts')}
          data-testid="finance-tab-payouts"
        >
          <ClockIcon width={16} height={16} />
          <span>ประวัติรอบโอนเงิน ({allPayouts.length})</span>
        </button>
      </nav>

      {/* 4. TAB 1: CONCERT BREAKDOWN */}
      {activeTab === 'breakdown' && (
        <div className="finance-breakdown-view" data-testid="finance-breakdown-view">
          {/* Concert Selector Bar */}
          <div className="finance-selector-bar">
            <div className="finance-selector-label-col">
              <label htmlFor="finance-concert-selector-input" className="finance-selector-label">
                เลือกคอนเสิร์ตที่ต้องการดูรายงาน:
              </label>
              <div className="finance-selector-dropdown-wrap">
                <button
                  id="finance-concert-selector-input"
                  type="button"
                  className="finance-selector-button"
                  onClick={() => setSelectorOpen(!selectorOpen)}
                  aria-expanded={selectorOpen}
                  data-testid="finance-concert-selector-btn"
                >
                  <TicketIcon style={{ width: '16px', height: '16px', color: '#64748b' }} />
                  <span className="finance-selector-selected-title">
                    {selectedEvent ? selectedEvent.title : 'เลือกคอนเสิร์ต'}
                  </span>
                  <ChevronDownIcon width={16} height={16} className="finance-selector-chevron" />
                </button>

                {selectorOpen && (
                  <div className="finance-selector-menu" data-testid="finance-selector-menu">
                    <div className="finance-selector-search-box">
                      <SearchIcon width={14} height={14} />
                      <input
                        type="text"
                        placeholder="พิมพ์ค้นหาชื่องานคอนเสิร์ต..."
                        value={concertSearchQuery}
                        onChange={(e) => setConcertSearchQuery(e.target.value)}
                        className="finance-selector-search-input"
                      />
                      {concertSearchQuery && (
                        <button
                          type="button"
                          className="finance-selector-search-clear"
                          onClick={() => setConcertSearchQuery('')}
                        >
                          <XIcon width={12} height={12} />
                        </button>
                      )}
                    </div>
                    <ul className="finance-selector-items-list">
                      {filteredEventsForSelector.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            className={`finance-selector-item ${e.id === selectedEventId ? 'is-selected' : ''}`}
                            onClick={() => {
                              setSelectedEventId(e.id);
                              setSelectorOpen(false);
                            }}
                            data-testid={`finance-select-event-${e.id}`}
                          >
                            <span className="finance-selector-item-title">{e.title}</span>
                            <span className="finance-selector-item-status">{e.status}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {selectedEvent && (
              <div className="finance-selected-event-meta">
                <span className="finance-badge-event-status">{selectedEvent.status}</span>
                {selectedEvent.location && (
                  <span className="finance-selected-location">{selectedEvent.location}</span>
                )}
              </div>
            )}
          </div>

          {/* Current Event's Detailed Report */}
          {reportLoading ? (
            <div className="finance-loading-box">
              <RefreshIcon width={24} height={24} className="icon-spinning" />
              <span>กำลังคำนวณและประมวลผลรายงานการเงิน...</span>
            </div>
          ) : currentReport ? (
            <div className="finance-report-details" data-testid="finance-report-details">
              {/* Fee Mode & Reserve Settings Banner */}
              <div className="finance-fee-info-banner">
                <div className="finance-fee-info-item">
                  <strong>โหมดค่าบริการผู้จัดงาน:</strong>{' '}
                  {currentReport.organizerFeeMode === 'percentage'
                    ? `คิดตามเปอร์เซ็นต์ (${currentReport.organizerFeeRate}%)`
                    : currentReport.organizerFeeMode === 'per_ticket'
                      ? `คิดตามจำนวนใบ (฿${currentReport.organizerFeeRate}/ใบ)`
                      : `คิดแบบเหมาจ่ายต่อคอนเสิร์ต (฿${currentReport.organizerFeeRate})`}
                </div>
                <div className="finance-fee-info-item">
                  <strong>เงินสำรองที่ต้องกันไว้ (Reserve):</strong> {currentReport.reservePercentage}% ของสิทธิ์สุทธิ
                </div>
              </div>

              {/* Debt Isolation Alert (AC-85, AC-86) */}
              {currentReport.isDebt && (
                <div className="finance-debt-alert-banner" data-testid="debt-isolation-alert">
                  <div className="finance-debt-alert-head">
                    <AlertTriangleIcon width={18} height={18} />
                    <strong>แจ้งเตือนยอดหนี้ค้างชำระ (Debt Outstanding — AC-85, AC-86)</strong>
                  </div>
                  <p className="finance-debt-alert-body">
                    ยอดหนี้ค้างชำระจำนวน <strong>{formatBaht(currentReport.debtAmount)}</strong>{' '}
                    (ยอดเกินจ่ายจากการคืนเงิน: {formatBaht(currentReport.excessPayoutRefundDebt)}
                    {currentReport.flatFeeDebt > 0
                      ? `, ค่าบริการเหมาจ่ายรอหัก: ${formatBaht(currentReport.flatFeeDebt)}`
                      : ''}){' '}
                    จะถูกหักจากรายรับถัดไปของคอนเสิร์ตนี้เท่านั้น และจะไม่ถูกนำไปหักข้ามไปยังงานคอนเสิร์ตอื่นของผู้จัดงาน (AC-85)
                  </p>
                </div>
              )}

              {/* Event Detailed Financial Metric Cards */}
              <div className="finance-event-metrics-grid">
                {/* Gross Sales */}
                <div className="finance-event-metric-card">
                  <span className="finance-event-metric-label">ยอดขายบัตรทั้งหมด (Gross)</span>
                  <div className="finance-event-metric-num" data-testid="gross-sales-amount">
                    {formatBaht(currentReport.grossSales)}
                  </div>
                  <span className="finance-event-metric-hint">
                    ออกบัตรแล้ว {currentReport.totalTicketsIssuedCount} ใบ
                  </span>
                </div>

                {/* Approved Refunds */}
                <div className="finance-event-metric-card">
                  <span className="finance-event-metric-label">ยอดคืนเงินที่อนุมัติ (Refunds)</span>
                  <div className="finance-event-metric-num value-negative" data-testid="refund-deductions-amount">
                    -{formatBaht(currentReport.approvedRefundDeductions)}
                  </div>
                  <span className="finance-event-metric-hint">
                    คืนแล้ว {currentReport.totalTicketsRefundedCount} ใบ
                  </span>
                </div>

                {/* Net Sales */}
                <div className="finance-event-metric-card">
                  <span className="finance-event-metric-label">ยอดขายสุทธิ (Net Sales)</span>
                  <div className="finance-event-metric-num" data-testid="net-sales-amount">
                    {formatBaht(currentReport.netSales)}
                  </div>
                  <span className="finance-event-metric-hint">
                    บัตรที่ใช้งานได้ {currentReport.totalTicketsValidCount} ใบ
                  </span>
                </div>

                {/* Platform Fee */}
                <div className="finance-event-metric-card">
                  <span className="finance-event-metric-label">ค่าบริการระบบ (Platform Fee)</span>
                  <div className="finance-event-metric-num value-negative" data-testid="organizer-fee-amount">
                    -{formatBaht(currentReport.organizerFee)}
                  </div>
                  {currentReport.flatFeeCarry > 0 && (
                    <span className="finance-event-metric-hint text-warning">
                      ค้างหักเหมาจ่าย: {formatBaht(currentReport.flatFeeCarry)}
                    </span>
                  )}
                </div>

                {/* Reserve Amount */}
                <div className="finance-event-metric-card">
                  <span className="finance-event-metric-label">เงินสำรองกันไว้จริง (Reserve {currentReport.reservePercentage}%)</span>
                  <div className="finance-event-metric-num" data-testid="reserve-amount">
                    {formatBaht(currentReport.actualHeldReserve)}
                  </div>
                  <span className="finance-event-metric-hint">
                    เป้าหมายสำรอง: {formatBaht(currentReport.reserveTarget)}
                  </span>
                </div>

                {/* Ready for Payout */}
                <div className="finance-event-metric-card highlight-payable">
                  <span className="finance-event-metric-label">ยอดพร้อมรับ / โอนรอบถัดไป</span>
                  <div className="finance-event-metric-num value-payable" data-testid="payable-amount">
                    {formatBaht(currentReport.payableAmount)}
                  </div>
                  <span className="finance-event-metric-hint">
                    โอนเข้าบัญชีผู้จัดในรอบวันจันทร์ถัดไป
                  </span>
                </div>
              </div>

              {/* Sessions & Financial Summary Table */}
              <div className="finance-sessions-breakdown-card">
                <h3 className="finance-section-subhead">แจกแจงรายรอบการแสดงและยอดจำหน่ายบัตร</h3>
                {currentReport.sessions && currentReport.sessions.length > 0 ? (
                  <div className="finance-sessions-list">
                    {currentReport.sessions.map((sess) => (
                      <div key={sess.sessionId} className="finance-session-block">
                        <div className="finance-session-head">
                          <span className="finance-session-time">
                            รอบการแสดง: {formatDate(new Date(sess.sessionStartTime))} {formatTime(new Date(sess.sessionStartTime))} - {formatTime(new Date(sess.sessionEndTime))} น.
                          </span>
                          <span className="finance-session-status">{sess.sessionStatus}</span>
                        </div>
                        <div className="finance-table-responsive">
                          <table className="finance-table">
                            <thead>
                              <tr className="finance-table-row">
                                <th className="finance-table-th">ตัวชี้วัด</th>
                                <th className="finance-table-th text-right">บัตรออกแล้ว</th>
                                <th className="finance-table-th text-right">คืนเงินแล้ว</th>
                                <th className="finance-table-th text-right">บัตรที่ใช้ได้</th>
                                <th className="finance-table-th text-right">ยอดขายรวม (Gross)</th>
                                <th className="finance-table-th text-right">ยอดขายสุทธิ (Net)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="finance-table-row">
                                <td className="finance-table-td"><strong>สรุปยอดรอบนี้</strong></td>
                                <td className="finance-table-td text-right">{sess.issuedTicketsCount} ใบ</td>
                                <td className="finance-table-td text-right text-muted">{sess.refundedTicketsCount} ใบ</td>
                                <td className="finance-table-td text-right font-semibold">{sess.validTicketsCount} ใบ</td>
                                <td className="finance-table-td text-right font-semibold">{formatBaht(sess.grossSales)}</td>
                                <td className="finance-table-td text-right font-bold text-emerald">{formatBaht(sess.netSales)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="finance-empty-hint">ยังไม่มีข้อมูลรอบการแสดงสำหรับคอนเสิร์ตนี้</p>
                )}
              </div>
            </div>
          ) : (
            <div className="finance-empty-report-state">
              <TicketIcon style={{ width: '36px', height: '36px', color: '#94a3b8' }} />
              <h4>ยังไม่มีข้อมูลคอนเสิร์ตที่เลือก</h4>
              <p>กรุณาเลือกคอนเสิร์ตจากเมนูด้านบนเพื่อเรียกดูรายงานการเงิน</p>
            </div>
          )}
        </div>
      )}

      {/* 5. TAB 2: PAYOUT HISTORY */}
      {activeTab === 'payouts' && (
        <div className="finance-payouts-view" data-testid="finance-payouts-view">
          <div className="finance-payouts-card">
            <div className="finance-payouts-head-bar">
              <div>
                <h3 className="finance-section-subhead" style={{ margin: 0 }}>ประวัติการโอนเงินเข้าบัญชี (Payout History)</h3>
                <p className="finance-section-desc">
                  ระบบจะตัดรอบการขายทุกคืนวันอาทิตย์ และดำเนินการโอนเงินสุทธิเข้าบัญชีหลักของผู้จัดงานทุกวันจันทร์
                </p>
              </div>
              <span className="finance-payouts-count-badge">ทั้งหมด {allPayouts.length} รายการ</span>
            </div>

            {allPayouts.length > 0 ? (
              <div className="finance-table-responsive">
                <table className="finance-table payouts-table">
                  <thead>
                    <tr className="finance-table-row">
                      <th className="finance-table-th">วันที่โอน</th>
                      <th className="finance-table-th">คอนเสิร์ต</th>
                      <th className="finance-table-th text-right">ยอดเงินโอนสุทธิ</th>
                      <th className="finance-table-th">สถานะ</th>
                      <th className="finance-table-th">บันทึกโดย</th>
                      <th className="finance-table-th text-center">หลักฐาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPayouts.map((payout) => (
                      <tr key={payout.id} className="finance-table-row" data-testid={`payout-row-${payout.id}`}>
                        <td className="finance-table-td">
                          {payout.paidAt ? formatDate(new Date(payout.paidAt)) : formatDate(new Date(payout.createdAt))}
                        </td>
                        <td className="finance-table-td">
                          <strong>{payout.eventTitle || 'คอนเสิร์ต'}</strong>
                        </td>
                        <td className="finance-table-td text-right font-bold text-emerald">
                          {formatBaht(payout.amount)}
                        </td>
                        <td className="finance-table-td">
                          {payout.status === 'completed' ? (
                            <span className="finance-badge-completed">โอนสำเร็จแล้ว</span>
                          ) : (
                            <span className="finance-badge-failed">โอนไม่สำเร็จ</span>
                          )}
                        </td>
                        <td className="finance-table-td text-muted text-sm">
                          {payout.recordedByName || 'เจ้าของระบบ (Owner)'}
                        </td>
                        <td className="finance-table-td text-center">
                          <button
                            type="button"
                            className="finance-proof-btn"
                            onClick={() => setSelectedPayout(payout)}
                            data-testid={`view-payout-proof-${payout.id}`}
                            title="ดูรายละเอียดการโอนเงิน"
                          >
                            <EyeIcon width={14} height={14} />
                            <span>ดูสลิป / รายละเอียด</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="finance-payouts-empty-state" data-testid="finance-payouts-empty">
                <ClockIcon width={36} height={36} className="finance-empty-icon" />
                <h4>ยังไม่มีประวัติการโอนเงินในขณะนี้</h4>
                <p>
                  เมื่อมียอดจำหน่ายบัตรและถึงรอบตัดยอดประจำสัปดาห์ เจ้าของระบบจะดำเนินการโอนเงินเข้าบัญชีหลักและบันทึกประวัติการโอนไว้ที่นี่
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Payout Detail & Transfer Proof Modal */}
      {selectedPayout && (
        <div className="finance-modal-backdrop" role="presentation">
          <div
            className="finance-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payout-modal-title"
          >
            <div className="finance-modal-header">
              <div className="finance-modal-title-col">
                <span className="finance-modal-badge">หลักฐานการโอนเงิน</span>
                <h3 id="payout-modal-title" className="finance-modal-title">
                  รายละเอียดการโอนเงินรายสัปดาห์
                </h3>
              </div>
              <button
                type="button"
                className="finance-modal-close-btn"
                onClick={() => setSelectedPayout(null)}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon width={16} height={16} />
              </button>
            </div>

            <div className="finance-modal-body">
              <div className="finance-proof-summary-box">
                <span className="finance-proof-amount-label">ยอดเงินที่โอนสำเร็จ</span>
                <div className="finance-proof-amount-val">{formatBaht(selectedPayout.amount)}</div>
                <span className="finance-proof-status-pill">โอนเข้าบัญชีเรียบร้อย</span>
              </div>

              <div className="finance-proof-details-list">
                <div className="finance-proof-row">
                  <span className="proof-label">คอนเสิร์ต:</span>
                  <span className="proof-value"><strong>{selectedPayout.eventTitle || 'คอนเสิร์ต'}</strong></span>
                </div>
                <div className="finance-proof-row">
                  <span className="proof-label">วันและเวลาที่โอน:</span>
                  <span className="proof-value">
                    {selectedPayout.paidAt ? formatDate(new Date(selectedPayout.paidAt)) : formatDate(new Date(selectedPayout.createdAt))}
                  </span>
                </div>
                <div className="finance-proof-row">
                  <span className="proof-label">ผู้บันทึกการโอน:</span>
                  <span className="proof-value">{selectedPayout.recordedByName || 'เจ้าของระบบ TICKET'}</span>
                </div>
                {selectedPayout.transferNote && (
                  <div className="finance-proof-row">
                    <span className="proof-label">หมายเหตุการโอน:</span>
                    <span className="proof-value">{selectedPayout.transferNote}</span>
                  </div>
                )}
                {selectedPayout.transferProofKey && (
                  <div className="finance-proof-row">
                    <span className="proof-label">เลขอ้างอิงสลิป:</span>
                    <span className="proof-value font-mono">{selectedPayout.transferProofKey}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="finance-modal-footer">
              <button
                type="button"
                className="finance-modal-btn-close"
                onClick={() => setSelectedPayout(null)}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Back-to-Top Button */}
      {showScrollTop && (
        <button
          type="button"
          className="floating-back-to-top"
          onClick={handleScrollToTop}
          title="กลับสู่ด้านบนสุด"
          aria-label="กลับสู่ด้านบนสุด"
          data-testid="finance-back-to-top-btn"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
