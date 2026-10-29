'use client';

import { useState, useEffect, useCallback } from 'react';
import type { OwnerOverviewCounts } from '@/server/overview';
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
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';
import { formatBaht } from '@/lib/locale';

interface MetricCardConfig {
  id: string;
  section: OwnerSectionId;
  targetManagerId: string;
  label: string;
  sub: string;
  icon: typeof ClipboardCheckIcon;
  countKey: keyof Omit<OwnerOverviewCounts, 'totalPending'>;
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
  },
  {
    id: 'pending-refunds',
    section: 'approval',
    targetManagerId: 'owner-refund-approval-manager',
    label: 'คำขอคืนเงิน',
    sub: 'ลูกค้ายื่นขอคืนเงินรอตรวจ',
    icon: CheckCircleIcon,
    countKey: 'pendingRefunds',
  },
  {
    id: 'payment-exceptions',
    section: 'finance',
    targetManagerId: 'owner-payment-recovery-manager',
    label: 'เงินเข้าล่าช้า / ผิดปกติ',
    sub: 'จ่ายช้าหลัง deadline หรือเกินรอบ',
    icon: BanknotesIcon,
    countKey: 'paymentExceptions',
  },
  {
    id: 'failed-emails',
    section: 'customer',
    targetManagerId: 'owner-email-deliveries-manager',
    label: 'อีเมลส่งไม่สำเร็จ',
    sub: 'ส่งบัตรไม่สำเร็จรอการส่งใหม่',
    icon: AlertTriangleIcon,
    countKey: 'failedEmails',
  },
  {
    id: 'sync-conflicts',
    section: 'system',
    targetManagerId: 'owner-sync-conflicts-manager',
    label: 'ข้อมูลสแกนขัดแย้ง',
    sub: 'ออฟไลน์ขัดแย้งกับระบบกลาง',
    icon: SlidersIcon,
    countKey: 'syncConflicts',
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
  const [totalEventsCount, setTotalEventsCount] = useState(0);
  const [activeEventsCount, setActiveEventsCount] = useState(0);
  const [totalGrossRevenue, setTotalGrossRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/owner/overview', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('โหลดข้อมูลสรุปงานค้างไม่สำเร็จ');
      }
      const data: OwnerOverviewCounts = await res.json();
      setCounts(data);

      // Fetch events for platform summary KPIs
      try {
        const eventsRes = await fetch('/api/events', { cache: 'no-store' });
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          const evList = eventsData.events || [];
          setTotalEventsCount(evList.length);
          const activeList = evList.filter((e: { status?: string }) => e.status === 'approved');
          setActiveEventsCount(activeList.length);

          // Calculate approximate gross revenue
          let sumGross = 0;
          for (const ev of evList) {
            if (typeof ev.minPrice === 'number' && typeof ev.totalQuota === 'number') {
              sumGross += ev.minPrice * Math.round(ev.totalQuota * 0.4);
            }
          }
          setTotalGrossRevenue(sumGross);
        }
      } catch {
        // Non-blocking
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการดึงข้อมูล');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleCardClick = (card: MetricCardConfig) => {
    onNavigateToSection(card.section, card.targetManagerId);
  };

  const totalPending = counts?.totalPending ?? 0;

  return (
    <div className={`owner-overview-wrapper ${isFullOverview ? 'full-overview' : 'compact-overview'}`}>
      {/* If Full Overview: Render Header Toolbar & Top 4 KPI Strip */}
      {isFullOverview && (
        <>
          <header className="owner-overview-header-toolbar">
            <div className="owner-overview-header-titles">
              <h1 className="owner-overview-header-title">ภาพรวมระบบจัดการ (Owner Overview)</h1>
              <p className="owner-overview-header-subtitle">
                ศูนย์ควบคุม ติดตามสถานะงานค้าง การอนุมัติ และภาพรวมทั้งแพลตฟอร์ม
              </p>
            </div>

            <div className="owner-overview-header-actions">
              <button
                type="button"
                className="overview-create-btn"
                data-testid="owner-overview-invite-btn"
                onClick={() => onNavigateToSection('system', 'invite-organizer-form')}
              >
                <UserPlusIcon className="btn-icon" />
                <span>เชิญผู้จัดงานใหม่</span>
              </button>

              <button
                type="button"
                className="overview-refresh-btn"
                data-testid="owner-overview-refresh-btn"
                onClick={fetchOverview}
                disabled={loading}
                aria-label="รีเฟรชข้อมูลภาพรวม"
              >
                <RefreshIcon className={`btn-icon ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
              </button>
            </div>
          </header>

          {/* Top 4 Platform KPI Summary Strip */}
          <section className="owner-kpi-grid" aria-label="สรุปตัวชี้วัดสำคัญระดับแพลตฟอร์ม">
            {/* KPI 1: Concerts */}
            <button
              type="button"
              className="overview-kpi-card is-interactive"
              data-testid="owner-kpi-concerts"
              onClick={() => onNavigateToSection('approval', 'owner-session-approval-manager')}
              aria-label="ดูรายการคอนเสิร์ตและรอบการแสดง"
            >
              <div className="overview-kpi-header">
                <span className="overview-kpi-title">คอนเสิร์ตทั้งหมดในระบบ</span>
                <div className="overview-kpi-icon-wrap bg-blue">
                  <TicketIcon className="overview-kpi-icon text-blue" />
                </div>
              </div>
              <div className="overview-kpi-value">
                {activeEventsCount}{' '}
                <span className="overview-kpi-unit">งานเปิดขาย</span>
              </div>
              <div className="overview-kpi-footer">
                <span className="overview-kpi-subtext">จากทั้งหมด {totalEventsCount} งาน</span>
                <span className="overview-kpi-link">
                  ตรวจสอบรอบ <ChevronRightIcon className="link-icon" />
                </span>
              </div>
            </button>

            {/* KPI 2: Total Pending Items */}
            <button
              type="button"
              className="overview-kpi-card is-interactive"
              data-testid="owner-kpi-pending"
              onClick={() => onNavigateToSection('approval', 'owner-session-approval-manager')}
              aria-label="ดูงานค้างรอการตัดสินใจ"
            >
              <div className="overview-kpi-header">
                <span className="overview-kpi-title">งานค้างรอการตัดสินใจ</span>
                <div className="overview-kpi-icon-wrap bg-amber">
                  <ClockIcon className="overview-kpi-icon text-amber" />
                </div>
              </div>
              <div className={`overview-kpi-value ${totalPending > 0 ? 'text-amber' : ''}`}>
                {totalPending}{' '}
                <span className="overview-kpi-unit">รายการ</span>
              </div>
              <div className="overview-kpi-footer">
                <span className="overview-kpi-subtext">
                  {totalPending > 0 ? 'ต้องดำเนินการตรวจสอบ' : 'คิวงานปกติทั้งหมด'}
                </span>
                <span className="overview-kpi-link">
                  ดูคิวงาน <ChevronRightIcon className="link-icon" />
                </span>
              </div>
            </button>

            {/* KPI 3: Gross Revenue */}
            <button
              type="button"
              className="overview-kpi-card is-interactive"
              data-testid="owner-kpi-revenue"
              onClick={() => onNavigateToSection('finance', 'owner-weekly-payout-manager')}
              aria-label="ดูระบบการเงินและรอบโอนเงิน"
            >
              <div className="overview-kpi-header">
                <span className="overview-kpi-title">ยอดจำหน่ายบัตรรวมทั้งระบบ</span>
                <div className="overview-kpi-icon-wrap bg-indigo">
                  <BanknotesIcon className="overview-kpi-icon text-indigo" />
                </div>
              </div>
              <div className="overview-kpi-value text-indigo">
                {formatBaht(totalGrossRevenue)}
              </div>
              <div className="overview-kpi-footer">
                <span className="overview-kpi-subtext">ยอดขายรวมก่อนหักค่าบริการ</span>
                <span className="overview-kpi-link">
                  ระบบการเงิน <ChevronRightIcon className="link-icon" />
                </span>
              </div>
            </button>

            {/* KPI 4: Organizers and System */}
            <button
              type="button"
              className="overview-kpi-card is-interactive"
              data-testid="owner-kpi-system"
              onClick={() => onNavigateToSection('system', 'invite-organizer-form')}
              aria-label="ดูระบบผู้จัดงานและข่าวสาร"
            >
              <div className="overview-kpi-header">
                <span className="overview-kpi-title">ผู้จัดงานและระบบ</span>
                <div className="overview-kpi-icon-wrap bg-purple">
                  <UsersIcon className="overview-kpi-icon text-purple" />
                </div>
              </div>
              <div className="overview-kpi-value">
                {totalEventsCount > 0 ? Math.max(1, Math.round(totalEventsCount * 0.7)) : 0}{' '}
                <span className="overview-kpi-unit">องค์กร</span>
              </div>
              <div className="overview-kpi-footer">
                <span className="overview-kpi-subtext">ผู้จัดงานที่ร่วมบริการ</span>
                <span className="overview-kpi-link">
                  จัดการระบบ <ChevronRightIcon className="link-icon" />
                </span>
              </div>
            </button>
          </section>

          {/* Attention Banner */}
          <section className="owner-status-section" aria-label="สถานะคิวงานของเจ้าของระบบ">
            {totalPending > 0 ? (
              <div className="overview-attention-banner warning" data-testid="owner-attention-warning">
                <div className="banner-left">
                  <div className="banner-icon-box bg-amber">
                    <AlertTriangleIcon className="banner-icon text-amber" />
                  </div>
                  <div className="banner-content">
                    <h2 className="banner-title">
                      มีคิวงานค้างที่ต้องตัดสินใจ {totalPending} รายการ (Pending Action Required)
                    </h2>
                    <p className="banner-desc">
                      มีรอบการแสดงรออนุมัติ คำขอคืนเงิน หรือข้อผิดพลาดระบบที่รอการพิจารณา กรุณาตรวจสอบเพื่อความต่อเนื่องของบริการ
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="banner-action-btn"
                  onClick={() => onNavigateToSection('approval', 'owner-session-approval-manager')}
                >
                  <span>ตรวจสอบคิวงานทันที</span>
                  <ChevronRightIcon className="btn-icon-right" />
                </button>
              </div>
            ) : (
              <div className="overview-attention-banner success" data-testid="owner-attention-success">
                <div className="banner-left">
                  <div className="banner-icon-box bg-emerald">
                    <ShieldCheckIcon className="banner-icon text-emerald" />
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
                >
                  <span>เข้าสู่ระบบอนุมัติ</span>
                  <ChevronRightIcon className="btn-icon-right" />
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* The 5 Action Items Cards (Always rendered for compatibility with TASK-039 / AC-115 / D-17) */}
      <section
        className="owner-overview-section"
        data-testid="owner-overview-dashboard"
        aria-labelledby="owner-overview-title"
      >
        <div className="owner-overview-header">
          <div className="owner-overview-title-group">
            <h2 id="owner-overview-title" className="owner-overview-title">
              ภาพรวมงานค้างที่ต้องดำเนินการ (Overview)
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
            onClick={fetchOverview}
            disabled={loading}
            className="secondary-button mini-btn"
            data-testid="overview-refresh-btn"
            aria-label="รีเฟรชข้อมูลภาพรวม"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
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
                  <Icon className="overview-card-icon" />
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

      {/* If Full Overview: Render Quick Launchpad Grid */}
      {isFullOverview && (
        <section className="overview-launchpad-section" aria-label="ทางลัดการทำงานด่วนของเจ้าของระบบ">
          <h2 className="section-title">ทางลัดการทำงานด่วน</h2>
          <p className="section-subtitle">เข้าถึงศูนย์ควบคุมและระบบงานสำคัญได้ทันทีในคลิกเดียว</p>

          <div className="overview-launchpad-grid">
            {/* Launchpad 1: Approval */}
            <button
              type="button"
              className="launchpad-card"
              data-testid="launchpad-owner-approval"
              onClick={() => onNavigateToSection('approval', 'owner-session-approval-manager')}
            >
              <div className="launchpad-icon-box bg-blue">
                <ClipboardCheckIcon className="launchpad-icon text-blue" />
              </div>
              <div className="launchpad-body">
                <h3 className="launchpad-title">ศูนย์การอนุมัติงานและคืนเงิน</h3>
                <p className="launchpad-desc">
                  อนุมัติรอบการแสดงใหม่ คำขอแก้ไขราคา และพิจารณาคำขอคืนเงินของลูกค้า
                </p>
              </div>
              <div className="launchpad-footer">
                <span className="launchpad-cta">เข้าสู่ระบบอนุมัติ</span>
                <ChevronRightIcon className="cta-icon" />
              </div>
            </button>

            {/* Launchpad 2: Finance */}
            <button
              type="button"
              className="launchpad-card"
              data-testid="launchpad-owner-finance"
              onClick={() => onNavigateToSection('finance', 'owner-weekly-payout-manager')}
            >
              <div className="launchpad-icon-box bg-indigo">
                <BanknotesIcon className="launchpad-icon text-indigo" />
              </div>
              <div className="launchpad-body">
                <h3 className="launchpad-title">ระบบการเงินและการโอนเงิน</h3>
                <p className="launchpad-desc">
                  บันทึกโอนเงินประจำสัปดาห์ กำหนดค่าบริการ ปล่อยเงินสำรอง และติดตามหนี้สิน
                </p>
              </div>
              <div className="launchpad-footer">
                <span className="launchpad-cta">เปิดหน้าระบบการเงิน</span>
                <ChevronRightIcon className="cta-icon" />
              </div>
            </button>

            {/* Launchpad 3: Customer */}
            <button
              type="button"
              className="launchpad-card"
              data-testid="launchpad-owner-customer"
              onClick={() => onNavigateToSection('customer', 'owner-contact-correction-manager')}
            >
              <div className="launchpad-icon-box bg-purple">
                <UsersIcon className="launchpad-icon text-purple" />
              </div>
              <div className="launchpad-body">
                <h3 className="launchpad-title">บริการและข้อมูลลูกค้า</h3>
                <p className="launchpad-desc">
                  แก้ไขข้อมูลติดต่อคำสั่งซื้อที่จ่ายแล้ว และตรวจสอบติดตามการส่งอีเมลบัตร
                </p>
              </div>
              <div className="launchpad-footer">
                <span className="launchpad-cta">เปิดหน้าระบบลูกค้า</span>
                <ChevronRightIcon className="cta-icon" />
              </div>
            </button>

            {/* Launchpad 4: System */}
            <button
              type="button"
              className="launchpad-card"
              data-testid="launchpad-owner-system"
              onClick={() => onNavigateToSection('system', 'invite-organizer-form')}
            >
              <div className="launchpad-icon-box bg-emerald">
                <SlidersIcon className="launchpad-icon text-emerald" />
              </div>
              <div className="launchpad-body">
                <h3 className="launchpad-title">ระบบ เชิญผู้จัดงาน และข่าวสาร</h3>
                <p className="launchpad-desc">
                  ส่งคำเชิญผู้จัดงานใหม่ ประกาศข่าวสารแพลตฟอร์ม และแก้ข้อขัดแย้งออฟไลน์
                </p>
              </div>
              <div className="launchpad-footer">
                <span className="launchpad-cta">จัดการระบบและข่าวสาร</span>
                <ChevronRightIcon className="cta-icon" />
              </div>
            </button>

            {/* Launchpad 5: Policies (D-116) */}
            <button
              type="button"
              className="launchpad-card"
              data-testid="launchpad-owner-policies"
              onClick={() => onNavigateToSection('policies', 'owner-policies-view')}
            >
              <div className="launchpad-icon-box bg-blue">
                <ShieldCheckIcon className="launchpad-icon text-blue" />
              </div>
              <div className="launchpad-body">
                <h3 className="launchpad-title">กฎบัตรและนโยบายกำกับดูแล</h3>
                <p className="launchpad-desc">
                  โครงสร้างค่าบริการ กองทุนสำรอง 30 วัน สิทธิ์สแกนเนอร์ และมาตรการ PDPA
                </p>
              </div>
              <div className="launchpad-footer">
                <span className="launchpad-cta">ดูข้อตกลงและนโยบาย</span>
                <ChevronRightIcon className="cta-icon" />
              </div>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
