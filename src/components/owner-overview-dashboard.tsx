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
  UsersIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  ClockIcon,
  BellIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';
import { HeaderInfoTooltip } from '@/components/header-info-tooltip';
import { Badge } from '@/components/ui';
import { formatBaht } from '@/lib/locale';
import { triggerRefreshToast } from '@/components/toast-notification';

interface MetricCardConfig {
  id: string;
  section: OwnerSectionId;
  targetManagerId: string;
  label: string;
  sub: string;
  icon: typeof ClipboardCheckIcon;
  countKey: keyof Omit<OwnerOverviewCounts, 'totalPending'>;
  tooltip: string;
}

const METRIC_CARDS: MetricCardConfig[] = [
  {
    id: 'pending-sessions',
    section: 'approval',
    targetManagerId: 'owner-session-approval-manager',
    label: 'รอบ / แก้ไข / ยกเลิก',
    sub: 'รออนุมัติให้เปิดขายหรือปรับปรุง',
    icon: ClipboardCheckIcon,
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
    countKey: 'pendingRefunds',
    tooltip: 'คำขอคืนเงินจากลูกค้าที่มีคุณสมบัติตามนโยบาย เช่น รอบการแสดงถูกยกเลิก หรือเลื่อนวันแสดง',
  },
  {
    id: 'payment-exceptions',
    section: 'finance',
    targetManagerId: 'owner-payment-recovery-manager',
    label: 'เงินเข้าล่าช้า / ผิดปกติ',
    sub: 'จ่ายช้าหลัง deadline หรือเกินรอบ',
    icon: BanknotesIcon,
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
    countKey: 'syncConflicts',
    tooltip: 'ข้อขัดแย้งของข้อมูลการสแกนบัตรหน้างานที่ทำงานแบบออฟไลน์แล้วพบสถานะไม่ตรงกับฐานข้อมูลกลาง',
  },
];

