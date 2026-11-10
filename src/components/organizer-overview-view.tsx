'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  BanknotesIcon,
  RefreshIcon,
  MapPinIcon,
  ClockIcon,
  CalendarIcon,
  AlertTriangleIcon,
} from './icons';
import { TicketIcon } from './ticket-icon';
import { Badge } from '@/components/ui';
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
  posterUrl?: string;
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

type EventStatusFilter = 'all' | 'approved' | 'pending_approval' | 'draft' | 'cancelled';
type EventSortBy = 'latest' | 'grossSales' | 'soldTickets' | 'title';

export function OrganizerOverviewView({
  onNavigateSection,
}: OrganizerOverviewViewProps) {
  const [events, setEvents] = useState<OrganizerEventItem[]>([]);
  const [eventStats, setEventStats] = useState<Record<string, EventProgressStats>>({});
  const [ordersList, setOrdersList] = useState<{ createdAt: string; grossSubtotal: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search, Filter, Sort & Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EventStatusFilter>('all');
  const [sortBy, setSortBy] = useState<EventSortBy>('latest');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 4;

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
  const pendingEventsCount = events.filter((e) => e.status === 'pending_approval').length;
  const draftEventsCount = events.filter((e) => e.status === 'draft').length;

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

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (ev) =>
          ev.title.toLowerCase().includes(q) ||
          ev.location?.toLowerCase().includes(q),
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((ev) => ev.status === statusFilter);
    }

    result.sort((a, b) => {
      const statsA = eventStats[a.id] || { grossSales: 0, soldTickets: 0 };
      const statsB = eventStats[b.id] || { grossSales: 0, soldTickets: 0 };
      if (sortBy === 'grossSales') {
        return statsB.grossSales - statsA.grossSales;
      }
      if (sortBy === 'soldTickets') {
        return statsB.soldTickets - statsA.soldTickets;
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title, 'th');
      }
      return 0;
    });

    return result;
  }, [events, eventStats, searchQuery, statusFilter, sortBy]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleStatusChange = (val: EventStatusFilter) => {
    setStatusFilter(val);
    setCurrentPage(1);
  };

  const handleSortChange = (val: EventSortBy) => {
    setSortBy(val);
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / ITEMS_PER_PAGE));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEvents = filteredEvents.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="overview-workspace-container" data-testid="organizer-overview-view">
      {/* 1. Header Toolbar with Inline Borderless Refresh Button (D-122, D-216, D-258) */}
      <header className="overview-header-toolbar">
        <div className="overview-header-titles">
          <div className="overview-header-title-row">
            <h1 className="overview-header-title">
              ภาพรวมระบบผู้จัดงาน
              <HeaderInfoTooltip text="ศูนย์รวมภาพรวมสถิติคอนเสิร์ตของคุณ สรุปยอดขายรวม บัตรที่จำหน่ายได้ และงานค้างที่ต้องดำเนินการ" />
            </h1>
            <button
              type="button"
              className="overview-inline-refresh-btn"
              data-testid="overview-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              aria-label="รีเฟรชข้อมูลภาพรวม"
              title="รีเฟรชข้อมูลภาพรวม"
            >
              <RefreshIcon className={`inline-refresh-icon ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
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

      {/* 2. Top Executive 4-Card Hero Grid (2x2 on Desktop, Detailed Metrics, Semantic Colors D-259) */}
      <section className="overview-kpi-grid overview-4kpi-grid overview-5kpi-grid" aria-label="สรุปตัวชี้วัดสำคัญภาพรวม">
        {/* Card 1: Revenue & Financial Net Overview */}
        <div className="overview-kpi-card pure-kpi kpi-hero-card" data-testid="overview-kpi-revenue">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">
              รายได้บัตรรวมทั้งหมด
              <HeaderInfoTooltip text="ยอดขายบัตรรวมทุกงานคอนเสิร์ตก่อนหักค่าบริการระบบ พร้อมสรุปยอดสุทธิรอรับเงิน" />
            </span>
            <BanknotesIcon className="overview-borderless-icon text-slate-500" />
          </div>
          <div className="overview-kpi-value">
            {formatBaht(totalGrossRevenue)}
          </div>
          <div className="overview-kpi-breakdown-box">
            <div className="kpi-breakdown-row">
              <span className="breakdown-label">หักค่าบริการระบบ (3%):</span>
              <span className="breakdown-val text-muted">-{formatBaht(totalFee)}</span>
            </div>
            <div className="kpi-breakdown-row highlight-net-row">
              <span className="breakdown-label font-semibold">รายได้สุทธิรอรับเงิน:</span>
              <span className="breakdown-val text-emerald font-bold">+{formatBaht(totalNetSales)}</span>
            </div>
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-kpi-subtext">
              คำนวณจากทุกรายการคำสั่งซื้อที่ชำระเงินสำเร็จแล้ว
            </span>
          </div>
        </div>

        {/* Card 2: Ticket Sales & Quota Progress */}
        <div className="overview-kpi-card pure-kpi kpi-hero-card" data-testid="overview-kpi-tickets">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">
              การจำหน่ายบัตร &amp; โควตา
              <HeaderInfoTooltip text="สรุปจำนวนบัตรที่ออกสำเร็จเทียบกับความจุโควตารวมทุกคอนเสิร์ต" />
            </span>
            <TicketIcon className="overview-borderless-icon text-slate-500" />
          </div>
          <div className="overview-kpi-value">
            {totalSoldTickets.toLocaleString()}{' '}
            <span className="overview-kpi-unit">/ {totalQuota.toLocaleString()} ใบ</span>
          </div>
          <div className="kpi-progress-wrap">
            <div className="kpi-progress-bar-track">
              <div
                className="kpi-progress-bar-fill"
                style={{ width: `${soldPercentage}%` }}
              />
            </div>
            <div className="kpi-progress-stats">
              <span>ความคืบหน้าการขาย: {soldPercentage}%</span>
              <span>คงเหลือ: {remainingQuota.toLocaleString()} ใบ</span>
            </div>
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-kpi-subtext">
              ราคาจำหน่ายเฉลี่ย: {avgTicketPrice > 0 ? formatBaht(avgTicketPrice) : '-'} / ใบ
            </span>
          </div>
        </div>

        {/* Card 3: Concert Portfolio Governance */}
        <div className="overview-kpi-card pure-kpi kpi-hero-card" data-testid="overview-kpi-events">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">
              คอนเสิร์ตที่เปิดขาย
              <HeaderInfoTooltip text="จำนวนคอนเสิร์ตที่ผ่านการอนุมัติและกำลังเปิดจำหน่ายบัตรอยู่ในขณะนี้" />
            </span>
            <CalendarIcon className="overview-borderless-icon text-slate-500" />
          </div>
          <div className="overview-kpi-value">
            {activeEventsCount}{' '}
            <span className="overview-kpi-unit">/ {totalEventsCount} งานเปิดขาย</span>
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
            <div className="kpi-chip-item warning">
              <span className="kpi-chip-dot bg-warning" />
              <span>รออนุมัติ: {pendingEventsCount} งาน</span>
            </div>
            {draftEventsCount > 0 && (
              <div className="kpi-chip-item neutral">
                <span className="kpi-chip-dot bg-neutral" />
                <span>ฉบับร่าง: {draftEventsCount} งาน</span>
              </div>
            )}
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-kpi-subtext">
              จากทั้งหมด {totalEventsCount} งานที่ลงทะเบียนในระบบ
            </span>
          </div>
        </div>

        {/* Card 4: Multi-Period Sales Trend */}
        <div className="overview-kpi-card pure-kpi kpi-hero-card" data-testid="overview-kpi-time-summary">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">
              ยอดขายตามช่วงเวลา
              <HeaderInfoTooltip text="ยอดเงินจากการจำหน่ายบัตรแบ่งตามช่วงเวลา วันนี้, 7 วันล่าสุด และยอดสะสมรอบเดือนนี้" />
            </span>
            <ClockIcon className="overview-borderless-icon text-slate-500" />
          </div>
          <div className="kpi-period-metrics-stack">
            <div className="kpi-period-row" data-testid="overview-kpi-today">
              <div className="kpi-period-meta">
                <span className="period-name">ยอดขายวันนี้ (Today)</span>
                <span className="overview-trend-badge success">+12.5% จากเมื่อวาน</span>
              </div>
              <span className="period-val">{formatBaht(todaySales)}</span>
            </div>
            <div className="kpi-period-row" data-testid="overview-kpi-week">
              <div className="kpi-period-meta">
                <span className="period-name">ยอดขายสัปดาห์นี้</span>
                <span className="overview-trend-badge success">+8.2% จากสัปดาห์ก่อน</span>
              </div>
              <span className="period-val">{formatBaht(thisWeekSales)}</span>
            </div>
            <div className="kpi-period-row" data-testid="overview-kpi-month">
              <div className="kpi-period-meta">
                <span className="period-name">ยอดขายเดือนนี้</span>
                <span className="overview-trend-badge success">+15.4% จากเดือนก่อน</span>
              </div>
              <span className="period-val font-bold">{formatBaht(thisMonthSales)}</span>
            </div>
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-kpi-subtext">
              สรุปแนวโน้มยอดขายตามช่วงเวลาย้อนหลัง
            </span>
          </div>
        </div>
      </section>

      {/* 4. Concert Performance Vertical Cards Section (Search, Filter, Pagination) */}
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

        {/* Search, Filter & Sort Toolbar */}
        <div className="performance-filter-toolbar">
          <div className="filter-search-box">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="ค้นหาชื่อคอนเสิร์ต หรือสถานที่จัดงาน..."
              className="filter-search-input"
              aria-label="ค้นหาชื่อคอนเสิร์ตหรือสถานที่"
            />
            {searchQuery && (
              <button
                type="button"
                className="filter-clear-btn"
                onClick={() => handleSearchChange('')}
                aria-label="ล้างคำค้นหา"
              >
                ล้าง
              </button>
            )}
          </div>

          <div className="filter-controls-group">
            {/* Status Filter */}
            <div className="perf-filter-select-wrap">
              <span className="perf-filter-label">สถานะ:</span>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value as EventStatusFilter)}
                className="perf-filter-select"
                aria-label="กรองตามสถานะงาน"
              >
                <option value="all">ทั้งหมด ({events.length})</option>
                <option value="approved">กำลังเปิดขาย ({activeEventsCount})</option>
                <option value="pending_approval">รออนุมัติ ({pendingEventsCount})</option>
                <option value="draft">ฉบับร่าง ({draftEventsCount})</option>
              </select>
            </div>

            {/* Sort Select */}
            <div className="perf-filter-select-wrap">
              <span className="perf-filter-label">จัดเรียง:</span>
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value as EventSortBy)}
                className="perf-filter-select"
                aria-label="จัดเรียงลำดับคอนเสิร์ต"
              >
                <option value="latest">สร้างล่าสุด</option>
                <option value="grossSales">ยอดขายสูงสุด</option>
                <option value="soldTickets">จำหน่ายบัตรมากที่สุด</option>
                <option value="title">ชื่อคอนเสิร์ต (ก-ฮ)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Concert Cards Rendering */}
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
        ) : (
          <>
            <div className="overview-performance-grid overview-performance-list" data-testid="overview-performance-list">
              {paginatedEvents.map((ev) => {
                const stats = eventStats[ev.id] || {
                  soldTickets: 0,
                  grossSales: 0,
                  fee: 0,
                  netSales: 0,
                };
                const quota = ev.totalQuota || 1500;
                const sold = stats.soldTickets;
                const pct = quota > 0 ? Math.min(100, Math.round((sold / quota) * 100)) : 0;
                const gross = stats.grossSales;
                const fee = stats.fee;
                const net = stats.netSales;

                return (
                  <div
                    key={ev.id}
                    className="overview-concert-card horizontal-card"
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

                      <h3 className="concert-card-title" title={ev.title}>
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

                    {/* Zone 2: Financial Breakdown (Horizontal 3-Metric Summary, Clean Layout D-260, D-261) */}
                    <div className="concert-card-zone-finance highlight-net">
                      <div className="finance-metric-box">
                        <span className="finance-metric-label">
                          รายได้รวม
                          <HeaderInfoTooltip text="ยอดขายบัตรรวมจากคำสั่งซื้อที่ชำระเงินสำเร็จของคอนเสิร์ตนี้" />
                        </span>
                        <span className="finance-metric-val">{formatBaht(gross)}</span>
                      </div>

                      <div className="finance-metric-box">
                        <span className="finance-metric-label">
                          หักค่าบริการ (3%)
                          <HeaderInfoTooltip text="ค่าบริการแพลตฟอร์มระบบ TICKET ที่หักตามรอบการขาย" />
                        </span>
                        <span className="finance-metric-val fee-val">
                          {fee > 0 ? `-${formatBaht(fee)}` : '฿0'}
                        </span>
                      </div>

                      <div className="finance-metric-box highlight-net">
                        <span className="finance-metric-label">
                          ยอดสุทธิคงเหลือ
                          <HeaderInfoTooltip text="ยอดเงินสุทธิที่ผู้จัดงานจะได้รับหลังหักค่าบริการเรียบร้อยแล้ว" />
                        </span>
                        <span className="finance-metric-val net-val">{formatBaht(net)}</span>
                      </div>
                    </div>

                    {/* Zone 3: 3 Action Buttons */}
                    <div className="concert-card-zone-actions">
                      <Link
                        href={`/events/${ev.id}`}
                        className="overview-concert-action-btn btn-store"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="เปิดดูหน้าร้านลูกค้าในแท็บใหม่"
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <nav className="overview-pagination-bar" aria-label="การแบ่งหน้าคอนเสิร์ต">
                <span className="pagination-info-text">
                  แสดง {startIndex + 1} - {Math.min(startIndex + ITEMS_PER_PAGE, filteredEvents.length)} จากทั้งหมด {filteredEvents.length} คอนเสิร์ต
                </span>

                <div className="pagination-buttons-group">
                  <button
                    type="button"
                    className="pagination-btn nav-btn"
                    onClick={() => handlePageChange(validCurrentPage - 1)}
                    disabled={validCurrentPage <= 1}
                    aria-label="หน้าก่อนหน้า"
                  >
                    ก่อนหน้า
                  </button>

                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      className={`pagination-btn page-num-btn ${pageNum === validCurrentPage ? 'active' : ''}`}
                      onClick={() => handlePageChange(pageNum)}
                      aria-current={pageNum === validCurrentPage ? 'page' : undefined}
                    >
                      {pageNum}
                    </button>
                  ))}

                  <button
                    type="button"
                    className="pagination-btn nav-btn"
                    onClick={() => handlePageChange(validCurrentPage + 1)}
                    disabled={validCurrentPage >= totalPages}
                    aria-label="หน้าถัดไป"
                  >
                    ถัดไป
                  </button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
