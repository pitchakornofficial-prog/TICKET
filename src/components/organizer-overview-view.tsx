'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  BanknotesIcon,
  RefreshIcon,
  MapPinIcon,
  ShieldCheckIcon,
  ClockIcon,
  CalendarIcon,
  AlertTriangleIcon,
} from './icons';
import { TicketIcon } from './ticket-icon';
import { Button, Badge } from '@/components/ui';
import { HeaderInfoTooltip } from './header-info-tooltip';
import { formatBaht } from '@/lib/locale';
import type { OrganizerSectionId } from './organizer-workspace-view';

export interface OrganizerOverviewViewProps {
  onNavigateSection?: (section: OrganizerSectionId, eventId?: string) => void;
  onOpenCreateConcert?: () => void;
}

interface OrganizerEventItem {
  id: string;
  title: string;
  location: string;
  status: string;
  sessionCount?: number;
  totalQuota?: number;
  minPrice?: number;
  maxPrice?: number;
  firstSessionStartTime?: string;
  lastSessionEndTime?: string;
  createdAt?: string;
}

interface EventProgressStats {
  soldTickets: number;
  grossSales: number;
  fee: number;
  netSales: number;
}

export function OrganizerOverviewView({
  onNavigateSection,
}: OrganizerOverviewViewProps) {
  const [events, setEvents] = useState<OrganizerEventItem[]>([]);
  const [eventStats, setEventStats] = useState<Record<string, EventProgressStats>>({});
  const [ordersList, setOrdersList] = useState<{ createdAt: string; grossSubtotal: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chart state (D-215: Option A)
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar');
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('7d');

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/scanner/events', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ไม่สามารถโหลดข้อมูลภาพรวมได้');
        return;
      }
      const loadedEvents: OrganizerEventItem[] = data.events || [];
      setEvents(loadedEvents);

      const statsMap: Record<string, EventProgressStats> = {};
      const collectedOrders: { createdAt: string; grossSubtotal: number }[] = [];

      await Promise.allSettled(
        loadedEvents.map(async (ev) => {
          try {
            const reportRes = await fetch(`/api/organizer/events/${ev.id}/money-report`, {
              cache: 'no-store',
            });
            if (reportRes.ok) {
              const reportData = await reportRes.json();
              if (reportData.report) {
                const rep = reportData.report;
                const validTickets = rep.validTicketsCount ?? 0;
                const gross = rep.grossSales ?? 0;
                const fee = rep.organizerFee ?? Math.round(gross * 0.03);
                const net = rep.netEntitlement ?? (gross - fee);
                statsMap[ev.id] = {
                  soldTickets: validTickets,
                  grossSales: gross,
                  fee,
                  netSales: net,
                };
                if (Array.isArray(rep.orders)) {
                  for (const ord of rep.orders) {
                    if (ord.status === 'confirmed' || ord.validTicketsCount > 0) {
                      collectedOrders.push({
                        createdAt: ord.createdAt,
                        grossSubtotal: ord.grossSubtotal || 0,
                      });
                    }
                  }
                }
              }
            }
          } catch {
            // Silently skip failed reports
          }
        }),
      );

      setEventStats(statsMap);
      setOrdersList(collectedOrders);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อดึงข้อมูลภาพรวม');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Aggregated KPI Metrics
  const totalEventsCount = events.length;
  const activeEvents = events.filter((e) => e.status === 'approved');
  const activeEventsCount = activeEvents.length;

  let totalSoldTickets = 0;
  let totalGrossRevenue = 0;
  let totalQuota = 0;

  for (const ev of events) {
    totalQuota += ev.totalQuota || 0;
    const stats = eventStats[ev.id];
    if (stats) {
      totalSoldTickets += stats.soldTickets;
      totalGrossRevenue += stats.grossSales;
    }
  }

  // Multi-Period Sales Breakdown based on actual order timestamps (D-212)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todaySales = 0;
  let thisWeekSales = 0;
  let thisMonthSales = 0;

  for (const o of ordersList) {
    const t = new Date(o.createdAt).getTime();
    if (t >= todayStart) todaySales += o.grossSubtotal;
    if (t >= weekStart) thisWeekSales += o.grossSubtotal;
    if (t >= monthStart) thisMonthSales += o.grossSubtotal;
  }

  // If reports don't provide itemized orders but total revenue exists, tie thisMonthSales to totalGrossRevenue
  if (thisMonthSales === 0 && totalGrossRevenue > 0) {
    thisMonthSales = totalGrossRevenue;
  }

  const soldPercentage =
    totalQuota > 0 ? Math.min(100, Math.round((totalSoldTickets / totalQuota) * 100)) : 0;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return 'กำลังเปิดขาย';
      case 'pending_approval':
        return 'รออนุมัติ';
      case 'draft':
        return 'ฉบับร่าง';
      case 'cancelled':
        return 'ยกเลิกแล้ว';
      default:
        return status;
    }
  };

  // Line Chart Data points based on real order timestamps
  const lineChartData = useMemo(() => {
    if (totalGrossRevenue === 0 || ordersList.length === 0) {
      if (timeRange === 'today') {
        return [
          { label: '00:00', value: 0 },
          { label: '04:00', value: 0 },
          { label: '08:00', value: 0 },
          { label: '12:00', value: 0 },
          { label: '16:00', value: 0 },
          { label: '20:00', value: 0 },
          { label: 'ปัจจุบัน', value: 0 },
        ];
      }
      if (timeRange === '7d') {
        return [
          { label: 'จันทร์', value: 0 },
          { label: 'อังคาร', value: 0 },
          { label: 'พุธ', value: 0 },
          { label: 'พฤหัสฯ', value: 0 },
          { label: 'ศุกร์', value: 0 },
          { label: 'เสาร์', value: 0 },
          { label: 'วันนี้', value: 0 },
        ];
      }
      return [
        { label: 'สัปดาห์ 1', value: 0 },
        { label: 'สัปดาห์ 2', value: 0 },
        { label: 'สัปดาห์ 3', value: 0 },
        { label: 'สัปดาห์ 4', value: 0 },
      ];
    }

    if (timeRange === 'today') {
      const buckets = [0, 0, 0, 0, 0, 0, 0];
      for (const ord of ordersList) {
        const d = new Date(ord.createdAt);
        if (d.getTime() >= todayStart) {
          const h = d.getHours();
          if (h < 4) buckets[0] += ord.grossSubtotal;
          else if (h < 8) buckets[1] += ord.grossSubtotal;
          else if (h < 12) buckets[2] += ord.grossSubtotal;
          else if (h < 16) buckets[3] += ord.grossSubtotal;
          else if (h < 20) buckets[4] += ord.grossSubtotal;
          else buckets[5] += ord.grossSubtotal;
        }
      }
      buckets[6] = todaySales;
      return [
        { label: '00:00', value: buckets[0] },
        { label: '04:00', value: buckets[1] },
        { label: '08:00', value: buckets[2] },
        { label: '12:00', value: buckets[3] },
        { label: '16:00', value: buckets[4] },
        { label: '20:00', value: buckets[5] },
        { label: 'ปัจจุบัน', value: buckets[6] },
      ];
    }
    if (timeRange === '7d') {
      const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];
      const result = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        let daySum = 0;
        for (const ord of ordersList) {
          const t = new Date(ord.createdAt).getTime();
          if (t >= dayStart && t < dayEnd) daySum += ord.grossSubtotal;
        }
        result.push({
          label: i === 0 ? 'วันนี้' : days[d.getDay()],
          value: daySum,
        });
      }
      return result;
    }
    // 30d
    const weeks = [0, 0, 0, 0];
    for (const ord of ordersList) {
      const d = new Date(ord.createdAt);
      if (d.getTime() >= monthStart) {
        const day = d.getDate();
        if (day <= 7) weeks[0] += ord.grossSubtotal;
        else if (day <= 14) weeks[1] += ord.grossSubtotal;
        else if (day <= 21) weeks[2] += ord.grossSubtotal;
        else weeks[3] += ord.grossSubtotal;
      }
    }
    return [
      { label: 'สัปดาห์ 1', value: weeks[0] },
      { label: 'สัปดาห์ 2', value: weeks[1] },
      { label: 'สัปดาห์ 3', value: weeks[2] },
      { label: 'สัปดาห์ 4', value: weeks[3] },
    ];
  }, [timeRange, totalGrossRevenue, ordersList, todaySales, todayStart, monthStart, now]);

  // Max value for line chart scaling
  const maxLineValue = useMemo(() => {
    const maxVal = Math.max(...lineChartData.map(d => d.value), 1000);
    return Math.ceil(maxVal * 1.15);
  }, [lineChartData]);

  // Max value for bar chart scaling
  const maxBarSales = useMemo(() => {
    let max = 1;
    for (const ev of events) {
      const stats = eventStats[ev.id];
      if (stats && stats.grossSales > max) {
        max = stats.grossSales;
      }
    }
    return max;
  }, [events, eventStats]);

  return (
    <div className="overview-workspace-container" data-testid="organizer-overview-view">
      {/* 1. Header Toolbar (D-122, D-216: Universal 'i' Tooltip) */}
      <header className="overview-header-toolbar">
        <div className="overview-header-titles">
          <h1 className="overview-header-title">
            ภาพรวมระบบผู้จัดงาน
            <HeaderInfoTooltip text="ศูนย์รวมภาพรวมสถิติคอนเสิร์ตของคุณ สรุปยอดขายรวม บัตรที่จำหน่ายได้ และงานค้างที่ต้องดำเนินการ" />
          </h1>
          <p className="overview-header-subtitle">
            ติดตามสถานะงานคอนเสิร์ต ยอดจำหน่ายบัตร และการวิเคราะห์รายได้แบบเรียลไทม์
          </p>
        </div>
      </header>

      {error && (
        <div className="overview-error-banner" role="alert">
          <AlertTriangleIcon className="banner-icon" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Actions Bar (Data-only Refresh Action, no generic jump links D-210) */}
      <div className="overview-quick-actions-bar">
        <div className="overview-header-actions">
          <Button
            variant="outline"
            size="md"
            className="overview-refresh-btn"
            data-testid="overview-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            loading={refreshing}
            icon={<RefreshIcon className="btn-icon" />}
            aria-label="รีเฟรชข้อมูลภาพรวม"
          >
            รีเฟรชข้อมูล
          </Button>
        </div>
      </div>

      {/* 3. Top Executive 5-KPI Strip (D-212, D-216: Borderless Icons & Tooltips) */}
      <section className="overview-kpi-grid overview-5kpi-grid" aria-label="สรุปตัวชี้วัดสำคัญภาพรวม">
        {/* KPI 1: Active Concerts */}
        <div className="overview-kpi-card pure-kpi" data-testid="overview-kpi-events">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">
              คอนเสิร์ตที่เปิดขาย
              <HeaderInfoTooltip text="จำนวนคอนเสิร์ตที่ผ่านการอนุมัติและกำลังเปิดจำหน่ายบัตรอยู่ในขณะนี้" />
            </span>
            <TicketIcon className="overview-borderless-icon text-blue" />
          </div>
          <div className="overview-kpi-value">
            {activeEventsCount}{' '}
            <span className="overview-kpi-unit">งาน</span>
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-kpi-subtext">
              จากทั้งหมด {totalEventsCount} งานในระบบ
            </span>
          </div>
        </div>

        {/* KPI 2: Total Gross Revenue */}
        <div className="overview-kpi-card pure-kpi" data-testid="overview-kpi-revenue">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">
              รายได้บัตรรวมทั้งหมด
              <HeaderInfoTooltip text="ยอดขายบัตรรวมทุกงานคอนเสิร์ตก่อนหักค่าบริการระบบ" />
            </span>
            <BanknotesIcon className="overview-borderless-icon text-indigo" />
          </div>
          <div className="overview-kpi-value text-indigo">
            {formatBaht(totalGrossRevenue)}
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-kpi-subtext">
              ออกบัตรแล้ว {totalSoldTickets.toLocaleString()} / {totalQuota.toLocaleString()} ใบ ({soldPercentage}%)
            </span>
          </div>
        </div>

        {/* KPI 3: Today's Sales */}
        {/* Reference benchmark trends: +12.5% จากเมื่อวาน, +8.2% จากสัปดาห์ก่อน, +15.4% จากเดือนก่อน */}
        <div className="overview-kpi-card pure-kpi" data-testid="overview-kpi-today">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">
              ยอดขายวันนี้ (Today)
              <HeaderInfoTooltip text="ยอดเงินจากการจำหน่ายบัตรที่ทำรายการสำเร็จภายในวันนี้ตั้งแต่เวลา 00:00 น." />
            </span>
            <ClockIcon className="overview-borderless-icon text-amber" />
          </div>
          <div className="overview-kpi-value">
            {formatBaht(todaySales)}
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-trend-badge success">
              {todaySales > 0 ? `+${formatBaht(todaySales)} วันนี้` : 'ยังไม่มียอดขายวันนี้'}
            </span>
          </div>
        </div>

        {/* KPI 4: This Week's Sales */}
        <div className="overview-kpi-card pure-kpi" data-testid="overview-kpi-week">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">
              ยอดขายสัปดาห์นี้
              <HeaderInfoTooltip text="ยอดเงินจากการจำหน่ายบัตรที่ทำรายการสำเร็จในรอบสัปดาห์ปัจจุบัน (จันทร์-อาทิตย์)" />
            </span>
            <CalendarIcon className="overview-borderless-icon text-emerald" />
          </div>
          <div className="overview-kpi-value">
            {formatBaht(thisWeekSales)}
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-trend-badge success">
              {thisWeekSales > 0 ? `+${formatBaht(thisWeekSales)} สัปดาห์นี้` : 'ยังไม่มียอดขายสัปดาห์นี้'}
            </span>
          </div>
        </div>

        {/* KPI 5: This Month's Sales */}
        <div className="overview-kpi-card pure-kpi" data-testid="overview-kpi-month">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">
              ยอดขายเดือนนี้
              <HeaderInfoTooltip text="ยอดเงินสะสมจากการจำหน่ายบัตรที่ทำรายการสำเร็จในรอบเดือนนี้" />
            </span>
            <ShieldCheckIcon className="overview-borderless-icon text-purple" />
          </div>
          <div className="overview-kpi-value">
            {formatBaht(thisMonthSales)}
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-trend-badge success">
              {thisMonthSales > 0 ? `+${formatBaht(thisMonthSales)} เดือนนี้` : 'ยังไม่มียอดขายเดือนนี้'}
            </span>
          </div>
        </div>
      </section>

      {/* 4. Interactive Dual-Mode Visual Analytics Charts (D-215: Option A) */}
      <section className="overview-charts-card" aria-labelledby="overview-charts-title" data-testid="overview-charts-panel">
        <div className="charts-card-top-bar">
          <div className="charts-card-title-wrap">
            <h2 id="overview-charts-title" className="charts-card-title">
              กราฟวิเคราะห์สถิติและการเปรียบเทียบ (Visual Analytics)
              <HeaderInfoTooltip text="วิเคราะห์เปรียบเทียบยอดขายระหว่างแต่ละคอนเสิร์ต และแนวโน้มรายได้ตามช่วงเวลาแบบเรียลไทม์" />
            </h2>
            <p className="charts-card-subtitle">
              สลับมุมมองระหว่างการเปรียบเทียบสัดส่วนรายได้แต่ละคอนเสิร์ต หรือเส้นแนวโน้มยอดขายตามช่วงเวลา
            </p>
          </div>

          <div className="charts-controls-wrap">
            {/* Mode Switcher Tabs */}
            <div className="charts-mode-tabs" role="tablist" aria-label="โหมดกราฟ">
              <button
                type="button"
                role="tab"
                aria-selected={chartMode === 'bar'}
                className={`chart-tab-btn ${chartMode === 'bar' ? 'active' : ''}`}
                onClick={() => setChartMode('bar')}
              >
                กราฟแท่งเปรียบเทียบรายคอนเสิร์ต
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={chartMode === 'line'}
                className={`chart-tab-btn ${chartMode === 'line' ? 'active' : ''}`}
                onClick={() => setChartMode('line')}
              >
                กราฟเส้นแนวโน้มยอดขาย
              </button>
            </div>

            {/* Time Filter Pills for Line Chart */}
            {chartMode === 'line' && (
              <div className="charts-time-filter">
                <button
                  type="button"
                  className={`time-pill-btn ${timeRange === 'today' ? 'active' : ''}`}
                  onClick={() => setTimeRange('today')}
                >
                  วันนี้ (24 ชม.)
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

        {/* Chart Content Area */}
        <div className="charts-content-viewport">
          {chartMode === 'bar' ? (
            /* Mode 1: Bar Chart Comparison Across Concerts */
            <div className="overview-barchart-container" data-testid="overview-barchart">
              <div className="barchart-bars-stack">
                {events.map((ev) => {
                  const stats = eventStats[ev.id] || { soldTickets: 0, grossSales: 0 };
                  const barWidthPct = maxBarSales > 0 ? Math.max(6, Math.round((stats.grossSales / maxBarSales) * 100)) : 6;
                  const sharePct = totalGrossRevenue > 0 ? Math.round((stats.grossSales / totalGrossRevenue) * 100) : 0;

                  return (
                    <div key={ev.id} className="barchart-item-row">
                      <div className="barchart-item-meta">
                        <span className="barchart-event-name">{ev.title}</span>
                        <Badge
                          variant={
                            ev.status === 'approved'
                              ? 'success'
                              : ev.status === 'pending_approval'
                                ? 'warning'
                                : 'neutral'
                          }
                          size="sm"
                        >
                          {getStatusLabel(ev.status)}
                        </Badge>
                      </div>

                      <div className="barchart-item-bar-col">
                        <div className="barchart-bar-track">
                          <div
                            className="barchart-bar-fill"
                            style={{ width: `${barWidthPct}%` }}
                            title={`${ev.title}: ${formatBaht(stats.grossSales)} (${sharePct}% ของยอดรวม)`}
                          >
                            <span className="barchart-inner-label">{sharePct > 8 ? `${sharePct}%` : ''}</span>
                          </div>
                        </div>
                      </div>

                      <div className="barchart-item-stat-col">
                        <span className="barchart-sales-val">{formatBaht(stats.grossSales)}</span>
                        <span className="barchart-tickets-val">จำหน่าย {stats.soldTickets.toLocaleString()} ใบ</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Mode 2: Line Chart Sales Trend Over Time */
            <div className="overview-linechart-container" data-testid="overview-linechart">
              <div className="linechart-svg-wrap">
                <svg
                  viewBox="0 0 760 220"
                  className="linechart-svg"
                  preserveAspectRatio="none"
                  aria-label="กราฟเส้นแนวโน้มยอดขายตามช่วงเวลา"
                >
                  <defs>
                    <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1848ed" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#1848ed" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  <line x1="40" y1="30" x2="740" y2="30" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="40" y1="80" x2="740" y2="80" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="40" y1="130" x2="740" y2="130" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="40" y1="180" x2="740" y2="180" stroke="#e2e8f0" strokeWidth="1" />

                  {/* Generate Path Coordinates */}
                  {(() => {
                    const stepX = (740 - 60) / Math.max(lineChartData.length - 1, 1);
                    const coords = lineChartData.map((d, i) => {
                      const x = 60 + i * stepX;
                      const y = 180 - (d.value / maxLineValue) * 150;
                      return { x, y, ...d };
                    });

                    const pathD = coords.reduce((acc, pt, i) => {
                      return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
                    }, '');

                    const areaD = `${pathD} L ${coords[coords.length - 1].x} 180 L ${coords[0].x} 180 Z`;

                    return (
                      <>
                        <path d={areaD} fill="url(#lineAreaGrad)" />
                        <path d={pathD} fill="none" stroke="#1848ed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        {coords.map((pt) => (
                          <g key={pt.label} className="linechart-dot-group">
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={4.5}
                              fill="#ffffff"
                              stroke="#1848ed"
                              strokeWidth={2.5}
                              className="linechart-dot"
                            >
                              <title>{`${pt.label}: ${formatBaht(pt.value)}`}</title>
                            </circle>
                            {/* X-axis label */}
                            <text
                              x={pt.x}
                              y={202}
                              textAnchor="middle"
                              fontSize="11"
                              fill="#64748b"
                              fontFamily="inherit"
                            >
                              {pt.label}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>

                {/* Line Chart Period Total Tooltip Badge */}
                <div className="linechart-hover-tooltip" aria-hidden="true">
                  <span className="tooltip-period">
                    {timeRange === 'today' ? 'ยอดขายวันนี้' : timeRange === '7d' ? 'ยอดขาย 7 วันล่าสุด' : 'ยอดขาย 30 วันล่าสุด'}
                  </span>
                  <span className="tooltip-amount">{formatBaht(lineChartData.reduce((s: number, p: { value: number }) => s + p.value, 0))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 5. Concert Performance Cards (D-213: 3-Zone Horizontal Layout, D-214: Targeted Navigation) */}
      <section className="overview-performance-section" aria-labelledby="overview-performance-title" data-testid="overview-performance-section">
        <div className="section-header-row">
          <div>
            <h2 id="overview-performance-title" className="section-title">
              ประสิทธิภาพรายคอนเสิร์ต (Concert Performance)
              <HeaderInfoTooltip text="สรุปยอดจำหน่ายบัตร รายได้รวม ยอดหักค่าบริการ และยอดสุทธิคงเหลือแยกรายคอนเสิร์ต พร้อมปุ่มคำสั่งตรงงาน" />
            </h2>
            <p className="section-subtitle">
              ตรวจสอบสถิติการจำหน่ายบัตร ยอดเงินสุทธิหลังหักค่าบริการ และการดำเนินการตรงแต่ละคอนเสิร์ต
            </p>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="overview-empty-card" data-testid="overview-events-empty">
            <TicketIcon className="empty-icon" />
            <h3 className="empty-title">ยังไม่มีรายการคอนเสิร์ตในระบบ</h3>
            <p className="empty-desc">
              ข้อมูลสถิติและประสิทธิภาพจะปรากฏที่นี่เมื่อมีการสร้างงานคอนเสิร์ตในระบบ
            </p>
            <button
              type="button"
              className="overview-create-btn"
              data-testid="overview-create-event-btn"
              onClick={() => onNavigateSection?.('events')}
            >
              สร้างคอนเสิร์ตแรกของคุณ
            </button>
          </div>
        ) : (
          <div className="overview-performance-list" data-testid="overview-performance-list">
            {events.map((ev) => {
              const stats = eventStats[ev.id] || {
                soldTickets: 0,
                grossSales: 0,
                fee: 0,
                netSales: 0,
              };
              const quota = ev.totalQuota || 0;
              const sold = stats.soldTickets;
              const pct = quota > 0 ? Math.min(100, Math.round((sold / quota) * 100)) : 0;
              const gross = stats.grossSales;
              const fee = stats.fee;
              const net = stats.netSales;

              return (
                <div
                  key={ev.id}
                  className="overview-concert-card"
                  data-testid={`overview-concert-card-${ev.id}`}
                >
                  {/* Zone 1: Event Details & Ticket Progress */}
                  <div className="concert-card-zone-info">
                    <div className="concert-status-badge-row">
                      <Badge
                        variant={
                          ev.status === 'approved'
                            ? 'success'
                            : ev.status === 'pending_approval'
                              ? 'warning'
                              : ev.status === 'cancelled'
                                ? 'danger'
                                : 'neutral'
                        }
                        size="sm"
                      >
                        {getStatusLabel(ev.status)}
                      </Badge>
                      <span className="concert-meta-sessions">{ev.sessionCount || 1} รอบการแสดง</span>
                    </div>

                    <h3 className="concert-card-title">
                      {ev.title}
                      <HeaderInfoTooltip text={`ข้อมูลคอนเสิร์ต ${ev.title} ณ ${ev.location || 'สถานที่จัดงาน'}`} />
                    </h3>

                    <div className="concert-card-location">
                      <MapPinIcon className="meta-icon" />
                      <span>{ev.location || 'ไม่ระบุสถานที่'}</span>
                    </div>

                    {/* Ticket Progress Bar */}
                    <div className="concert-progress-box">
                      <div className="progress-header-row">
                        <span className="progress-label">
                          ขายแล้ว {sold.toLocaleString()} / {quota.toLocaleString()} ใบ
                        </span>
                        <span className="progress-pct-badge">{pct}%</span>
                      </div>
                      <div className="progress-bar-track">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${pct}%` }}
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Zone 2: Financial Breakdown (3 values: Gross -> Fees -> Net) */}
                  <div className="concert-card-zone-finance">
                    <div className="finance-metric-box">
                      <span className="finance-metric-label">
                        รายได้รวม
                        <HeaderInfoTooltip text="ยอดขายบัตรรวมจากคำสั่งซื้อที่ชำระเงินสำเร็จของคอนเสิร์ตนี้" />
                      </span>
                      <span className="finance-metric-val">{formatBaht(gross)}</span>
                    </div>

                    <div className="finance-metric-divider">−</div>

                    <div className="finance-metric-box">
                      <span className="finance-metric-label">
                        หักค่าบริการ (3%)
                        <HeaderInfoTooltip text="ค่าบริการแพลตฟอร์มระบบ TICKET ที่หักตามรอบการขาย" />
                      </span>
                      <span className="finance-metric-val fee-val">
                        {fee > 0 ? `-${formatBaht(fee)}` : '฿0'}
                      </span>
                    </div>

                    <div className="finance-metric-divider">=</div>

                    <div className="finance-metric-box highlight-net">
                      <span className="finance-metric-label">
                        ยอดสุทธิคงเหลือ
                        <HeaderInfoTooltip text="ยอดเงินสุทธิที่ผู้จัดงานจะได้รับหลังหักค่าบริการเรียบร้อยแล้ว" />
                      </span>
                      <span className="finance-metric-val net-val">{formatBaht(net)}</span>
                    </div>
                  </div>

                  {/* Zone 3: 3 Action Buttons (D-213, D-214: Highlight on Click) */}
                  <div className="concert-card-zone-actions">
                    <Link
                      href={`/events/${ev.id}`}
                      className="overview-concert-action-btn btn-store"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="เปิดดูหน้าเว็บฝั่งลูกค้าในแท็บใหม่"
                    >
                      ดูหน้าร้านลูกค้า
                    </Link>

                    <button
                      type="button"
                      className="overview-concert-action-btn btn-finance"
                      onClick={() => onNavigateSection?.('finance', ev.id)}
                      title="เปิดรายงานการเงินพร้อมไฮไลท์คอนเสิร์ตนี้"
                    >
                      รายงานการเงิน
                    </button>

                    <button
                      type="button"
                      className="overview-concert-action-btn btn-manage"
                      onClick={() => onNavigateSection?.('events', ev.id)}
                      title="ไปที่หน้าคอนเสิร์ตพร้อมไฮไลท์งานนี้"
                    >
                      จัดการงาน
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
