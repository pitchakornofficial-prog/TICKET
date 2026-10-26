'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  UsersIcon,
  BanknotesIcon,
  SparklesIcon,
  MenuIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LockIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';
import { OrganizerEventsManager } from '@/components/organizer-events-manager';
import { OrganizerScannerManager } from '@/components/organizer-scanner-manager';
import {
  GrossSalesTrendChart,
  TicketDistributionChart,
  AdmissionRateGauge,
  ConcertCapacityFillChart,
  ScannerAdmissionVelocityChart,
  FinancialBreakdownChart,
  ConcertPerformanceComparisonChart,
  TicketStatusDistributionChart,
} from '@/components/organizer-analytics-charts';

export type OrganizerSectionId = 'overview' | 'events' | 'scanners' | 'finance';

interface SectionConfig {
  id: OrganizerSectionId;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof SparklesIcon;
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'overview',
    label: 'ภาพรวมระบบ',
    shortLabel: 'ภาพรวม',
    description: 'แดชบอร์ดสรุปสถิติคอนเสิร์ตและสถานะการดำเนินงาน',
    icon: SparklesIcon,
  },
  {
    id: 'events',
    label: 'จัดการงานคอนเสิร์ต',
    shortLabel: 'คอนเสิร์ต',
    description: 'สร้างคอนเสิร์ต (Draft), จัดการรอบการแสดง, และยื่นขอแก้ไข/ยกเลิก',
    icon: TicketIcon,
  },
  {
    id: 'scanners',
    label: 'จัดการทีมสแกนบัตร',
    shortLabel: 'ทีมสแกน',
    description: 'มอบหมายสิทธิ์ทีมสแกนเฉพาะงาน และควบคุมเครื่องหลัก (Primary)',
    icon: UsersIcon,
  },
  {
    id: 'finance',
    label: 'รายงานการเงินและยอดขาย',
    shortLabel: 'การเงิน',
    description: 'ยอดขายรวม, ค่าบริการระบบ 5%, ยอดเงินสำรอง 10% และยอดพร้อมจ่าย',
    icon: BanknotesIcon,
  },
];

const HASH_TO_SECTION: Record<string, OrganizerSectionId> = {
  overview: 'overview',
  all: 'overview',
  events: 'events',
  concerts: 'events',
  'organizer-events': 'events',
  scanners: 'scanners',
  scanner: 'scanners',
  'organizer-scanner': 'scanners',
  finance: 'finance',
  money: 'finance',
  'organizer-money': 'finance',
};

interface EventSummary {
  id: string;
  title: string;
  status: string;
  location: string;
}

interface LiveAnalyticsData {
  kpi: {
    totalEvents: number;
    approvedEvents: number;
    draftEvents: number;
    grossSales: number;
    totalTicketsSold: number;
    totalAdmitted: number;
    totalRefunded: number;
    totalQuota: number;
  };
  salesTrend: { period: string; sales: number; tickets: number }[];
  tierBreakdown: { tierName: string; sold: number; quota: number; price: number; color: string }[];
  admissionStats: { total: number; admitted: number; pending: number };
  ticketStatusDistribution: { paid: number; admitted: number; refunded: number };
  concertComparison: {
    id: string;
    title: string;
    status: string;
    grossSales: number;
    sold: number;
    quota: number;
  }[];
}

interface OrganizerWorkspaceViewProps {
  initialSection?: string;
}

