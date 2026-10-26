'use client';

import {
  BanknotesIcon,
  UsersIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';

// Sample realistic analytics data for organizer concerts
export interface SalesTrendDataPoint {
  id?: string;
  period: string;
  sales: number;
  tickets: number;
}

export interface TicketTierDataPoint {
  tierName: string;
  sold: number;
  quota: number;
  price: number;
  color: string;
}

export interface GateAdmissionDataPoint {
  gate: string;
  admitted: number;
  total: number;
  speedPerHour: number;
}

const DEFAULT_SALES_TREND: SalesTrendDataPoint[] = [
  { id: 'w1', period: 'สัปดาห์ 1', sales: 185000, tickets: 120 },
  { id: 'w2', period: 'สัปดาห์ 2', sales: 320000, tickets: 210 },
  { id: 'w3', period: 'สัปดาห์ 3', sales: 490000, tickets: 315 },
  { id: 'w4', period: 'สัปดาห์ 4', sales: 740000, tickets: 480 },
  { id: 'w5', period: 'สัปดาห์ 5', sales: 980000, tickets: 620 },
  { id: 'w6', period: 'สัปดาห์ล่าสุด', sales: 1250000, tickets: 810 },
];

const DEFAULT_TIER_DATA: TicketTierDataPoint[] = [
  { tierName: 'VIP Zone A (บัตรยืนติดเวที)', sold: 180, quota: 200, price: 3500, color: '#2563eb' },
  { tierName: 'Regular Zone B (บัตรยืนทั่วไป)', sold: 450, quota: 600, price: 2000, color: '#0d9488' },
  { tierName: 'Early Bird (สิทธิพิเศษเปิดจำหน่าย)', sold: 120, quota: 120, price: 1500, color: '#8b5cf6' },
  { tierName: 'Balcony Zone C (บัตรชั้นลอย)', sold: 60, quota: 100, price: 1200, color: '#f59e0b' },
];

/**
 * 1. Gross Sales Trend Chart (Pure SVG Bar Chart with Hover Tooltip)
 */
export function GrossSalesTrendChart({ data = DEFAULT_SALES_TREND }: { data?: SalesTrendDataPoint[] }) {
  const maxSales = Math.max(...data.map(d => d.sales), 1000000);
  const chartHeight = 180;
  const chartWidth = 440;
  const paddingX = 40;
  const paddingY = 25;
  const availableWidth = chartWidth - paddingX * 2;
  const availableHeight = chartHeight - paddingY * 2;
  const barWidth = Math.min(36, availableWidth / data.length - 12);

  return (
    <div className="analytics-card sales-trend-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title-wrap">
          <div className="card-badge primary">
            <TrendingUpIcon />
            <span>แนวโน้มรายรับ</span>
          </div>
          <h3 className="analytics-card-title">ยอดขายรวม (Gross Sales Trend)</h3>
        </div>
        <div className="trend-summary-stat">
          <span className="trend-sum-label">ยอดขายสะสมรวม</span>
          <span className="trend-sum-value">
            {data.reduce((acc, cur) => acc + cur.sales, 0).toLocaleString('th-TH')} THB
          </span>
        </div>
      </div>

      <div className="svg-chart-container">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="responsive-svg-chart"
          role="img"
          aria-label="กราฟแท่งแสดงแนวโน้มยอดขายรวม"
        >
          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = paddingY + availableHeight * (1 - ratio);
            const val = Math.round((maxSales * ratio) / 1000) * 1000;
            return (
              <g key={ratio} className="chart-grid-line">
                <line x1={paddingX} y1={y} x2={chartWidth - 10} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                <text x={paddingX - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                  {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${Math.round(val / 1000)}k`}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((item, idx) => {
            const stepX = availableWidth / data.length;
            const x = paddingX + idx * stepX + (stepX - barWidth) / 2;
            const barHeight = Math.max(4, (item.sales / maxSales) * availableHeight);
            const y = paddingY + availableHeight - barHeight;

            return (
              <g key={item.id ?? item.period} className="chart-bar-group">
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="4"
                  className="chart-bar-rect"
                  fill="#3b82f6"
                >
                  <title>{`${item.period}: ${item.sales.toLocaleString('th-TH')} THB (${item.tickets} ใบ)`}</title>
                </rect>
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#64748b"
                  fontWeight="600"
                >
                  {item.period}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * 2. Ticket Sales Breakdown Chart (Pure SVG Donut with Legend)
 */
export function TicketDistributionChart({ data = DEFAULT_TIER_DATA }: { data?: TicketTierDataPoint[] }) {
  const totalSold = data.reduce((sum, item) => sum + item.sold, 0);
  const totalQuota = data.reduce((sum, item) => sum + item.quota, 0);
  const soldPercentage = totalQuota > 0 ? Math.round((totalSold / totalQuota) * 100) : 0;

  // Donut geometry calculation
  const size = 180;
  const center = size / 2;
  const radius = 64;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="analytics-card ticket-distribution-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title-wrap">
          <div className="card-badge info">
            <TicketIcon />
            <span>สัดส่วนยอดจำหน่าย</span>
          </div>
          <h3 className="analytics-card-title">สัดส่วนประเภทบัตร (Tier Share)</h3>
        </div>
      </div>

      <div className="donut-and-legend-layout">
        <div className="donut-chart-wrap">
          <svg viewBox={`0 0 ${size} ${size}`} className="donut-svg" role="img" aria-label="กราฟโดนัทสัดส่วนบัตร">
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="#f1f5f9"
              strokeWidth={strokeWidth}
            />
            {data.map((tier) => {
              const portion = totalSold > 0 ? tier.sold / totalSold : 0;
              const strokeDasharray = `${portion * circumference} ${circumference}`;
              const strokeDashoffset = -accumulatedPercent * circumference;
              accumulatedPercent += portion;

              return (
                <circle
                  key={tier.tierName}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={tier.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="donut-segment"
                />
              );
            })}
          </svg>
          <div className="donut-center-label">
            <span className="donut-center-value">{soldPercentage}%</span>
            <span className="donut-center-sub">ขายแล้ว</span>
          </div>
        </div>

        <div className="donut-legend-list">
          {data.map((tier) => {
            const pct = totalSold > 0 ? Math.round((tier.sold / totalSold) * 100) : 0;
            return (
              <div key={tier.tierName} className="donut-legend-item">
                <span className="legend-color-dot" style={{ backgroundColor: tier.color }} />
                <div className="legend-text-group">
                  <span className="legend-tier-name">{tier.tierName}</span>
                  <span className="legend-tier-stats">
                    {tier.sold} / {tier.quota} ใบ ({pct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * 3. Admission & Event Velocity Gauge (Overview)
 */
export function AdmissionRateGauge({
  totalTickets = 1020,
  admitted = 680,
  approvedEvents = 3,
  draftEvents = 1,
}: {
  totalTickets?: number;
  admitted?: number;
  approvedEvents?: number;
  draftEvents?: number;
}) {
  const percent = totalTickets > 0 ? Math.round((admitted / totalTickets) * 100) : 0;
  const remaining = Math.max(0, totalTickets - admitted);

  return (
    <div className="analytics-card admission-rate-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title-wrap">
          <div className="card-badge success">
            <UsersIcon />
            <span>การเข้างานและสถานะ</span>
          </div>
          <h3 className="analytics-card-title">อัตราเข้างาน & สถานะงาน (Admission Rate)</h3>
        </div>
      </div>

      <div className="admission-stats-content">
        <div className="progress-stat-block">
          <div className="progress-header-row">
            <span className="progress-label">อัตราเข้างานจริง (Live Check-in Rate)</span>
            <span className="progress-percent-bold">{percent}%</span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill success" style={{ width: `${percent}%` }} />
          </div>
          <div className="progress-sub-info">
            <span className="sub-item admitted">
              <CheckCircleIcon /> เข้างานแล้ว {admitted.toLocaleString()} คน
            </span>
            <span className="sub-item remaining">
              <ClockIcon /> ยังไม่เข้างาน {remaining.toLocaleString()} คน
            </span>
          </div>
        </div>

        <div className="event-status-pill-grid">
          <div className="status-ratio-card approved">
            <span className="ratio-number">{approvedEvents}</span>
            <span className="ratio-label">งานอนุมัติเปิดขาย</span>
          </div>
          <div className="status-ratio-card draft">
            <span className="ratio-number">{draftEvents}</span>
            <span className="ratio-label">งานฉบับร่าง (Draft)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 4. Sub-Menu: Concert Capacity Fill Rate (for Concerts view)
 */
export function ConcertCapacityFillChart({ data = DEFAULT_TIER_DATA }: { data?: TicketTierDataPoint[] }) {
  return (
    <div className="sub-chart-banner concert-fill-banner">
      <div className="sub-chart-title-row">
        <div className="sub-chart-title">
          <TicketIcon />
          <h4>สถิติยอดจำหน่ายและโควตาบัตรแต่ละประเภท (Capacity Fill Rate per Tier)</h4>
        </div>
        <span className="sub-chart-badge">อัปเดตเรียลไทม์</span>
      </div>

      <div className="tier-capacity-bars-grid">
        {data.map((tier) => {
          const fillPercent = tier.quota > 0 ? Math.round((tier.sold / tier.quota) * 100) : 0;
          return (
            <div key={tier.tierName} className="tier-capacity-item">
              <div className="tier-item-header">
                <span className="tier-item-name">{tier.tierName}</span>
                <span className="tier-item-sold">
                  {tier.sold} / {tier.quota} ใบ ({fillPercent}%)
                </span>
              </div>
              <div className="tier-track">
                <div
                  className="tier-fill"
                  style={{
                    width: `${fillPercent}%`,
                    backgroundColor: tier.color,
                  }}
                />
              </div>
              <div className="tier-item-footer">
                <span className="tier-price">{tier.price.toLocaleString('th-TH')} THB/ใบ</span>
                <span className="tier-revenue">
                  รวม {(tier.sold * tier.price).toLocaleString('th-TH')} THB
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 5. Sub-Menu: Live Scanner Admission Velocity (for Scanners view)
 */
export function ScannerAdmissionVelocityChart() {
  const gates: GateAdmissionDataPoint[] = [
    { gate: 'ประตู A (VIP Gate)', admitted: 175, total: 200, speedPerHour: 120 },
    { gate: 'ประตู B (Main Gate 1)', admitted: 290, total: 350, speedPerHour: 210 },
    { gate: 'ประตู C (Main Gate 2)', admitted: 215, total: 300, speedPerHour: 180 },
  ];

  return (
    <div className="sub-chart-banner scanner-velocity-banner">
      <div className="sub-chart-title-row">
        <div className="sub-chart-title">
          <UsersIcon />
          <h4>สถิติความเร็วการสแกนและผู้เข้างานแยกรายประตู (Gate Check-in Throughput)</h4>
        </div>
        <span className="sub-chart-badge success">Live Gate Feeds</span>
      </div>

      <div className="gates-velocity-grid">
        {gates.map((g) => {
          const pct = Math.round((g.admitted / g.total) * 100);
          return (
            <div key={g.gate} className="gate-card">
              <div className="gate-card-header">
                <span className="gate-title">{g.gate}</span>
                <span className="gate-speed-tag">{g.speedPerHour} คน/ชม.</span>
              </div>
              <div className="gate-metric-row">
                <span className="gate-count">
                  {g.admitted} <span className="gate-unit">/ {g.total} คน</span>
                </span>
                <span className="gate-pct">{pct}%</span>
              </div>
              <div className="gate-progress-track">
                <div className="gate-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 6. Sub-Menu: Financial Breakdown Chart (for Finance view)
 */
export function FinancialBreakdownChart({ grossSales = 1250000 }: { grossSales?: number }) {
  const serviceFee = grossSales * 0.05; // 5%
  const reserveFund = grossSales * 0.10; // 10%
  const netPayout = grossSales - serviceFee - reserveFund; // 85%

  return (
    <div className="sub-chart-banner finance-breakdown-banner">
      <div className="sub-chart-title-row">
        <div className="sub-chart-title">
          <BanknotesIcon />
          <h4>โครงสร้างแจกแจงรายรับและเงินโอนสุทธิ (Revenue & Payout Distribution)</h4>
        </div>
        <span className="sub-chart-badge info">นโยบาย 5% / 10% / 85%</span>
      </div>

      <div className="finance-breakdown-stacked-bar">
        <div className="stacked-bar-track">
          <div className="stacked-segment payout" style={{ width: '85%' }} title="เงินโอนสุทธิ 85%" />
          <div className="stacked-segment fee" style={{ width: '5%' }} title="ค่าบริการระบบ 5%" />
          <div className="stacked-segment reserve" style={{ width: '10%' }} title="เงินสำรองความปลอดภัย 10%" />
        </div>

        <div className="finance-breakdown-cards-grid">
          <div className="fin-card gross">
            <span className="fin-label">ยอดขายรวม (Gross Sales)</span>
            <span className="fin-val primary">{grossSales.toLocaleString('th-TH')} THB</span>
            <span className="fin-note">100% จากคำสั่งซื้อทั้งหมด</span>
          </div>

          <div className="fin-card payout">
            <span className="fin-label">ยอดพร้อมจ่ายสุทธิ (Net Payout)</span>
            <span className="fin-val success">{netPayout.toLocaleString('th-TH')} THB</span>
            <span className="fin-note">85% โอนทุกสัปดาห์</span>
          </div>

          <div className="fin-card fee">
            <span className="fin-label">ค่าบริการระบบ (Platform Fee 5%)</span>
            <span className="fin-val text-muted">{serviceFee.toLocaleString('th-TH')} THB</span>
            <span className="fin-note">5% หักอัตโนมัติ</span>
          </div>

          <div className="fin-card reserve">
            <span className="fin-label">เงินสำรองความปลอดภัย (Reserve 10%)</span>
            <span className="fin-val warning">{reserveFund.toLocaleString('th-TH')} THB</span>
            <span className="fin-note">10% ปล่อยหลังจบงาน</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 7. Concert Performance Comparison Chart (D-66)
 */
export interface ConcertComparisonItem {
  id: string;
  title: string;
  status: string;
  grossSales: number;
  sold: number;
  quota: number;
}

export function ConcertPerformanceComparisonChart({
  concerts = [],
}: {
  concerts?: ConcertComparisonItem[];
}) {
  return (
    <div className="analytics-card concert-comparison-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title-wrap">
          <div className="card-badge primary">
            <TicketIcon />
            <span>เปรียบเทียบผลงาน</span>
          </div>
          <h3 className="analytics-card-title">ผลงานยอดขายรายคอนเสิร์ต (Concert Performance)</h3>
        </div>
      </div>

      {concerts.length === 0 ? (
        <div className="analytics-empty-state">
          <p>ยังไม่มีข้อมูลคอนเสิร์ตสำหรับเปรียบเทียบผลงาน</p>
        </div>
      ) : (
        <div className="concert-comparison-list">
          {concerts.map((c) => {
            const fillPct = c.quota > 0 ? Math.min(100, Math.round((c.sold / c.quota) * 100)) : 0;
            return (
              <div key={c.id} className="concert-comparison-item">
                <div className="comparison-item-top">
                  <div className="comparison-title-wrap">
                    <span className="comparison-event-title">{c.title}</span>
                    <span className={`status-pill small ${c.status === 'approved' ? 'status-approved' : 'status-draft'}`}>
                      {c.status === 'approved' ? 'อนุมัติแล้ว' : 'ฉบับร่าง'}
                    </span>
                  </div>
                  <span className="comparison-event-sales">{c.grossSales.toLocaleString('th-TH')} THB</span>
                </div>
                <div className="comparison-track">
                  <div className="comparison-fill" style={{ width: `${fillPct}%` }} />
                </div>
                <div className="comparison-item-bottom">
                  <span className="comparison-stat-text">
                    ขายได้ {c.sold.toLocaleString()} / {c.quota.toLocaleString()} ใบ ({fillPct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 8. Ticket Status Distribution Chart (D-66)
 */
export function TicketStatusDistributionChart({
  stats = { paid: 0, admitted: 0, refunded: 0 },
}: {
  stats?: { paid: number; admitted: number; refunded: number };
}) {
  const total = stats.paid + stats.refunded;
  const admittedPct = stats.paid > 0 ? Math.round((stats.admitted / stats.paid) * 100) : 0;
  const refundedPct = total > 0 ? Math.round((stats.refunded / total) * 100) : 0;

  return (
    <div className="analytics-card ticket-status-dist-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title-wrap">
          <div className="card-badge info">
            <CheckCircleIcon />
            <span>สัดส่วนสถานะบัตร</span>
          </div>
          <h3 className="analytics-card-title">สถานะบัตรทั้งหมด (Ticket Status Distribution)</h3>
        </div>
      </div>

      <div className="ticket-status-grid">
        <div className="status-stat-tile paid">
          <span className="status-stat-label">บัตรที่ชำระเงินแล้ว (Paid)</span>
          <span className="status-stat-value text-primary">{stats.paid.toLocaleString()} ใบ</span>
          <span className="status-stat-sub">พร้อมใช้งานสำหรับเข้างาน</span>
        </div>

        <div className="status-stat-tile admitted">
          <span className="status-stat-label">สแกนเข้างานแล้ว (Admitted)</span>
          <span className="status-stat-value text-success">{stats.admitted.toLocaleString()} ใบ</span>
          <span className="status-stat-sub">{admittedPct}% ของบัตรที่ชำระแล้ว</span>
        </div>

        <div className="status-stat-tile refunded">
          <span className="status-stat-label">คืนเงินเรียบร้อย (Refunded)</span>
          <span className="status-stat-value text-danger">{stats.refunded.toLocaleString()} ใบ</span>
          <span className="status-stat-sub">{refundedPct}% ของยอดสั่งซื้อ</span>
        </div>
      </div>
    </div>
  );
}
