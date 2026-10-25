'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardCheckIcon,
  BanknotesIcon,
  UsersIcon,
  SlidersIcon,
  MenuIcon,
  ChevronDownIcon,
} from '@/components/icons';
import { InviteOrganizerForm } from '@/components/invite-organizer-form';
import { OwnerSessionApprovalManager } from '@/components/owner-session-approval-manager';
import { OwnerNewsManager } from '@/components/owner-news-manager';
import { OwnerFeeSettingsManager } from '@/components/owner-fee-settings-manager';
import { OwnerPaymentRecoveryManager } from '@/components/owner-payment-recovery-manager';
import { OwnerEmailDeliveriesManager } from '@/components/owner-email-deliveries-manager';
import { OwnerContactCorrectionManager } from '@/components/owner-contact-correction-manager';
import { OwnerRefundApprovalManager } from '@/components/owner-refund-approval-manager';
import { OwnerWeeklyPayoutManager } from '@/components/owner-weekly-payout-manager';
import { OwnerReserveReleaseManager } from '@/components/owner-reserve-release-manager';
import { OwnerDebtRepaymentManager } from '@/components/owner-debt-repayment-manager';
import { OwnerSyncConflictManager } from '@/components/owner-sync-conflict-manager';
import { OwnerOverviewDashboard } from '@/components/owner-overview-dashboard';

export type OwnerSectionId = 'approval' | 'finance' | 'customer' | 'system';

interface SectionConfig {
  id: OwnerSectionId;
  label: string;
  description: string;
  icon: typeof ClipboardCheckIcon;
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'approval',
    label: 'อนุมัติ',
    description: 'รอบการแสดง / แก้ไข / ยกเลิก และคำขอคืนเงิน',
    icon: ClipboardCheckIcon,
  },
  {
    id: 'finance',
    label: 'การเงิน',
    description: 'ค่าบริการ เงินสำรอง จ่ายรายสัปดาห์ ปล่อยสำรอง และหนี้ค้าง',
    icon: BanknotesIcon,
  },
  {
    id: 'customer',
    label: 'ลูกค้า',
    description: 'แก้ไขข้อมูลติดต่อผู้ซื้อ และตรวจสอบการส่งอีเมล',
    icon: UsersIcon,
  },
  {
    id: 'system',
    label: 'ระบบ',
    description: 'เชิญผู้จัดงาน ข่าวสาร และจัดการข้อขัดแย้งออฟไลน์',
    icon: SlidersIcon,
  },
];

const HASH_TO_SECTION: Record<string, OwnerSectionId> = {
  approval: 'approval',
  'owner-session-approval-manager': 'approval',
  'owner-refund-approval-manager': 'approval',
  finance: 'finance',
  'owner-fee-settings-manager': 'finance',
  'owner-weekly-payout-manager': 'finance',
  'owner-reserve-release-manager': 'finance',
  'owner-debt-repayment-manager': 'finance',
  'owner-payment-recovery-manager': 'finance',
  customer: 'customer',
  'owner-contact-correction-manager': 'customer',
  'owner-email-deliveries-manager': 'customer',
  system: 'system',
  'invite-organizer-form': 'system',
  'owner-news-manager': 'system',
  'owner-sync-conflict-manager': 'system',
  'owner-sync-conflicts-manager': 'system',
};

interface OwnerWorkspaceViewProps {
  initialSection?: string;
}

export function OwnerWorkspaceView({ initialSection }: OwnerWorkspaceViewProps) {
  const [activeSection, setActiveSection] = useState<OwnerSectionId>(() => {
    if (initialSection && initialSection in HASH_TO_SECTION) {
      return HASH_TO_SECTION[initialSection];
    }
    return 'approval';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const currentSection = useMemo(() => {
    return SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];
  }, [activeSection]);

  const handleSelectSection = (id: OwnerSectionId) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`);
    }
  };

  const handleNavigateToSection = (section: OwnerSectionId, targetManagerId: string) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${targetManagerId}`);
      setTimeout(() => {
        const el = document.getElementById(targetManagerId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 50);
    }
  };

  return (
    <div className="owner-workspace-container" data-testid="owner-workspace-view">
      {/* Overview Dashboard (TASK-039, AC-115, D-17) */}
      <OwnerOverviewDashboard onNavigateToSection={handleNavigateToSection} />

      {/* Mobile navigation toggle (D-19) */}
      <div className="owner-mobile-nav-bar">
        <button
          type="button"
          className="owner-mobile-menu-btn"
          onClick={() => setMobileMenuOpen(prev => !prev)}
          data-testid="owner-mobile-menu-toggle"
          aria-expanded={mobileMenuOpen}
          aria-label="สลับหมวดหมู่เมนูหลังบ้าน"
        >
          <div className="btn-content">
            <MenuIcon className="icon-sm" />
            <span>หมวดหมู่: {currentSection.label}</span>
          </div>
          <ChevronDownIcon className="icon-sm" />
        </button>
      </div>

      <div className="owner-workspace-grid">
        {/* Desktop Sidebar navigation (D-15, D-16) */}
        <aside
          className={`owner-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}
          aria-label="เมนูนำทางหลังบ้านเจ้าของเว็บ"
        >
          <nav className="owner-nav-list" aria-label="หมวดหมู่ระบบ">
            {SECTIONS.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`owner-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectSection(section.id)}
                  data-testid={`owner-nav-${section.id}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="owner-nav-icon" />
                  <div className="owner-nav-text">
                    <span className="owner-nav-label">{section.label}</span>
                    <span className="owner-nav-desc">{section.description}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Area: Renders ONLY the active section (D-15, AC-116) */}
        <main
          className="owner-main-content"
          id="owner-main-content"
          data-testid={`owner-section-content-${activeSection}`}
        >
          <div className="owner-section-header">
            <h2 className="owner-section-title">{currentSection.label}</h2>
            <p className="owner-section-subtitle">{currentSection.description}</p>
          </div>

          <div className="owner-section-body">
            {activeSection === 'approval' && (
              <>
                <OwnerSessionApprovalManager />
                <OwnerRefundApprovalManager />
              </>
            )}

            {activeSection === 'finance' && (
              <>
                <OwnerFeeSettingsManager />
                <OwnerWeeklyPayoutManager />
                <OwnerReserveReleaseManager />
                <OwnerDebtRepaymentManager />
                <OwnerPaymentRecoveryManager />
              </>
            )}

            {activeSection === 'customer' && (
              <>
                <OwnerContactCorrectionManager />
                <OwnerEmailDeliveriesManager />
              </>
            )}

            {activeSection === 'system' && (
              <>
                <InviteOrganizerForm />
                <OwnerNewsManager />
                <OwnerSyncConflictManager />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
