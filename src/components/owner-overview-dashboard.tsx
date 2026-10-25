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
} from '@/components/icons';

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

interface OwnerOverviewDashboardProps {
  onNavigateToSection: (section: OwnerSectionId, targetManagerId: string) => void;
}

export function OwnerOverviewDashboard({ onNavigateToSection }: OwnerOverviewDashboardProps) {
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
          <RefreshIcon style={{ width: '14px', height: '14px' }} />
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
  );
}