interface RecentActivityItem {
  id: string;
  type: 'session' | 'refund' | 'payout' | 'news' | 'customer';
  title: string;
  description: string;
  timestamp: string;
  badgeLabel: string;
  badgeVariant: 'warning' | 'success' | 'info' | 'neutral';
  section: OwnerSectionId;
  targetManagerId: string;
  actionText: string;
}

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

  // Dual-mode analytics charts state (D-224, D-256)
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('line');
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('7d');

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

  const maxLineValue = useMemo(() => {
    return Math.max(...lineChartData.map((d) => d.value), 1);
  }, [lineChartData]);

  // Selected Period Sales and Est. Fee calculations for Analytics Card
  const selectedPeriodSales = useMemo(() => {
    if (chartMode === 'bar') {
      return totalGrossRevenue;
    }
    return lineChartData.reduce((acc, cur) => acc + (cur.value || 0), 0);
  }, [chartMode, totalGrossRevenue, lineChartData]);

  const selectedPeriodEstFee = useMemo(() => {
    if (chartMode === 'bar') {
      return sales?.platformFee ?? Math.round(totalGrossRevenue * 0.03);
    }
    return Math.round(selectedPeriodSales * 0.03);
  }, [chartMode, sales?.platformFee, totalGrossRevenue, selectedPeriodSales]);

  // Breakdown of pending action queues for direct action jumping
  const pendingQueues = useMemo(() => {
    if (!counts) return [];
    const list: {
      id: string;
      label: string;
      count: number;
      section: 'approval' | 'finance' | 'customer' | 'system' | 'refunds' | 'scanner';
      targetManagerId: string;
    }[] = [];
    if ((counts.pendingSessions ?? 0) > 0) {
      list.push({
        id: 'sessions',
        label: `รอบการแสดงรออนุมัติ (${counts.pendingSessions})`,
        count: counts.pendingSessions,
        section: 'approval',
        targetManagerId: 'owner-session-approval-manager',
      });
    }
    if ((counts.pendingRefunds ?? 0) > 0) {
      list.push({
        id: 'refunds',
        label: `คำขอคืนเงินรอตรวจสอบ (${counts.pendingRefunds})`,
        count: counts.pendingRefunds,
        section: 'refunds',
        targetManagerId: 'owner-refund-approval-manager',
      });
    }
    if ((counts.paymentExceptions ?? 0) > 0) {
      list.push({
        id: 'payments',
        label: `ชำระเงินต้องตรวจสอบ (${counts.paymentExceptions})`,
        count: counts.paymentExceptions,
        section: 'finance',
        targetManagerId: 'owner-payment-recovery-manager',
      });
    }
    if ((counts.failedEmails ?? 0) > 0) {
      list.push({
        id: 'emails',
        label: `อีเมลส่งไม่สำเร็จ (${counts.failedEmails})`,
        count: counts.failedEmails,
        section: 'customer',
        targetManagerId: 'owner-email-deliveries-manager',
      });
    }
    if ((counts.syncConflicts ?? 0) > 0) {
      list.push({
        id: 'conflicts',
        label: `ข้อขัดแย้งออฟไลน์ (${counts.syncConflicts})`,
        count: counts.syncConflicts,
        section: 'scanner',
        targetManagerId: 'owner-offline-sync-manager',
      });
    }
    return list;
  }, [counts]);

  // Recent Operational Activity Data (D-256: Live Stream from real counts)
  const recentActivities: RecentActivityItem[] = useMemo(() => {
    const items: RecentActivityItem[] = [];
    if ((counts?.pendingSessions ?? 0) > 0) {
      items.push({
        id: 'act-sessions',
        type: 'session',
        title: `มีรายการรอบแสดงหรือคำขอเปลี่ยนแปลงรออนุมัติ ${counts?.pendingSessions} รายการ`,
        description: 'ตรวจสอบรอบการแสดงใหม่และคำขอแก้ไขจากผู้จัดงาน',
        timestamp: 'ล่าสุด',
        badgeLabel: 'รออนุมัติ',
        badgeVariant: 'warning',
        section: 'approval',
        targetManagerId: 'owner-session-approval-manager',
        actionText: 'ตรวจสอบรอบแสดง',
      });
    }
    if ((counts?.pendingRefunds ?? 0) > 0) {
      items.push({
        id: 'act-refunds',
        type: 'refund',
        title: `มีคำขอคืนเงินรอการตรวจสอบ ${counts?.pendingRefunds} รายการ`,
        description: 'ตรวจสอบคำขอคืนเงินของลูกค้าและดำเนินการอนุมัติหรือปฏิเสธ',
        timestamp: 'ล่าสุด',
        badgeLabel: 'รอตรวจสอบ',
        badgeVariant: 'warning',
        section: 'refunds',
        targetManagerId: 'owner-refund-approval-manager',
        actionText: 'ตรวจสอบคำขอ',
      });
    }
    if ((counts?.paymentExceptions ?? 0) > 0) {
      items.push({
        id: 'act-payments',
        type: 'payout',
        title: `มีรายการชำระเงินต้องตรวจสอบพิเศษ ${counts?.paymentExceptions} รายการ`,
        description: 'ตรวจสอบรายการชำระเงินล่าช้าหรือรอการจัดสรรบัตรเพิ่มเติม',
        timestamp: 'ล่าสุด',
        badgeLabel: 'ต้องตรวจสอบ',
        badgeVariant: 'warning',
        section: 'finance',
        targetManagerId: 'owner-payment-recovery-manager',
        actionText: 'ดูรายการชำระเงิน',
      });
    }
    if ((counts?.failedEmails ?? 0) > 0) {
      items.push({
        id: 'act-emails',
        type: 'customer',
        title: `มีรายการส่งอีเมลตั๋วไม่สำเร็จ ${counts?.failedEmails} รายการ`,
        description: 'ตรวจสอบที่อยู่อีเมลผู้ซื้อและสั่งส่งตั๋วซ้ำ',
        timestamp: 'ล่าสุด',
        badgeLabel: 'ส่งไม่สำเร็จ',
        badgeVariant: 'warning',
        section: 'customer',
        targetManagerId: 'owner-email-deliveries-manager',
        actionText: 'จัดการอีเมล',
      });
    }
    return items;
  }, [counts]);

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
      {/* 1. Header Toolbar (D-223, D-256: Clean Baseline Header & Quick Actions Bar D-122) */}
      {isFullOverview && (
        <>
          <header className="owner-overview-header-toolbar">
            <div className="owner-overview-header-titles">
              <h1 className="owner-overview-header-title">ภาพรวมระบบจัดการ (Owner Overview)</h1>
              <p className="owner-overview-header-subtitle">
                ศูนย์ควบคุมและแดชบอร์ดบริหาร ติดตามสถานะงานค้าง การอนุมัติ และสถิติภาพรวมทั้งแพลตฟอร์ม
              </p>
            </div>
          </header>

          <div className="owner-overview-quick-actions-bar">
            <div className="owner-overview-header-actions">
              <button
                type="button"
                className="secondary-button"
                data-testid="owner-overview-invite-btn"
                onClick={() => onNavigateToSection('invitations', 'invite-organizer-form')}
                style={{ height: '38px', minHeight: '38px', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <UserPlusIcon style={{ width: '16px', height: '16px' }} />
                <span>เชิญผู้จัดงานใหม่</span>
              </button>

              <button
                type="button"
                className="secondary-button overview-refresh-btn"
                data-testid="owner-overview-refresh-btn"
                onClick={async () => {
                  await fetchOverview();
                  triggerRefreshToast('ภาพรวม');
                }}
                disabled={loading}
                aria-label="รีเฟรชข้อมูลภาพรวม"
                style={{ height: '38px', minHeight: '38px', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <RefreshIcon style={{ width: '16px', height: '16px' }} className={`btn-icon ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* 2. Top 4 Platform KPI Summary Strip (D-223, D-224, D-256: Pure Minimal Cards) */}
      {isFullOverview && (
        <section className="owner-kpi-grid" aria-label="สรุปตัวชี้วัดสำคัญระดับแพลตฟอร์ม">
          {/* KPI 1: Concerts */}
          <div
            className="overview-kpi-card pure-kpi"
            data-testid="owner-kpi-concerts"
          >
            <div className="overview-kpi-header">
              <span className="overview-kpi-title">
                คอนเสิร์ตทั้งหมดในระบบ
                <HeaderInfoTooltip text="จำนวนคอนเสิร์ตทั้งหมดที่ลงทะเบียนในระบบ และจำนวนงานที่กำลังเปิดจำหน่ายบัตร ณ ปัจจุบัน" />
              </span>
              <TicketIcon className="overview-borderless-icon text-blue" />
            </div>
            <div className="overview-kpi-value">
              {sales?.openEvents ?? '–'}{' '}
              <span className="overview-kpi-unit">งานเปิดขาย</span>
            </div>
            <div className="overview-kpi-footer">
              <span className="overview-kpi-subtext">จากทั้งหมด {sales?.totalEvents ?? '–'} งาน</span>
              <span className="overview-trend-badge success">พร้อมให้บริการ</span>
            </div>
          </div>

          {/* KPI 2: Total Pending Items */}
          <div
            className="overview-kpi-card pure-kpi"
            data-testid="owner-kpi-pending"
          >
            <div className="overview-kpi-header">
              <span className="overview-kpi-title">
                งานค้างรอการตัดสินใจ
                <HeaderInfoTooltip text="จำนวนรายการที่ต้องรอให้เจ้าของระบบตรวจสอบและตัดสินใจ เช่น รอบการแสดงขออนุมัติ คำขอคืนเงิน หรือข้อผิดพลาดระบบ" />
              </span>
              <ClockIcon className="overview-borderless-icon text-amber" />
            </div>
            <div className={`overview-kpi-value ${totalPending > 0 ? 'text-amber' : ''}`}>
              {totalPending}{' '}
              <span className="overview-kpi-unit">รายการ</span>
            </div>
            <div className="overview-kpi-footer">
              <span className="overview-kpi-subtext">
                {totalPending > 0 ? 'ต้องดำเนินการตรวจสอบ' : 'คิวงานปกติทั้งหมด'}
              </span>
              <span className={`overview-trend-badge ${totalPending > 0 ? 'warning' : 'success'}`}>
                {totalPending > 0 ? 'ต้องจัดการ' : 'ปกติ'}
              </span>
            </div>
          </div>

          {/* KPI 3: Gross Revenue */}
          <div
            className="overview-kpi-card pure-kpi"
            data-testid="owner-kpi-revenue"
          >
            <div className="overview-kpi-header">
              <span className="overview-kpi-title">
                ยอดจำหน่ายบัตรรวมทั้งระบบ
                <HeaderInfoTooltip text="ยอดเงินสะสมจากการจำหน่ายบัตรคอนเสิร์ตทุกงานในแพลตฟอร์มก่อนหักค่าธรรมเนียม" />
              </span>
              <BanknotesIcon className="overview-borderless-icon text-indigo" />
            </div>
            <div className="overview-kpi-value text-indigo">
              {sales ? formatBaht(totalGrossRevenue) : '–'}
            </div>
            <div className="overview-kpi-footer">
              <span className="overview-kpi-subtext">ยอดขายรวมก่อนหักค่าบริการ</span>
            </div>
          </div>

          {/* KPI 4: Platform Fee (3%) */}
          <div
            className="overview-kpi-card pure-kpi"
            data-testid="owner-kpi-system"
          >
            <div className="overview-kpi-header">
              <span className="overview-kpi-title">
                ค่าบริการที่เรียกเก็บจากผู้จัดงาน
                <HeaderInfoTooltip text="ยอดค่าบริการผู้จัดงานรวมตามรายงานการเงินของแต่ละงาน" />
              </span>
              <ShieldCheckIcon className="overview-borderless-icon text-emerald" />
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

      {/* 3. The 5 Action Items Cards Strip (Flat Canvas - D-256, AC-115, TASK-039) */}
      <section
        className="owner-overview-section flat-overview-section"
        data-testid="owner-overview-dashboard"
        aria-labelledby="owner-overview-title"
      >
        <div className="owner-overview-header">
          <div className="owner-overview-title-group">
            <h2 id="owner-overview-title" className="owner-overview-title">
              ภาพรวมงานค้างที่ต้องดำเนินการ (Overview)
              <HeaderInfoTooltip text="รายการงานค้าง 5 หมวดหมู่หลักที่ต้องได้รับการตรวจสอบ ดำเนินการ หรืออนุมัติโดยเจ้าของระบบ" />
            </h2>
            <span
              className={`overview-total-badge ${totalPending > 0 ? 'has-pending' : 'all-clear'}`}
              data-testid="overview-total-badge"
            >
              {totalPending > 0 ? `มีงานค้าง ${totalPending} รายการ` : 'ไม่มีงานค้างที่ต้องดำเนินการ'}
            </span>
          </div>

          <button
            type="button"
            onClick={async () => {
              await fetchOverview();
              triggerRefreshToast('ภาพรวม');
            }}
            disabled={loading}
            className="secondary-button mini-btn"
            data-testid="overview-refresh-btn"
            aria-label="รีเฟรชข้อมูลภาพรวม"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: '32px', minHeight: '32px' }}
          >
            <RefreshIcon style={{ width: '14px', height: '14px' }} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
          </button>
        </div>

        {error && (
          <div role="alert" style={{ color: '#b91c1c', fontSize: '0.9rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div className="overview-cards-grid">
          {METRIC_CARDS.map(card => {
            const Icon = card.icon;
            const count = counts ? counts[card.countKey] : 0;
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
                  <Icon className="overview-borderless-icon text-indigo" />
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

      {/* 4. Attention Banner (D-223, D-256) */}
      {isFullOverview && (
        <section className="owner-status-section" aria-label="สถานะคิวงานของเจ้าของระบบ">
          {totalPending > 0 ? (
            <div className="overview-attention-banner warning" data-testid="owner-attention-warning">
              <div className="banner-left">
                <div className="banner-icon-box bg-amber">
                  <AlertTriangleIcon className="overview-borderless-icon text-amber" />
                </div>
                <div className="banner-content">
                  <div className="banner-title-row">
                    <h2 className="banner-title">
                      มีคิวงานค้างที่ต้องตัดสินใจ {totalPending} รายการ (Pending Action Required)
                    </h2>
                    <span className="badge-pending-count">ต้องดำเนินการ</span>
                  </div>
                  <p className="banner-desc">
                    มีรายการที่รอการตรวจสอบและตัดสินใจโดยเจ้าของระบบ กรุณาเลือกรายการด้านล่างเพื่อดำเนินการทันที
                  </p>
                  {pendingQueues.length > 0 && (
                    <div className="pending-breakdown-chips">
                      {pendingQueues.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          className="pending-chip-btn"
                          onClick={() => onNavigateToSection(q.section, q.targetManagerId)}
                        >
                          <span className="chip-dot" />
                          <span>{q.label}</span>
                          <ChevronRightIcon style={{ width: '12px', height: '12px' }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="banner-right-actions">
                <button
                  type="button"
                  className="banner-action-btn"
                  onClick={() => {
                    const firstTarget = pendingQueues[0];
                    if (firstTarget) {
                      onNavigateToSection(firstTarget.section, firstTarget.targetManagerId);
                    } else {
                      onNavigateToSection('approval', 'owner-session-approval-manager');
                    }
                  }}
                  style={{ height: '38px', minHeight: '38px' }}
                >
                  <span>ตรวจสอบคิวงานทันที</span>
                  <ChevronRightIcon className="btn-icon-right" />
                </button>
              </div>
            </div>
          ) : (
            <div className="overview-attention-banner success" data-testid="owner-attention-success">
              <div className="banner-left">
                <div className="banner-icon-box bg-emerald">
                  <ShieldCheckIcon className="overview-borderless-icon text-emerald" />
                </div>
                <div className="banner-content">
                  <h2 className="banner-title">ระบบทำงานปกติ ไม่มีงานค้างรอการตัดสินใจ</h2>
                  <p className="banner-desc">
                    รอบการแสดง คำขอคืนเงิน และข้อมูลการสแกนบัตรทั้งหมดอยู่ในสถานะปกติและได้รับการดูแลครบถ้วน
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="banner-action-btn secondary"
                onClick={() => onNavigateToSection('approval', 'owner-session-approval-manager')}
                style={{ height: '38px', minHeight: '38px' }}
              >
                <span>เข้าสู่ระบบอนุมัติ</span>
                <ChevronRightIcon className="btn-icon-right" />
              </button>
            </div>
          )}
        </section>
      )}

      {/* 5. Clean 2-Column Analytics & Top Concerts (D-224, D-256: Option A2) */}
      {isFullOverview && (
        <div className="overview-analytics-grid-two-col">
          {/* Column 1: Clean Minimal Analytics Charts */}
          <section className="overview-charts-card" aria-labelledby="owner-charts-title" data-testid="owner-charts-panel">
            <div className="charts-card-top-bar">
              <div className="charts-card-title-wrap">
                <h2 id="owner-charts-title" className="charts-card-title">
                  กราฟวิเคราะห์ยอดขายและการเงินแพลตฟอร์ม (Platform Analytics)
                  <HeaderInfoTooltip text="วิเคราะห์เปรียบเทียบสัดส่วนยอดขายระหว่างคอนเสิร์ตต่างๆ และแนวโน้มยอดขายตามเวลาออกบัตร (เวลาไทย)" />
                </h2>
                <p className="charts-card-subtitle">
                  สลับมุมมองระหว่างกราฟแท่งเปรียบเทียบสัดส่วนรายได้แต่ละคอนเสิร์ต หรือกราฟเส้นแนวโน้มยอดขายตามช่วงเวลา
                </p>
              </div>

              <div className="charts-controls-wrap">
                {/* Mode Switcher Tabs */}
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

                {/* Time Filter Pills for Line Chart */}
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

            {/* Financial Quick Metrics Summary Bar */}
            <div className="charts-kpi-summary-strip">
              <div className="chart-summary-chip">
                <span className="summary-chip-label">
                  {chartMode === 'bar' ? 'ยอดจำหน่ายรวมทั้งระบบ' : `ยอดขายรวม (${timeRange === 'today' ? 'วันนี้' : timeRange === '7d' ? '7 วันล่าสุด' : '30 วันล่าสุด'})`}
                </span>
                <strong className="summary-chip-value">{formatBaht(selectedPeriodSales)}</strong>
              </div>
              <div className="chart-summary-chip">
                <span className="summary-chip-label">ส่วนแบ่งค่าบริการระบบ (3%)</span>
                <strong className="summary-chip-value text-emerald">{formatBaht(selectedPeriodEstFee)}</strong>
              </div>
              <div className="chart-summary-chip">
                <span className="summary-chip-label">คอนเสิร์ตที่มีการขาย</span>
                <strong className="summary-chip-value">{barChartEvents.length} งาน</strong>
              </div>
            </div>

            {/* Chart Viewport */}
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
                /* Mode 1: Bar Chart Comparison Across Concerts */
                <div className="overview-barchart-container" data-testid="owner-barchart">
                  <div className="barchart-bars-stack">
                    {barChartEvents.map((ev) => {
                      const barWidthPct = maxBarSales > 0 ? Math.max(8, Math.round((ev.sales / maxBarSales) * 100)) : 8;
                      const sharePct = totalGrossRevenue > 0 ? Math.round((ev.sales / totalGrossRevenue) * 100) : 0;

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
                              {ev.open ? 'กำลังเปิดขาย' : getStatusLabel(ev.status)}
                            </Badge>
                          </div>

                          <div className="barchart-item-bar-col">
                            <div className="barchart-bar-track">
                              <div
                                className="barchart-bar-fill"
                                style={{ width: `${barWidthPct}%` }}
                                title={`${ev.title}: ${formatBaht(ev.sales)} (${sharePct}% ของยอดรวมทั้งระบบ)`}
                              >
                                <span className="barchart-inner-label">{sharePct > 8 ? `${sharePct}%` : ''}</span>
                              </div>
                            </div>
                          </div>

                          <div className="barchart-item-stat-col">
                            <span className="barchart-sales-val">{formatBaht(ev.sales)}</span>
                            <span className="barchart-tickets-val">ขายได้ {ev.soldCount.toLocaleString()} / {ev.quota.toLocaleString()} ใบ</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Mode 2: Line Chart Sales Trend Over Time */
                <div className="overview-linechart-container" data-testid="owner-linechart">
                  <div className="linechart-svg-wrap">
                    <svg
                      viewBox="0 0 760 220"
                      className="linechart-svg"
                      preserveAspectRatio="none"
                      aria-label="กราฟเส้นแนวโน้มยอดขายตามช่วงเวลา"
                    >
                      <defs>
                        <linearGradient id="ownerLineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid lines with Y-Axis Tick Labels */}
                      <g className="linechart-grid-lines">
                        <line x1="55" y1="30" x2="745" y2="30" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                        <text x="48" y="34" textAnchor="end" fill="#94a3b8" fontSize="10">{formatBaht(maxLineValue)}</text>

                        <line x1="55" y1="80" x2="745" y2="80" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                        <text x="48" y="84" textAnchor="end" fill="#94a3b8" fontSize="10">{formatBaht(Math.round(maxLineValue * 0.67))}</text>

                        <line x1="55" y1="130" x2="745" y2="130" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                        <text x="48" y="134" textAnchor="end" fill="#94a3b8" fontSize="10">{formatBaht(Math.round(maxLineValue * 0.33))}</text>

                        <line x1="55" y1="180" x2="745" y2="180" stroke="#e2e8f0" strokeWidth="1" />
                        <text x="48" y="184" textAnchor="end" fill="#94a3b8" fontSize="10">฿0</text>
                      </g>

                      {/* Generate Path Coordinates */}
                      {(() => {
                        const stepX = (740 - 75) / Math.max(lineChartData.length - 1, 1);
                        const coords = lineChartData.map((d, i) => {
                          const x = 75 + i * stepX;
                          const y = 180 - (d.value / maxLineValue) * 150;
                          return { x, y, ...d };
                        });

                        const pathD = coords.reduce((acc, pt, i) => {
                          return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
                        }, '');

                        const areaD = `${pathD} L ${coords[coords.length - 1].x} 180 L ${coords[0].x} 180 Z`;

                        return (
                          <>
                            <path d={areaD} fill="url(#ownerLineAreaGrad)" />
                            <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            {coords.map((pt) => (
                              <g key={`point-${pt.label}`} className="linechart-data-point">
                                <circle cx={pt.x} cy={pt.y} r="4.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
                                {pt.value > 0 && (
                                  <text
                                    x={pt.x}
                                    y={pt.y - 10}
                                    textAnchor="middle"
                                    className="linechart-val-text"
                                    fill="#0f172a"
                                    fontSize="10"
                                    fontWeight="600"
                                  >
                                    {formatBaht(pt.value)}
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
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Column 2: Top 5 Performing Concerts Card (D-256) */}
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
                className="top-concerts-view-all-btn"
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

      {/* 6. Recent Operational Activity Feed (D-256: Option A3) */}
      {isFullOverview && (
        <section className="overview-recent-activity-section" aria-labelledby="owner-activity-title">
          <div className="activity-section-header">
            <div className="activity-title-group">
              <h2 id="owner-activity-title" className="activity-section-title">
                ประวัติกิจกรรมและการดำเนินงานล่าสุด (Recent Operational Activity)
                <HeaderInfoTooltip text="รายการการส่งงาน อนุมัติ และการทำธุรกรรมสดล่าสุดในแพลตฟอร์มแบบเรียลไทม์" />
              </h2>
              <p className="activity-section-subtitle">
                บันทึกความเคลื่อนไหวล่าสุดของระบบ เพื่อให้เจ้าของระบบติดตามและเข้าจัดการได้ทันที
              </p>
            </div>

            <span className="activity-live-indicator">
              <span className="activity-live-dot" />
              <span>ตามข้อมูลที่โหลดล่าสุด</span>
            </span>
          </div>

          <div className="activity-items-list">
            {recentActivities.map((act) => (
              <div key={act.id} className="activity-item-card">
                <div className="activity-item-left">
                  <div className={`activity-icon-avatar type-${act.type}`}>
                    {act.type === 'session' && <ClipboardCheckIcon style={{ width: '18px', height: '18px' }} />}
                    {act.type === 'refund' && <CheckCircleIcon style={{ width: '18px', height: '18px' }} />}
                    {act.type === 'payout' && <BanknotesIcon style={{ width: '18px', height: '18px' }} />}
                    {act.type === 'news' && <BellIcon style={{ width: '18px', height: '18px' }} />}
                    {act.type === 'customer' && <UsersIcon style={{ width: '18px', height: '18px' }} />}
                  </div>

                  <div className="activity-content-body">
                    <div className="activity-title-row">
                      <span className="activity-title-text">{act.title}</span>
                      <Badge variant={act.badgeVariant} size="sm">
                        {act.badgeLabel}
                      </Badge>
                      <span className="activity-timestamp">{act.timestamp}</span>
                    </div>
                    <p className="activity-desc-text">{act.description}</p>
                  </div>
                </div>

                <div className="activity-item-right">
                  <button
                    type="button"
                    className="secondary-button activity-jump-btn"
                    onClick={() => onNavigateToSection(act.section, act.targetManagerId)}
                    style={{ height: '34px', minHeight: '34px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <span>{act.actionText}</span>
                    <ChevronRightIcon style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7. Workspace Quick Navigation Launchpad (D-221, D-224, D-256: Test & E2E Compatible) */}
      {isFullOverview && (
        <section className="overview-launchpad-section" aria-label="ทางลัดการทำงานด่วนของเจ้าของระบบ">
          <div className="launchpad-section-header">
            <h3 className="launchpad-section-title">เมนูและทางลัดการทำงานด่วน (Workspace Quick Navigation)</h3>
            <span className="launchpad-section-sub">เข้าถึงโมดูลหลักของระบบแอดมินได้ทันที</span>
          </div>

          <div className="overview-launchpad-grid compact-grid">
            {/* Launchpad 1: Approval */}
            <button
              type="button"
              className="launchpad-card compact"
              data-testid="launchpad-owner-approval"
              onClick={() => onNavigateToSection('approval', 'owner-session-approval-manager')}
            >
              <div className="launchpad-icon-box bg-blue">
                <ClipboardCheckIcon className="overview-borderless-icon text-blue" />
              </div>
              <div className="launchpad-body">
                <h3 className="launchpad-title">อนุมัติคอนเสิร์ตและคืนเงิน</h3>
                <p className="launchpad-desc">รอบแสดง คำขอยกเลิก และคำขอคืนเงิน</p>
              </div>
              <ChevronRightIcon className="cta-icon" />
            </button>

            {/* Launchpad 2: Finance */}
            <button
              type="button"
              className="launchpad-card compact"
              data-testid="launchpad-owner-finance"
              onClick={() => onNavigateToSection('finance', 'owner-weekly-payout-manager')}
            >
              <div className="launchpad-icon-box bg-indigo">
                <BanknotesIcon className="overview-borderless-icon text-indigo" />
              </div>
              <div className="launchpad-body">
                <h3 className="launchpad-title">ระบบการเงินและรอบโอน</h3>
                <p className="launchpad-desc">รอบโอนรายสัปดาห์ เงินสำรอง และสลิป</p>
              </div>
              <ChevronRightIcon className="cta-icon" />
            </button>

            {/* Launchpad 3: Customer */}
            <button
              type="button"
              className="launchpad-card compact"
              data-testid="launchpad-owner-customer"
              onClick={() => onNavigateToSection('customer', 'owner-contact-correction-manager')}
            >
              <div className="launchpad-icon-box bg-purple">
                <UsersIcon className="overview-borderless-icon text-purple" />
              </div>
              <div className="launchpad-body">
                <h3 className="launchpad-title">ลูกค้าและคำสั่งซื้อ</h3>
                <p className="launchpad-desc">แก้ไขข้อมูลผู้ซื้อ และตรวจสอบการส่งตั๋ว</p>
              </div>
              <ChevronRightIcon className="cta-icon" />
            </button>

            {/* Launchpad 4: System */}
            <button
              type="button"
              className="launchpad-card compact"
              data-testid="launchpad-owner-system"
              onClick={() => onNavigateToSection('system', 'invite-organizer-form')}
            >
              <div className="launchpad-icon-box bg-emerald">
                <SlidersIcon className="overview-borderless-icon text-emerald" />
              </div>
              <div className="launchpad-body">
                <h3 className="launchpad-title">ระบบและคำเชิญ</h3>
                <p className="launchpad-desc">ประกาศข่าวสาร ข้อมูลติดต่อ และคำเชิญ</p>
              </div>
              <ChevronRightIcon className="cta-icon" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
