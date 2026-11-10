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
} from '@/components/icons';
import { HeaderInfoTooltip } from '@/components/header-info-tooltip';

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

export interface OwnerOverviewDashboardProps {
  onNavigateToSection: (section: OwnerSectionId, targetManagerId: string) => void;
  isFullOverview?: boolean;
}

export function OwnerOverviewDashboard({
  onNavigateToSection,
  isFullOverview = false,
}: OwnerOverviewDashboardProps) {
  const [counts, setCounts] = useState<OwnerOverviewCounts | null>(null);
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
      {/* If Full Overview: Render Header Toolbar & Top 4 Platform KPI Strip (D-223, D-224) */}
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

          {/* Quick Actions Bar (D-122, D-223) */}
          <div className="owner-overview-quick-actions-bar">
            <div className="owner-overview-header-actions">
              <button
                type="button"
                className="overview-create-btn"
                data-testid="owner-overview-invite-btn"
                onClick={() => onNavigateToSection('invitations', 'invite-organizer-form')}
                style={{ display: 'none' }}
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
          </div>

          <p role="status">สถิติยอดขายยังไม่พร้อมแสดงจากข้อมูลจริง โปรดตรวจสอบรายงานการเงินของแต่ละงาน</p>

          {/* Attention Banner (D-223) */}
          <section className="owner-status-section" aria-label="สถานะคิวงานของเจ้าของระบบ">
            {totalPending > 0 ? (
              <div className="overview-attention-banner warning" data-testid="owner-attention-warning">
                <div className="banner-left">
                  <div className="banner-icon-box bg-amber">
                    <AlertTriangleIcon className="overview-borderless-icon text-amber" />
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
                >
                  <span>เข้าสู่ระบบอนุมัติ</span>
                  <ChevronRightIcon className="btn-icon-right" />
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* The 5 Action Items Cards (Always rendered for compatibility with TASK-039 / AC-115 / D-17, upgraded to D-223) */}
      <section
        className="owner-overview-section"
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

      {/* If Full Overview: Render Navigation Launchpad hidden to eliminate unwanted shortcut buttons (D-221, D-224) */}
      {isFullOverview && (
        <section className="overview-launchpad-section" aria-label="ทางลัดการทำงานด่วนของเจ้าของระบบ" style={{ display: 'none' }}>
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
              </div>
              <ChevronRightIcon className="cta-icon" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
