'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  BanknotesIcon,
  CheckCircleIcon,
  UsersIcon,
  PlusIcon,
  RefreshIcon,
  MapPinIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  AlertTriangleIcon,
} from './icons';
import { TicketIcon } from './ticket-icon';
import { Button, Badge } from '@/components/ui';
import { formatBaht } from '@/lib/locale';
import type { OrganizerSectionId } from './organizer-workspace-view';

export interface OrganizerOverviewViewProps {
  onNavigateSection?: (section: OrganizerSectionId) => void;
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
  googleMapsUrl?: string;
}

interface EventProgressStats {
  soldTickets: number;
  grossSales: number;
}

export function OrganizerOverviewView({
  onNavigateSection,
  onOpenCreateConcert,
}: OrganizerOverviewViewProps) {
  const [events, setEvents] = useState<OrganizerEventItem[]>([]);
  const [eventStats, setEventStats] = useState<Record<string, EventProgressStats>>({});
  const [scannersCount, setScannersCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      // 1. Fetch events
      const res = await fetch('/api/scanner/events', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ไม่สามารถโหลดข้อมูลภาพรวมได้');
        return;
      }
      const loadedEvents: OrganizerEventItem[] = data.events || [];
      setEvents(loadedEvents);

      // 2. Fetch reports for each event in parallel
      const statsMap: Record<string, EventProgressStats> = {};
      let totalScanners = 0;

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
                statsMap[ev.id] = {
                  soldTickets: validTickets,
                  grossSales: gross,
                };
              }
            }
          } catch {
            // Silently skip failed reports
          }

          try {
            const scRes = await fetch(`/api/organizer/events/${ev.id}/scanners`, {
              cache: 'no-store',
            });
            if (scRes.ok) {
              const scData = await scRes.json();
              if (Array.isArray(scData.scanners)) {
                totalScanners += scData.scanners.length;
              }
            }
          } catch {
            // Silently skip failed scanner lookups
          }
        }),
      );

      setEventStats(statsMap);
      setScannersCount(totalScanners);
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
  const pendingEvents = events.filter((e) => e.status === 'pending_approval');
  const pendingEventsCount = pendingEvents.length;

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

  const soldPercentage =
    totalQuota > 0 ? Math.min(100, Math.round((totalSoldTickets / totalQuota) * 100)) : 0;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return 'กำลังเปิดขาย';
      case 'pending_approval':
        return 'รอการอนุมัติ';
      case 'draft':
        return 'ฉบับร่าง';
      case 'cancelled':
        return 'ยกเลิกแล้ว';
      default:
        return status;
    }
  };

  return (
    <div className="overview-workspace-container" data-testid="organizer-overview-view">
      {/* Header Toolbar (D-122: Clean Baseline) */}
      <header className="overview-header-toolbar">
        <div className="overview-header-titles">
          <h1 className="overview-header-title">ภาพรวมระบบผู้จัดงาน</h1>
          <p className="overview-header-subtitle">
            ติดตามสถานะงานคอนเสิร์ต ยอดจำหน่ายบัตร และความพร้อมของทีมงานแบบเรียลไทม์
          </p>
        </div>
      </header>

      {error && (
        <div className="overview-error-banner" role="alert">
          <AlertTriangleIcon className="banner-icon" />
          <span>{error}</span>
        </div>
      )}

      {/* Quick Actions Bar (D-122: Action Toolbar) */}
      <div className="overview-quick-actions-bar">
        <div className="overview-header-actions">
          <Button
            variant="primary"
            size="md"
            className="overview-create-btn"
            data-testid="overview-create-event-btn"
            icon={<PlusIcon className="btn-icon" />}
            onClick={() => {
              if (onOpenCreateConcert) {
                onOpenCreateConcert();
              } else if (onNavigateSection) {
                onNavigateSection('events');
              }
            }}
          >
            สร้างคอนเสิร์ตใหม่
          </Button>

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

      {/* Top 4 Summary KPI Strip */}
      <section className="overview-kpi-grid" aria-label="สรุปตัวชี้วัดสำคัญภาพรวม">
        {/* KPI 1: Active Concerts */}
        <button
          type="button"
          className="overview-kpi-card is-interactive"
          data-testid="overview-kpi-events"
          onClick={() => onNavigateSection?.('events')}
          aria-label="ดูรายการคอนเสิร์ตทั้งหมด"
        >
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">คอนเสิร์ตที่กำลังเปิดขาย</span>
            <div className="overview-kpi-icon-wrap bg-blue">
              <TicketIcon className="overview-kpi-icon text-blue" />
            </div>
          </div>
          <div className="overview-kpi-value">
            {activeEventsCount}{' '}
            <span className="overview-kpi-unit">งาน</span>
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-kpi-subtext">
              จากทั้งหมด {totalEventsCount} งานในระบบ
            </span>
            <span className="overview-kpi-link">
              ดูคอนเสิร์ต <ChevronRightIcon className="link-icon" />
            </span>
          </div>
        </button>

        {/* KPI 2: Total Tickets Sold */}
        <div className="overview-kpi-card" data-testid="overview-kpi-tickets">
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">บัตรที่จำหน่ายแล้วทั้งหมด</span>
            <div className="overview-kpi-icon-wrap bg-green">
              <CheckCircleIcon className="overview-kpi-icon text-green" />
            </div>
          </div>
          <div className="overview-kpi-value">
            {totalSoldTickets.toLocaleString()}{' '}
            <span className="overview-kpi-unit">ใบ</span>
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-kpi-subtext">
              ความคืบหน้า {soldPercentage}% จากโควตา {totalQuota.toLocaleString()} ใบ
            </span>
          </div>
        </div>

        {/* KPI 3: Gross Revenue */}
        <button
          type="button"
          className="overview-kpi-card is-interactive"
          data-testid="overview-kpi-revenue"
          onClick={() => onNavigateSection?.('finance')}
          aria-label="ดูรายงานการเงินและรอบโอนเงิน"
        >
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">ยอดจำหน่ายบัตรรวม</span>
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
              รายงานการเงิน <ChevronRightIcon className="link-icon" />
            </span>
          </div>
        </button>

        {/* KPI 4: Active Scanners */}
        <button
          type="button"
          className="overview-kpi-card is-interactive"
          data-testid="overview-kpi-scanners"
          onClick={() => onNavigateSection?.('scanners')}
          aria-label="จัดการทีมงานสแกนบัตร"
        >
          <div className="overview-kpi-header">
            <span className="overview-kpi-title">ทีมงานสแกนเนอร์</span>
            <div className="overview-kpi-icon-wrap bg-purple">
              <UsersIcon className="overview-kpi-icon text-purple" />
            </div>
          </div>
          <div className="overview-kpi-value">
            {scannersCount}{' '}
            <span className="overview-kpi-unit">บัญชี</span>
          </div>
          <div className="overview-kpi-footer">
            <span className="overview-kpi-subtext">พร้อมควบคุมประตูเข้างาน</span>
            <span className="overview-kpi-link">
              จัดการทีม <ChevronRightIcon className="link-icon" />
            </span>
          </div>
        </button>
      </section>

      {/* Attention / System Status Banner */}
      <section className="overview-status-section" aria-label="สถานะระบบและงานที่ต้องติดตาม">
        {pendingEventsCount > 0 ? (
          <div className="overview-attention-banner warning" data-testid="overview-attention-warning">
            <div className="banner-left">
              <div className="banner-icon-box bg-amber">
                <ClockIcon className="banner-icon text-amber" />
              </div>
              <div className="banner-content">
                <h2 className="banner-title">
                  มี {pendingEventsCount} คอนเสิร์ตที่อยู่ระหว่างรอการอนุมัติจากเจ้าของระบบ (Pending Approval)
                </h2>
                <p className="banner-desc">
                  เจ้าของระบบกำลังตรวจสอบความถูกต้องของรอบการแสดงและประเภทบัตร เมื่อได้รับอนุมัติแล้วจะเปิดจำหน่ายทันที
                </p>
              </div>
            </div>
            <button
              type="button"
              className="banner-action-btn"
              onClick={() => onNavigateSection?.('events')}
            >
              <span>ตรวจสอบสถานะคอนเสิร์ต</span>
              <ChevronRightIcon className="btn-icon-right" />
            </button>
          </div>
        ) : (
          <div className="overview-attention-banner success" data-testid="overview-attention-success">
            <div className="banner-left">
              <div className="banner-icon-box bg-emerald">
                <ShieldCheckIcon className="banner-icon text-emerald" />
              </div>
              <div className="banner-content">
                <h2 className="banner-title">ระบบทำงานปกติ ไม่มีรายการค้างที่ต้องดำเนินการ</h2>
                <p className="banner-desc">
                  คอนเสิร์ต รอบการแสดง และราคาบัตรทั้งหมดได้รับการอนุมัติเรียบร้อย พร้อมให้บริการลูกค้าอย่างต่อเนื่อง
                </p>
              </div>
            </div>
            <button
              type="button"
              className="banner-action-btn secondary"
              onClick={() => onNavigateSection?.('events')}
            >
              <span>จัดการคอนเสิร์ต</span>
              <ChevronRightIcon className="btn-icon-right" />
            </button>
          </div>
        )}
      </section>

      {/* Active Concerts Snapshot & Performance Progress */}
      <section className="overview-active-events-section" aria-label="คอนเสิร์ตปัจจุบันและความคืบหน้าการขาย">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">คอนเสิร์ตปัจจุบันและความคืบหน้าการขาย</h2>
            <p className="section-subtitle">ติดตามอัตราการจำหน่ายบัตรและสถานะงานแบบเรียลไทม์</p>
          </div>
          {events.length > 0 && (
            <button
              type="button"
              className="section-link-btn"
              onClick={() => onNavigateSection?.('events')}
            >
              <span>ดูคอนเสิร์ตทั้งหมด ({events.length})</span>
              <ChevronRightIcon className="link-icon" />
            </button>
          )}
        </div>

        {events.length === 0 ? (
          <div className="overview-empty-card" data-testid="overview-events-empty">
            <TicketIcon className="empty-icon" />
            <h3 className="empty-title">ยังไม่มีรายการคอนเสิร์ตในระบบ</h3>
            <p className="empty-desc">
              เริ่มต้นสร้างงานคอนเสิร์ตแรกของคุณ กำหนดรอบการแสดง และโซนบัตรเพื่อส่งขออนุมัติเปิดจำหน่าย
            </p>
            <button
              type="button"
              className="overview-create-btn"
              onClick={() => {
                if (onOpenCreateConcert) {
                  onOpenCreateConcert();
                } else if (onNavigateSection) {
                  onNavigateSection('events');
                }
              }}
            >
              <PlusIcon className="btn-icon" />
              <span>สร้างคอนเสิร์ตแรกของคุณ</span>
            </button>
          </div>
        ) : (
          <div className="overview-events-list" data-testid="overview-events-list">
            {events.map((ev) => {
              const stats = eventStats[ev.id] || { soldTickets: 0, grossSales: 0 };
              const quota = ev.totalQuota || 0;
              const sold = stats.soldTickets;
              const pct = quota > 0 ? Math.min(100, Math.round((sold / quota) * 100)) : 0;

              return (
                <div key={ev.id} className="overview-event-card" data-testid={`overview-event-card-${ev.id}`}>
                  <div className="overview-event-main">
                    <div className="overview-event-header-line">
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
                        className={`status-badge status-${ev.status}`}
                      >
                        {getStatusLabel(ev.status)}
                      </Badge>
                      <h3 className="overview-event-title">{ev.title}</h3>
                    </div>

                    <div className="overview-event-meta">
                      <span className="overview-event-meta-item">
                        <MapPinIcon className="meta-icon" />
                        <span>{ev.location || 'ไม่ระบุสถานที่'}</span>
                      </span>
                      <span className="overview-event-meta-divider">•</span>
                      <span className="overview-event-meta-item">
                        <span>{ev.sessionCount || 1} รอบการแสดง</span>
                      </span>
                      {typeof ev.minPrice === 'number' && (
                        <>
                          <span className="overview-event-meta-divider">•</span>
                          <span className="overview-event-meta-item">
                            <span>ราคาเริ่มต้น {formatBaht(ev.minPrice)}</span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="overview-event-progress-wrap">
                      <div className="progress-info-row">
                        <span className="progress-label">
                          จำหน่ายแล้ว {sold.toLocaleString()} / {quota.toLocaleString()} ใบ
                        </span>
                        <span className="progress-pct">{pct}%</span>
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

                  <div className="overview-event-actions">
                    <Link
                      href={`/events/${ev.id}`}
                      className="overview-action-btn secondary"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>หน้าร้านลูกค้า</span>
                    </Link>

                    <button
                      type="button"
                      className="overview-action-btn secondary"
                      onClick={() => onNavigateSection?.('finance')}
                    >
                      <span>รายงานการเงิน</span>
                    </button>

                    <button
                      type="button"
                      className="overview-action-btn primary"
                      onClick={() => onNavigateSection?.('events')}
                    >
                      <span>จัดการงาน</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick Launchpad Grid */}
      <section className="overview-launchpad-section" aria-label="ทางลัดการทำงานด่วน">
        <h2 className="section-title">ทางลัดการทำงานด่วน</h2>
        <p className="section-subtitle">เข้าถึงเครื่องมือและระบบงานสำคัญได้ทันทีในคลิกเดียว</p>

        <div className="overview-launchpad-grid">
          {/* Launchpad 1: Finance */}
          <button
            type="button"
            className="launchpad-card"
            data-testid="launchpad-finance"
            onClick={() => onNavigateSection?.('finance')}
          >
            <div className="launchpad-icon-box bg-indigo">
              <BanknotesIcon className="launchpad-icon text-indigo" />
            </div>
            <div className="launchpad-body">
              <h3 className="launchpad-title">รายงานการเงินและรอบโอนเงิน</h3>
              <p className="launchpad-desc">
                ตรวจสอบยอดขายสุทธิ การกันเงินสำรอง 10% และดูประวัติสลิปการโอนเงินรายสัปดาห์
              </p>
            </div>
            <div className="launchpad-footer">
              <span className="launchpad-cta">เปิดหน้ารายงานการเงิน</span>
              <ChevronRightIcon className="cta-icon" />
            </div>
          </button>

          {/* Launchpad 2: Scanners */}
          <button
            type="button"
            className="launchpad-card"
            data-testid="launchpad-scanners"
            onClick={() => onNavigateSection?.('scanners')}
          >
            <div className="launchpad-icon-box bg-purple">
              <UsersIcon className="launchpad-icon text-purple" />
            </div>
            <div className="launchpad-body">
              <h3 className="launchpad-title">จัดการทีมงานสแกนบัตร</h3>
              <p className="launchpad-desc">
                เพิ่มบัญชีทีมงาน กำหนดเครื่องหลักคุมประตู และตรวจสอบประวัติการสแกนเข้าชมงาน
              </p>
            </div>
            <div className="launchpad-footer">
              <span className="launchpad-cta">จัดการทีมงาน</span>
              <ChevronRightIcon className="cta-icon" />
            </div>
          </button>

          {/* Launchpad 3: Policies */}
          <button
            type="button"
            className="launchpad-card"
            data-testid="launchpad-policies"
            onClick={() => onNavigateSection?.('policies')}
          >
            <div className="launchpad-icon-box bg-emerald">
              <ShieldCheckIcon className="launchpad-icon text-emerald" />
            </div>
            <div className="launchpad-body">
              <h3 className="launchpad-title">ข้อตกลงและเงื่อนไขการบริการ</h3>
              <p className="launchpad-desc">
                ตรวจสอบข้อกำหนดค่าธรรมเนียมนโยบายการคืนเงินและมาตรฐานความปลอดภัยข้อมูลผู้ซื้อ
              </p>
            </div>
            <div className="launchpad-footer">
              <span className="launchpad-cta">อ่านข้อตกลงและเงื่อนไข</span>
              <ChevronRightIcon className="cta-icon" />
            </div>
          </button>

          {/* Launchpad 4: Contact Owner */}
          <button
            type="button"
            className="launchpad-card"
            data-testid="launchpad-contact"
            onClick={() => onNavigateSection?.('contact')}
          >
            <div className="launchpad-icon-box bg-blue">
              <ChatBubbleLeftRightIcon className="launchpad-icon text-blue" />
            </div>
            <div className="launchpad-body">
              <h3 className="launchpad-title">ติดต่อเจ้าของระบบ</h3>
              <p className="launchpad-desc">
                ส่งข้อความสอบถามปัญหา แจ้งข้อขัดข้อง หรือประสานงานโดยตรงกับทีมบริหารแพลตฟอร์ม
              </p>
            </div>
            <div className="launchpad-footer">
              <span className="launchpad-cta">ส่งข้อความติดต่อ</span>
              <ChevronRightIcon className="cta-icon" />
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
