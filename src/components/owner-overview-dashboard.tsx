'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { OwnerOverviewCounts, OwnerOverviewSales } from '@/server/overview';
import type { OwnerSectionId } from '@/components/owner-workspace-view';
import {
  ClipboardCheckIcon,
  CheckCircleIcon,
  BanknotesIcon,
  AlertTriangleIcon,
  SlidersIcon,
  RefreshIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  ClockIcon,
  BellIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';
import { HeaderInfoTooltip } from '@/components/header-info-tooltip';
import { formatBaht } from '@/lib/locale';
import { triggerRefreshToast } from '@/components/toast-notification';

interface MetricCardConfig {
  id: string;
  section: OwnerSectionId;
  targetManagerId: string;
  label: string;
  sub: string;
  icon: typeof ClipboardCheckIcon;
  source: 'counts' | 'sales';
  countKey:
    | keyof Omit<OwnerOverviewCounts, 'totalPending'>
    | 'pendingPayouts';
  tooltip: string;
}

const METRIC_CARDS: MetricCardConfig[] = [
  {
    id: 'pending-sessions',
    section: 'approval',
    targetManagerId: 'owner-session-approval-manager',
    label: 'รอบ / แก้ไข / ยกเลิก',
    sub: 'รออนุมัติเปิดขายหรือปรับปรุง',
    icon: ClipboardCheckIcon,
    source: 'counts',
    countKey: 'pendingSessions',
    tooltip: 'รอบการแสดงคอนเสิร์ตใหม่ คำขอปรับเปลี่ยนราคา/โซน หรือคำขอยกเลิกรอบที่รอเจ้าของระบบตรวจสอบอนุมัติ',
  },
  {
    id: 'pending-refunds',
    section: 'approval',
    targetManagerId: 'owner-refund-approval-manager',
    label: 'คำขอคืนเงิน',
    sub: 'ลูกค้ายื่นขอคืนเงินรอตรวจ',
    icon: CheckCircleIcon,
    source: 'counts',
    countKey: 'pendingRefunds',
    tooltip: 'คำขอคืนเงินจากลูกค้าที่มีคุณสมบัติตามนโยบาย เช่น รอบการแสดงถูกยกเลิก หรือเลื่อนวันแสดง',
  },
  {
    id: 'pending-news',
    section: 'system',
    targetManagerId: 'owner-news-manager',
    label: 'ข่าวรออนุมัติ',
    sub: 'ข่าวจากผู้จัดงานรอเผยแพร่',
    icon: BellIcon,
    source: 'counts',
    countKey: 'pendingNews',
    tooltip: 'ข่าวสารหรือประกาศที่ผู้จัดงานส่งคำขอให้เจ้าของระบบตรวจสอบก่อนเผยแพร่ขึ้นหน้าเว็บ',
  },
  {
    id: 'pending-payouts',
    section: 'finance',
    targetManagerId: 'owner-weekly-payout-manager',
    label: 'ยอดรอโอน / เงินสำรอง',
    sub: 'งานที่มียอดรอสรุปโอนผู้จัด',
    icon: BanknotesIcon,
    source: 'sales',
    countKey: 'pendingPayouts',
    tooltip: 'จำนวนงานคอนเสิร์ตที่มียอดเงินสุทธิรอโอนหรือเงินสำรองค้างอยู่ในรอบการเงิน',
  },
  {
    id: 'payment-exceptions',
    section: 'finance',
    targetManagerId: 'owner-payment-recovery-manager',
    label: 'เงินเข้าล่าช้า / ผิดปกติ',
    sub: 'จ่ายช้าหลัง deadline หรือเกินรอบ',
    icon: BanknotesIcon,
    source: 'counts',
    countKey: 'paymentExceptions',
    tooltip: 'รายการชำระเงินที่ระบบตัดเงินสำเร็จแต่ผู้ซื้อชำระหลังเวลาหมดอายุ หรือยอดเงินไม่ตรงกับรายการสั่งซื้อ',
  },
  {
    id: 'failed-emails',
    section: 'customer',
    targetManagerId: 'owner-email-deliveries-manager',
    label: 'อีเมลส่งไม่สำเร็จ',
    sub: 'ส่งบัตรไม่สำเร็จรอการส่งใหม่',
    icon: AlertTriangleIcon,
    source: 'counts',
    countKey: 'failedEmails',
    tooltip: 'รายการส่งอีเมลยืนยันคำสั่งซื้อหรือส่งตั๋วอิเล็กทรอนิกส์ล้มเหลว รอการตรวจสอบและกดส่งซ้ำ',
  },
  {
    id: 'sync-conflicts',
    section: 'system',
    targetManagerId: 'owner-sync-conflicts-manager',
    label: 'ข้อมูลสแกนขัดแย้ง',
    sub: 'ออฟไลน์ขัดแย้งกับระบบกลาง',
    icon: SlidersIcon,
    source: 'counts',
    countKey: 'syncConflicts',
    tooltip: 'ข้อขัดแย้งของข้อมูลการสแกนบัตรหน้างานที่ทำงานแบบออฟไลน์แล้วพบสถานะไม่ตรงกับฐานข้อมูลกลาง',
  },
];

export interface OwnerOverviewDashboardProps {
  onNavigateToSection: (section: OwnerSectionId, targetManagerId: string) => void;
  isFullOverview?: boolean;
}

export function OwnerOverviewDashboard({
  onNavigateToSection,
  isFullOverview = false,
}: OwnerOverviewDashboardProps) {
  const [counts, setCounts] = useState<OwnerOverviewCounts | null>(null);
  const [sales, setSales] = useState<OwnerOverviewSales | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chartMode, setChartMode] = useState<'bar' | 'line'>('line');
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('7d');
  const [isCompactViewport, setIsCompactViewport] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const syncViewport = () => setIsCompactViewport(mq.matches);
    syncViewport();
    mq.addEventListener('change', syncViewport);
    return () => mq.removeEventListener('change', syncViewport);
  }, []);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(isFullOverview ? '/api/owner/overview?sales=true' : '/api/owner/overview', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('โหลดข้อมูลภาพรวมไม่สำเร็จ');
      const { sales, ...counts }: OwnerOverviewCounts & { sales?: OwnerOverviewSales } = await res.json();
      if (isFullOverview && !sales) throw new Error('โหลดข้อมูลยอดขายไม่สำเร็จ');
      setCounts(counts);
      setSales(sales ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการดึงข้อมูล');
    } finally {
      setLoading(false);
    }
  }, [isFullOverview]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleCardClick = (card: MetricCardConfig) => {
    onNavigateToSection(card.section, card.targetManagerId);
  };

  const totalPending = counts?.totalPending ?? 0;

  const barChartEvents = useMemo(() => sales?.concerts ?? [], [sales]);
  const maxBarSales = Math.max(...barChartEvents.map(event => event.sales), 1);
  const topPerformingConcerts = useMemo(
    () => [...barChartEvents].sort((a, b) => b.sales - a.sales || b.soldCount - a.soldCount || a.id.localeCompare(b.id)).slice(0, 5),
    [barChartEvents],
  );
  const lineChartData = useMemo(() => sales?.trend[timeRange] ?? [], [sales, timeRange]);
  const totalGrossRevenue = sales?.grossSales ?? 0;

  const formatChartBaht = (amount: number) => {
    if (Number.isInteger(amount)) {
      return `฿${amount.toLocaleString('en-US')}`;
    }
    return formatBaht(amount);
  };

  const maxLineValue = useMemo(() => {
    const rawMax = Math.max(...lineChartData.map((d) => d.value), 0);
    if (rawMax <= 0) return 300;
    const rawStep = rawMax / 3;
    const mag = 10 ** Math.floor(Math.log10(rawStep));
    const norm = rawStep / mag;
    const niceMult = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m >= norm) ?? 10;
    return Math.round(niceMult * mag * 3);
  }, [lineChartData]);

  const selectedPeriodSales = useMemo(() => {
    if (chartMode === 'bar') {
      return totalGrossRevenue;
    }
    return lineChartData.reduce((acc, cur) => acc + (cur.value || 0), 0);
  }, [chartMode, totalGrossRevenue, lineChartData]);

  const selectedPeriodEstFee = useMemo(() => {
    if (chartMode === 'bar') {
      return sales?.platformFee ?? 0;
    }
    const effectiveRate =
      totalGrossRevenue > 0 && typeof sales?.platformFee === 'number'
        ? sales.platformFee / totalGrossRevenue
        : 0.03;
    return Math.round(selectedPeriodSales * effectiveRate);
  }, [chartMode, sales?.platformFee, totalGrossRevenue, selectedPeriodSales]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return 'อนุมัติแล้ว';
      case 'pending_approval':
        return 'รออนุมัติ';
      case 'rejected':
        return 'ปฏิเสธ';
      case 'cancelled':
        return 'ยกเลิกแล้ว';
      default:
        return 'สถานะปกติ';
    }
  };

  return (
    <div className={`owner-overview-wrapper ${isFullOverview ? 'full-overview' : 'compact-overview'}`}>
      {/* 1. Single Clean Header & Actions Inline (D-122 Baseline) */}
      {isFullOverview && (
        <div className="owner-overview-top-row">
          <header className="owner-overview-header-toolbar">
            <div className="owner-overview-header-titles">
              <h1 className="owner-overview-header-title">ภาพรวมระบบจัดการ</h1>
              <p className="owner-overview-header-subtitle">
                ติดตามงานค้างรอตัดสินใจ ยอดขาย และความเคลื่อนไหวทั้งแพลตฟอร์ม
              </p>
            </div>
          </header>

          <div className="owner-overview-quick-actions-bar">
            <div className="owner-overview-header-actions">
              <button
                type="button"
                className="secondary-button owner-overview-action-btn"
                data-testid="owner-overview-invite-btn"
                onClick={() => onNavigateToSection('invitations', 'invite-organizer-form')}
              >
                <UserPlusIcon style={{ width: '16px', height: '16px' }} />
                <span>เชิญผู้จัดงานใหม่</span>
              </button>

              <button
                type="button"
                className="secondary-button owner-overview-action-btn overview-refresh-btn"
                data-testid="owner-overview-refresh-btn"
                onClick={async () => {
                  await fetchOverview();
                  triggerRefreshToast('ภาพรวม');
                }}
                disabled={loading}
                aria-label="รีเฟรชข้อมูลภาพรวม"
              >
                <RefreshIcon style={{ width: '16px', height: '16px' }} className={`btn-icon ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Top 4 Monochrome Platform KPI Summary Cards */}
      {isFullOverview && (
        <section className="owner-kpi-grid" aria-label="สรุปตัวชี้วัดสำคัญระดับแพลตฟอร์ม">
          <div className="overview-kpi-card pure-kpi" data-testid="owner-kpi-concerts">
            <div className="overview-kpi-header">
              <span className="overview-kpi-title">
                คอนเสิร์ตในระบบ
                <HeaderInfoTooltip text="จำนวนคอนเสิร์ตทั้งหมดที่ลงทะเบียนในระบบ และจำนวนงานที่กำลังเปิดจำหน่ายบัตร ณ ปัจจุบัน" />
              </span>
              <TicketIcon className="overview-borderless-icon" />
            </div>
            <div className="overview-kpi-value">
              {sales?.openEvents ?? '–'}{' '}
              <span className="overview-kpi-unit">งานเปิดขาย</span>
            </div>
            <div className="overview-kpi-footer">
              <span className="overview-kpi-subtext">จากทั้งหมด {sales?.totalEvents ?? '–'} งาน</span>
            </div>
          </div>

          <div className="overview-kpi-card pure-kpi" data-testid="owner-kpi-pending">
            <div className="overview-kpi-header">
              <span className="overview-kpi-title">
                งานค้างรอตัดสินใจ
                <HeaderInfoTooltip text="จำนวนรายการที่ต้องรอให้เจ้าของระบบตรวจสอบและตัดสินใจ เช่น รอบการแสดง ข่าวสาร คำขอคืนเงิน หรือข้อผิดพลาดระบบ" />
              </span>
              <ClockIcon className="overview-borderless-icon" />
            </div>
            <div className={`overview-kpi-value ${totalPending > 0 ? 'text-amber' : ''}`}>
              {totalPending}{' '}
              <span className="overview-kpi-unit">รายการ</span>
            </div>
            <div className="overview-kpi-footer">
              <span className="overview-kpi-subtext">
                {totalPending > 0 ? 'มีรายการรอตรวจสอบ' : 'คิวงานปกติทั้งหมด'}
              </span>
            </div>
          </div>

          <div className="overview-kpi-card pure-kpi" data-testid="owner-kpi-revenue">
            <div className="overview-kpi-header">
              <span className="overview-kpi-title">
                ยอดจำหน่ายบัตรรวมทั้งระบบ
                <HeaderInfoTooltip text="ยอดเงินสะสมจากการจำหน่ายบัตรคอนเสิร์ตทุกงานในแพลตฟอร์มก่อนหักค่าบริการ" />
              </span>
              <BanknotesIcon className="overview-borderless-icon" />
            </div>
            <div className="overview-kpi-value">
              {sales ? formatBaht(totalGrossRevenue) : '–'}
            </div>
            <div className="overview-kpi-footer">
              <span className="overview-kpi-subtext">ยอดขายรวมก่อนหักค่าบริการ</span>
            </div>
          </div>

          <div className="overview-kpi-card pure-kpi" data-testid="owner-kpi-system">
            <div className="overview-kpi-header">
              <span className="overview-kpi-title">
                ค่าบริการที่เรียกเก็บจากผู้จัดงาน
                <HeaderInfoTooltip text="ยอดค่าบริการผู้จัดงานรวมตามรายงานการเงินของแต่ละงาน" />
              </span>
              <ShieldCheckIcon className="overview-borderless-icon" />
            </div>
            <div className="overview-kpi-value">
              {sales ? formatBaht(sales.platformFee) : '–'}
            </div>
            <div className="overview-kpi-footer">
              <span className="overview-kpi-subtext">รวมตามรายงานการเงิน</span>
            </div>
          </div>
        </section>
      )}

      {/* 3. Unified Pending Action Queues (No Duplicate Banner / Activity / Refresh) */}
      <section
        className="owner-overview-section flat-overview-section"
        data-testid="owner-overview-dashboard"
        aria-labelledby="owner-overview-title"
      >
        <div className="owner-overview-header">
          <div className="owner-overview-title-group">
            <h2 id="owner-overview-title" className="owner-overview-title">
              คิวงานที่ต้องดำเนินการ
              <HeaderInfoTooltip text="รายการงานค้างทั้งหมดที่ต้องได้รับการตรวจสอบ ดำเนินการ หรืออนุมัติโดยเจ้าของระบบ" />
            </h2>
            <span className="owner-overview-status-note" data-testid="overview-total-status">
              {totalPending > 0 ? `รอตรวจสอบ ${totalPending} รายการ` : 'ไม่มีงานค้างรอตัดสินใจ'}
            </span>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ color: '#b91c1c', fontSize: '0.9rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div className="overview-cards-grid">
          {METRIC_CARDS.map(card => {
            const Icon = card.icon;
            const count =
              card.source === 'sales'
                ? (sales?.pendingPayouts ?? 0)
                : counts
                  ? (counts[card.countKey as keyof Omit<OwnerOverviewCounts, 'totalPending'>] ?? 0)
                  : 0;
            const hasCount = count > 0;

            return (
              <button
                key={card.id}
                type="button"
                className="overview-card-btn"
                onClick={() => handleCardClick(card)}
                data-testid={`overview-card-${card.id}`}
                aria-label={`${card.label}: ${count} รายการ (คลิกเพื่อไปที่หมวดหมู่นี้)`}
              >
                <div className="overview-card-header">
                  <Icon className="overview-borderless-icon" />
                  <span
                    className={`overview-card-count ${hasCount ? 'count-warn' : 'count-ok'}`}
                    data-testid={`overview-count-${card.id}`}
                  >
                    {loading && !counts ? '...' : count}
                  </span>
                </div>
                <span className="overview-card-label">{card.label}</span>
                <span className="overview-card-sub">{card.sub}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. 2-Column Analytics & Top 5 Concerts */}
      {isFullOverview && (
        <div className="overview-analytics-grid-two-col">
          <section className="overview-charts-card" aria-labelledby="owner-charts-title" data-testid="owner-charts-panel">
            <div className="charts-card-top-bar">
              <div className="charts-card-title-wrap">
                <h2 id="owner-charts-title" className="charts-card-title">
                  กราฟวิเคราะห์ยอดขายแพลตฟอร์ม
                  <HeaderInfoTooltip text="วิเคราะห์เปรียบเทียบสัดส่วนยอดขายระหว่างคอนเสิร์ตต่างๆ และแนวโน้มยอดขายตามเวลาออกบัตร (เวลาไทย)" />
                </h2>
                <p className="charts-card-subtitle">
                  สลับดูแนวโน้มยอดขายตามช่วงเวลา หรือเปรียบเทียบรายได้แต่ละคอนเสิร์ต
                </p>
              </div>

              <div className="charts-controls-wrap">
                <div className="charts-mode-tabs" role="tablist" aria-label="โหมดกราฟการเงิน">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={chartMode === 'line'}
                    className={`chart-tab-btn ${chartMode === 'line' ? 'active' : ''}`}
                    onClick={() => setChartMode('line')}
                  >
                    กราฟเส้นแนวโน้มยอดขาย
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={chartMode === 'bar'}
                    className={`chart-tab-btn ${chartMode === 'bar' ? 'active' : ''}`}
                    onClick={() => setChartMode('bar')}
                  >
                    กราฟแท่งเปรียบเทียบรายคอนเสิร์ต
                  </button>
                </div>

                {chartMode === 'line' && (
                  <div className="charts-time-filter">
                    <button
                      type="button"
                      className={`time-pill-btn ${timeRange === 'today' ? 'active' : ''}`}
                      onClick={() => setTimeRange('today')}
                    >
                      วันนี้
                    </button>
                    <button
                      type="button"
                      className={`time-pill-btn ${timeRange === '7d' ? 'active' : ''}`}
                      onClick={() => setTimeRange('7d')}
                    >
                      7 วันล่าสุด
                    </button>
                    <button
                      type="button"
                      className={`time-pill-btn ${timeRange === '30d' ? 'active' : ''}`}
                      onClick={() => setTimeRange('30d')}
                    >
                      30 วันล่าสุด
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="charts-kpi-summary-strip">
              <div className="chart-summary-chip">
                <span className="summary-chip-label">
                  {chartMode === 'bar' ? 'ยอดจำหน่ายรวมทั้งระบบ' : `ยอดขายรวม (${timeRange === 'today' ? 'วันนี้' : timeRange === '7d' ? '7 วันล่าสุด' : '30 วันล่าสุด'})`}
                </span>
                <strong className="summary-chip-value">{formatBaht(selectedPeriodSales)}</strong>
              </div>
              <div className="chart-summary-chip">
                <span className="summary-chip-label">ค่าบริการระบบ (ตามรายงานจริง)</span>
                <strong className="summary-chip-value">{formatBaht(selectedPeriodEstFee)}</strong>
              </div>
              <div className="chart-summary-chip">
                <span className="summary-chip-label">คอนเสิร์ตที่มีการขาย</span>
                <strong className="summary-chip-value">{barChartEvents.length} งาน</strong>
              </div>
            </div>

            <div className="charts-content-viewport">
              {!sales ? (
                <div className="charts-empty-placeholder">
                  <p>{loading ? 'กำลังโหลดยอดขาย...' : 'ไม่สามารถแสดงยอดขายได้'}</p>
                </div>
              ) : chartMode === 'bar' && barChartEvents.length === 0 ? (
                <div className="charts-empty-placeholder">
                  <p>ยังไม่มีรายการขายบัตร</p>
                </div>
              ) : chartMode === 'bar' ? (
                <div className="overview-barchart-container" data-testid="owner-barchart">
                  <div className="barchart-bars-stack">
                    {barChartEvents.map((ev) => {
                      const barWidthPct = maxBarSales > 0 ? Math.max(8, Math.round((ev.sales / maxBarSales) * 100)) : 8;
                      const sharePct = totalGrossRevenue > 0 ? Math.round((ev.sales / totalGrossRevenue) * 100) : 0;

                      return (
                        <div key={ev.id} className="barchart-item-row">
                          <div className="barchart-item-meta">
                            <span className="barchart-event-name">{ev.title}</span>
                            <span className={`barchart-status-text ${ev.open ? 'is-open' : ''}`}>
                              {ev.open ? 'กำลังเปิดขาย' : getStatusLabel(ev.status)}
                            </span>
                          </div>

                          <div className="barchart-item-bar-col">
                            <div className="barchart-bar-track">
                              <div
                                className="barchart-bar-fill"
                                style={{ width: `${barWidthPct}%` }}
                                title={`${ev.title}: ${formatBaht(ev.sales)} (${sharePct}% ของยอดรวมทั้งระบบ)`}
                              />
                            </div>
                          </div>

                          <div className="barchart-item-stat-col">
                            <span className="barchart-sales-val">{formatBaht(ev.sales)}</span>
                            <span className="barchart-tickets-val">
                              ขายได้ {ev.soldCount.toLocaleString()} / {ev.quota.toLocaleString()} ใบ ({sharePct}%)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                (() => {
                  const fitMobileChart = isCompactViewport && lineChartData.length <= 8;
                  const svgWidth = fitMobileChart ? 420 : 760;
                  const gridEndX = svgWidth - 15;
                  const startX = fitMobileChart ? 68 : 75;
                  const endX = svgWidth - (fitMobileChart ? 24 : 20);
                  const stepX = (endX - startX) / Math.max(lineChartData.length - 1, 1);
                  const coords = lineChartData.map((d, i) => {
                    const x = startX + i * stepX;
                    const y = 180 - (d.value / maxLineValue) * 146;
                    return { x, y, ...d };
                  });

                  const pathD = coords.reduce((acc, pt, i) => {
                    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
                  }, '');

                  const areaD = `${pathD} L ${coords[coords.length - 1].x} 180 L ${coords[0].x} 180 Z`;

                  return (
                    <div className="overview-linechart-container" data-testid="owner-linechart">
                      <div className="linechart-svg-wrap">
                        <svg
                          viewBox={`0 0 ${svgWidth} 220`}
                          className={`linechart-svg ${fitMobileChart ? 'is-fit' : ''}`}
                          preserveAspectRatio={fitMobileChart ? 'xMidYMid meet' : 'none'}
                          aria-label="กราฟเส้นแนวโน้มยอดขายตามช่วงเวลา"
                        >
                          <defs>
                            <linearGradient id="ownerLineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
                              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          <g className="linechart-grid-lines">
                            <line x1="55" y1="34" x2={gridEndX} y2="34" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                            <text x="48" y="38" textAnchor="end" fill="#64748b" fontSize="10">{formatChartBaht(maxLineValue)}</text>

                            <line x1="55" y1="83" x2={gridEndX} y2="83" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                            <text x="48" y="87" textAnchor="end" fill="#64748b" fontSize="10">{formatChartBaht(Math.round((maxLineValue * 2) / 3))}</text>

                            <line x1="55" y1="131" x2={gridEndX} y2="131" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                            <text x="48" y="135" textAnchor="end" fill="#64748b" fontSize="10">{formatChartBaht(Math.round(maxLineValue / 3))}</text>

                            <line x1="55" y1="180" x2={gridEndX} y2="180" stroke="#cbd5e1" strokeWidth="1" />
                            <text x="48" y="184" textAnchor="end" fill="#64748b" fontSize="10">฿0</text>
                          </g>

                          <path d={areaD} fill="url(#ownerLineAreaGrad)" />
                          <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                          {coords.map((pt) => (
                            <g key={`point-${pt.label}`} className="linechart-data-point">
                              <circle cx={pt.x} cy={pt.y} r="3.5" fill="#ffffff" stroke="#3b82f6" strokeWidth="1.75" />
                              {pt.value > 0 && (
                                <text
                                  x={pt.x}
                                  y={pt.y - 10}
                                  textAnchor="middle"
                                  className="linechart-val-text"
                                  fill="#334155"
                                  fontSize="10"
                                  fontWeight="400"
                                >
                                  {formatChartBaht(pt.value)}
                                </text>
                              )}
                              <text
                                x={pt.x}
                                y={202}
                                textAnchor="middle"
                                className="linechart-axis-text"
                                fill="#64748b"
                                fontSize="11"
                              >
                                {pt.label}
                              </text>
                            </g>
                          ))}
                        </svg>
                      </div>
                      {isCompactViewport && lineChartData.length > 8 && (
                        <p className="linechart-scroll-hint">เลื่อนซ้าย-ขวาเพื่อดูกราฟครบ 30 วัน</p>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </section>

          <section className="overview-top-concerts-card" aria-label="5 อันดับคอนเสิร์ตยอดขายสูงสุด">
            <div className="top-concerts-header">
              <div className="top-concerts-title-group">
                <h3 className="top-concerts-title">
                  คอนเสิร์ตยอดขายสูงสุด
                  <HeaderInfoTooltip text="5 อันดับคอนเสิร์ตที่มียอดจำหน่ายบัตรและความจุที่ขายได้สูงสุดในระบบ" />
                </h3>
                <p className="top-concerts-subtitle">สูงสุด 5 งานตามยอดขายบัตร</p>
              </div>
              <button
                type="button"
                className="secondary-button top-concerts-view-all-btn"
                onClick={() => onNavigateToSection('approval', 'owner-session-approval-manager')}
              >
                <span>จัดการทั้งหมด</span>
                <ChevronRightIcon style={{ width: '14px', height: '14px' }} />
              </button>
            </div>

            <div className="top-concerts-list">
              {sales && topPerformingConcerts.length === 0 && <p>ยังไม่มีรายการขายบัตร</p>}
              {topPerformingConcerts.map((concert, idx) => {
                const soldPct = concert.quota > 0 ? Math.round((concert.soldCount / concert.quota) * 100) : 0;
                return (
                  <button
                    key={concert.id}
                    type="button"
                    className="top-concert-item"
                    onClick={() => onNavigateToSection('approval', 'owner-session-approval-manager')}
                  >
                    <div className="top-concert-rank-col">
                      <span className={`top-concert-rank-badge rank-${idx + 1}`}>#{idx + 1}</span>
                    </div>

                    <div className="top-concert-info-col">
                      <div className="top-concert-name-row">
                        <span className="top-concert-name" title={concert.title}>{concert.title}</span>
                        <span className="top-concert-revenue">{formatBaht(concert.sales)}</span>
                      </div>

                      <div className="top-concert-progress-row">
                        <div className="top-concert-progress-track">
                          <div
                            className="top-concert-progress-fill"
                            style={{ width: `${Math.min(100, soldPct)}%` }}
                          />
                        </div>
                        <span className="top-concert-sold-ratio">
                          ขายได้ {concert.soldCount.toLocaleString()} / {concert.quota.toLocaleString()} ({soldPct}%)
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