export function OrganizerWorkspaceView({ initialSection }: OrganizerWorkspaceViewProps) {
  const [activeSection, setActiveSection] = useState<OrganizerSectionId>(() => {
    if (initialSection && initialSection in HASH_TO_SECTION) {
      return HASH_TO_SECTION[initialSection];
    }
    return 'overview';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [analytics, setAnalytics] = useState<LiveAnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      // stats failure is non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async (eventId: string) => {
    setLoadingAnalytics(true);
    try {
      const url =
        eventId !== 'all'
          ? `/api/organizer/analytics?eventId=${encodeURIComponent(eventId)}`
          : '/api/organizer/analytics';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {
      // analytics error is non-blocking
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadAnalytics(selectedEventId);
    function onEventsChanged() {
      loadStats();
      loadAnalytics(selectedEventId);
    }
    window.addEventListener('events-updated', onEventsChanged);
    window.addEventListener('organizer-events-updated', onEventsChanged);
    return () => {
      window.removeEventListener('events-updated', onEventsChanged);
      window.removeEventListener('organizer-events-updated', onEventsChanged);
    };
  }, [loadStats, loadAnalytics, selectedEventId]);

  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && hash in HASH_TO_SECTION) {
        setActiveSection(HASH_TO_SECTION[hash]);
      }
    }
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const totalEvents = events.length;
  const approvedEvents = events.filter(e => e.status === 'approved').length;
  const draftEvents = events.filter(e => e.status === 'draft').length;

  const currentSection = useMemo(() => {
    return SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];
  }, [activeSection]);

  const handleSelectSection = (id: OrganizerSectionId) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`);
    }
  };

  return (
    <div className="organizer-workspace-container" data-testid="organizer-workspace-view">
      {/* Mobile navigation toggle */}
      <div className="organizer-mobile-nav-bar">
        <button
          type="button"
          className="organizer-mobile-menu-btn"
          onClick={() => setMobileMenuOpen(prev => !prev)}
          data-testid="organizer-mobile-menu-toggle"
          aria-expanded={mobileMenuOpen}
          aria-label="สลับหมวดหมู่เมนูผู้จัดงาน"
        >
          <div className="btn-content">
            <MenuIcon className="icon-sm" />
            <span>เมนู: {currentSection.label}</span>
          </div>
          <ChevronDownIcon className="icon-sm" />
        </button>
      </div>

      <div className="organizer-workspace-grid">
        {/* Enterprise Sidebar navigation */}
        <aside
          className={`organizer-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}
          aria-label="เมนูนำทางผู้จัดงาน"
        >
          {/* Organizer Profile Card in Sidebar */}
          <div className="organizer-sidebar-profile">
            <div className="profile-icon-wrap">
              <TicketIcon />
            </div>
            <div className="profile-info">
              <span className="profile-role-badge">ผู้จัดงานคอนเสิร์ต</span>
              <span className="profile-portal-title">Organizer Portal</span>
            </div>
          </div>

          <div className="organizer-sidebar-divider" />

          {/* Nav List */}
          <nav className="organizer-nav-list" aria-label="หมวดหมู่งานผู้จัดงาน">
            {SECTIONS.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`organizer-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectSection(section.id)}
                  data-testid={`organizer-nav-${section.id}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="organizer-nav-icon" />
                  <div className="organizer-nav-text">
                    <div className="organizer-nav-title-row">
                      <span className="organizer-nav-label">{section.label}</span>
                      {section.id === 'events' && totalEvents > 0 && (
                        <span className="organizer-nav-badge">{totalEvents}</span>
                      )}
                    </div>
                    <span className="organizer-nav-desc">{section.description}</span>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="organizer-sidebar-footer">
            <div className="sidebar-security-badge">
              <LockIcon />
              <span>การเชื่อมต่อปลอดภัย 256-bit</span>
            </div>
          </div>
        </aside>

        {/* Main Dedicated Content Canvas */}
        <main className="organizer-main-content">
          {/* Contextual Action Header */}
          <header className="organizer-contextual-header">
            <div className="contextual-header-left">
              <div className="contextual-breadcrumb">
                <span>พื้นที่ผู้จัดงาน</span>
                <span className="breadcrumb-separator">/</span>
                <span className="breadcrumb-active">{currentSection.label}</span>
              </div>
              <h1 className="contextual-title">{currentSection.label}</h1>
              <p className="contextual-desc">{currentSection.description}</p>
            </div>
            {activeSection !== 'events' && (
              <div className="contextual-header-right">
                <button
                  type="button"
                  className="quick-switch-btn"
                  onClick={() => handleSelectSection('events')}
                >
                  <TicketIcon />
                  <span>ไปที่งานคอนเสิร์ต</span>
                </button>
              </div>
            )}
          </header>

          {/* Section 1: Overview */}
          {activeSection === 'overview' && (
            <div className="organizer-section-body">
              {/* Event Selector Filter Bar (D-66) */}
              <section className="overview-filter-bar" aria-label="แถบตัวกรองเลือกงานคอนเสิร์ต">
                <div className="filter-group">
                  <label htmlFor="overview-event-filter" className="filter-label">
                    เลือกดูข้อมูลคอนเสิร์ต:
                  </label>
                  <select
                    id="overview-event-filter"
                    className="filter-select"
                    value={selectedEventId}
                    onChange={e => setSelectedEventId(e.target.value)}
                    aria-label="เลือกงานคอนเสิร์ตเพื่อดูสถิติภาพรวม"
                  >
                    <option value="all">คอนเสิร์ตทั้งหมด ({events.length} งาน)</option>
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.status === 'approved' ? 'อนุมัติแล้ว' : 'ฉบับร่าง'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-actions">
                  <button
                    type="button"
                    className="filter-refresh-btn"
                    onClick={() => loadAnalytics(selectedEventId)}
                    disabled={loadingAnalytics}
                    title="รีเฟรชข้อมูลสถิติล่าสุด"
                  >
                    <SparklesIcon />
                    <span>{loadingAnalytics ? 'กำลังโหลด…' : 'อัปเดตข้อมูลจริง'}</span>
                  </button>
                </div>
              </section>

              {/* Quick KPI Stats Grid */}
              <section className="organizer-stats-grid" aria-label="สถิติภาพรวมของผู้จัดงาน">
                <div className="organizer-stat-card">
                  <div className="stat-card-icon-wrap primary">
                    <CalendarIcon />
                  </div>
                  <div className="stat-card-content">
                    <span className="stat-card-label">งานคอนเสิร์ตทั้งหมด</span>
                    <div className="stat-card-value">
                      {loading || loadingAnalytics ? '…' : (analytics?.kpi.totalEvents ?? totalEvents)}
                      <span className="stat-card-unit">งาน</span>
                    </div>
                  </div>
                </div>

                <div className="organizer-stat-card">
                  <div className="stat-card-icon-wrap success">
                    <CheckCircleIcon />
                  </div>
                  <div className="stat-card-content">
                    <span className="stat-card-label">อนุมัติแล้ว / พร้อมขาย</span>
                    <div className="stat-card-value">
                      {loading || loadingAnalytics ? '…' : (analytics?.kpi.approvedEvents ?? approvedEvents)}
                      <span className="stat-card-unit">งาน</span>
                    </div>
                  </div>
                </div>

                <div className="organizer-stat-card">
                  <div className="stat-card-icon-wrap warning">
                    <ClockIcon />
                  </div>
                  <div className="stat-card-content">
                    <span className="stat-card-label">ฉบับร่าง (Drafts)</span>
                    <div className="stat-card-value">
                      {loading || loadingAnalytics ? '…' : (analytics?.kpi.draftEvents ?? draftEvents)}
                      <span className="stat-card-unit">งาน</span>
                    </div>
                  </div>
                </div>

                <div className="organizer-stat-card">
                  <div className="stat-card-icon-wrap info">
                    <BanknotesIcon />
                  </div>
                  <div className="stat-card-content">
                    <span className="stat-card-label">ยอดขายรวมจริง (Gross Sales)</span>
                    <div className="stat-card-value text-accent">
                      {loadingAnalytics
                        ? '…'
                        : `${(analytics?.kpi.grossSales ?? 0).toLocaleString('th-TH')} THB`}
                    </div>
                  </div>
                </div>
              </section>

              {/* Overview Analytics Dashboard (D-64, D-66) */}
              <section className="overview-analytics-section" aria-label="แดชบอร์ดกราฟข้อมูลภาพรวม">
                <div className="analytics-section-heading">
                  <div className="heading-tag">
                    <SparklesIcon />
                    <span>แดชบอร์ดวิเคราะห์สถิติภาพรวมจริง (Live Analytics)</span>
                  </div>
                  <h2 className="heading-title">ภาพรวมยอดขายและการเข้างาน (Performance Analytics)</h2>
                  <p className="heading-subtitle">
                    {selectedEventId === 'all'
                      ? 'สถิติภาพรวมทุกคอนเสิร์ตของคุณ — ติดตามยอดขายจริง สัดส่วนประเภทบัตร และอัตราการเข้างาน'
                      : `สถิติเจาะลึกเฉพาะ: ${events.find(e => e.id === selectedEventId)?.title || selectedEventId}`}
                  </p>
                </div>

                <div className="analytics-charts-grid">
                  <GrossSalesTrendChart data={analytics?.salesTrend} />
                  <TicketDistributionChart data={analytics?.tierBreakdown} />
                  <AdmissionRateGauge
                    totalTickets={analytics?.admissionStats.total}
                    admitted={analytics?.admissionStats.admitted}
                    approvedEvents={analytics?.kpi.approvedEvents ?? approvedEvents}
                    draftEvents={analytics?.kpi.draftEvents ?? draftEvents}
                  />
                  <ConcertPerformanceComparisonChart concerts={analytics?.concertComparison} />
                  <TicketStatusDistributionChart stats={analytics?.ticketStatusDistribution} />
                </div>
              </section>

              {/* Navigation Quick Jump Cards */}
              <section className="organizer-hub-grid" aria-label="เมนูหลักสำหรับจัดการงาน">
                <button
                  type="button"
                  className="organizer-hub-card"
                  onClick={() => handleSelectSection('events')}
                >
                  <div className="hub-card-icon-wrap primary">
                    <TicketIcon />
                  </div>
                  <div className="hub-card-content">
                    <span className="hub-card-title">จัดการงานคอนเสิร์ต</span>
                    <span className="hub-card-desc">สร้างคอนเสิร์ตร่างใหม่ จัดการรอบการแสดง และยื่นขอแก้ไขรอบ</span>
                  </div>
                  <div className="hub-card-arrow">
                    <ChevronRightIcon />
                  </div>
                </button>

                <button
                  type="button"
                  className="organizer-hub-card"
                  onClick={() => handleSelectSection('scanners')}
                >
                  <div className="hub-card-icon-wrap info">
                    <UsersIcon />
                  </div>
                  <div className="hub-card-content">
                    <span className="hub-card-title">จัดการทีมสแกนบัตร</span>
                    <span className="hub-card-desc">มอบหมายทีมสแกนเฉพาะงาน และจัดการเครื่องสแกนหลัก</span>
                  </div>
                  <div className="hub-card-arrow">
                    <ChevronRightIcon />
                  </div>
                </button>

                <button
                  type="button"
                  className="organizer-hub-card"
                  onClick={() => handleSelectSection('finance')}
                >
                  <div className="hub-card-icon-wrap success">
                    <BanknotesIcon />
                  </div>
                  <div className="hub-card-content">
                    <span className="hub-card-title">รายงานการเงินและยอดขาย</span>
                    <span className="hub-card-desc">ตรวจยอดขายรวม ยอดหักค่าบริการ 5% และยอดพร้อมจ่าย</span>
                  </div>
                  <div className="hub-card-arrow">
                    <ChevronRightIcon />
                  </div>
                </button>
              </section>
            </div>
          )}

          {/* Section 2: Dedicated Concerts Manager */}
          {activeSection === 'events' && (
            <div className="organizer-section-body">
              {/* Contextual Sub-chart (D-64) */}
              <ConcertCapacityFillChart />
              <OrganizerEventsManager />
            </div>
          )}

          {/* Section 3: Dedicated Scanner Manager */}
          {activeSection === 'scanners' && (
            <div className="organizer-section-body">
              {/* Contextual Sub-chart (D-64) */}
              <ScannerAdmissionVelocityChart />
              <OrganizerScannerManager />
            </div>
          )}

          {/* Section 4: Dedicated Financial Report Hub */}
          {activeSection === 'finance' && (
            <div className="organizer-section-body organizer-finance-panel">
              {/* Contextual Sub-chart (D-64) */}
              <FinancialBreakdownChart />

              <div className="finance-panel-header">
                <div className="finance-panel-title-wrap">
                  <h2>ศูนย์รายงานการเงินและยอดขาย (Financial Hub)</h2>
                  <p className="card-caption">
                    ตรวจสอบยอดขายรวม (Gross Sales), ยอดสุทธิ, ค่าบริการระบบ 5%, ยอดเงินสำรอง 10% และยอดพร้อมจ่าย (Payable Amount) แยกรายคอนเสิร์ต
                  </p>
                </div>
              </div>

              {loading ? (
                <p className="loading-text">กำลังโหลดรายการงานคอนเสิร์ต...</p>
              ) : events.length === 0 ? (
                <div className="empty-sub-card">
                  <TicketIcon />
                  <p>ยังไม่มีงานคอนเสิร์ตสำหรับตรวจสอบรายงานการเงิน</p>
                </div>
              ) : (
                <div className="finance-events-grid">
                  {events.map(ev => (
                    <div key={ev.id} className="finance-event-card">
                      <div className="finance-event-info">
                        <h3>{ev.title}</h3>
                        <p className="finance-event-location">สถานที่: {ev.location}</p>
                        <span className={`status-pill ${ev.status === 'approved' ? 'status-approved' : 'status-draft'}`}>
                          {ev.status === 'approved' ? 'อนุมัติแล้ว' : 'ฉบับร่าง'}
                        </span>
                      </div>
                      <div className="finance-event-action">
                        <button
                          type="button"
                          className="primary-button small"
                          onClick={() => {
                            setActiveSection('events');
                            setTimeout(() => {
                              const reportBtn = document.querySelector(`[data-testid="open-money-report-btn-${ev.id}"]`) as HTMLButtonElement | null;
                              if (reportBtn) {
                                reportBtn.scrollIntoView({ behavior: 'smooth' });
                                reportBtn.click();
                              }
                            }, 100);
                          }}
                        >
                          <BanknotesIcon />
                          <span>เปิดรายงานการเงิน (AC-28)</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
