'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  SparklesIcon,
  ClipboardCheckIcon,
  BanknotesIcon,
  UsersIcon,
  SlidersIcon,
  MenuIcon,
  ChevronDownIcon,
  UserPlusIcon,
  ShieldCheckIcon,
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
import { OwnerPoliciesView } from '@/components/owner-policies-view';

export type OwnerSectionId =
  | 'overview'
  | 'approval'
  | 'finance'
  | 'customer'
  | 'system'
  | 'policies';

interface SectionConfig {
  id: OwnerSectionId;
  label: string;
  description: string;
  icon: typeof ClipboardCheckIcon;
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'overview',
    label: 'ภาพรวม',
    description: 'แดชบอร์ดสรุปงานค้างและตัวเลขภาพรวมทั้งแพลตฟอร์ม',
    icon: SparklesIcon,
  },
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
  {
    id: 'policies',
    label: 'ข้อตกลง',
    description: 'กฎบัตรการกำกับดูแลแพลตฟอร์ม โครงสร้างค่าบริการ เงินสำรอง และเงื่อนไขทางกฎหมาย',
    icon: ShieldCheckIcon,
  },
];

const HASH_TO_SECTION: Record<string, OwnerSectionId> = {
  overview: 'overview',
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
  policies: 'policies',
  'owner-policies-view': 'policies',
  terms: 'policies',
  policy: 'policies',
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
    return SECTIONS.find(s => s.id === activeSection) || SECTIONS[1]; // default to approval
  }, [activeSection]);

  const handleSelectSection = (id: OwnerSectionId) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`);
      window.scrollTo(0, 0);
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
      {/* Horizontal Sub-Nav Bar (D-115, matching Organizer Layout D-77) */}
      <nav className="owner-subnav-bar" aria-label="แถบเมนูหลักเจ้าของระบบ">
        <div className="owner-subnav-inner">
          {/* Mobile Menu Toggle Button (preserves testid and text for backward compatibility) */}
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

          {/* Desktop/Tablet Horizontal Tabs */}
          <div className={`owner-subnav-tabs ${mobileMenuOpen ? 'mobile-open' : ''}`}>
            <div className="owner-subnav-left-group">
              {SECTIONS.map(section => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    className={`owner-subnav-tab ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectSection(section.id)}
                    data-testid={`owner-nav-${section.id}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="owner-subnav-icon" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="owner-subnav-right-group">
              <button
                type="button"
                className="owner-subnav-tab invite-quick-btn"
                data-testid="owner-nav-invite"
                onClick={() => handleNavigateToSection('system', 'invite-organizer-form')}
              >
                <UserPlusIcon className="owner-subnav-icon" />
                <span>เชิญผู้จัดงาน</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      {activeSection === 'overview' ? (
        <main
          className="owner-content-stage"
          data-testid="owner-section-content-overview"
        >
          <OwnerOverviewDashboard
            onNavigateToSection={handleNavigateToSection}
            isFullOverview={true}
          />
        </main>
      ) : activeSection === 'policies' ? (
        <main
          className="owner-content-stage"
          data-testid="owner-section-content-policies"
        >
          <OwnerPoliciesView />
        </main>
      ) : (
        <div className="owner-workspace-content-wrap">
          {/* Compact Overview Dashboard at top (TASK-039, AC-115, D-17) */}
          <OwnerOverviewDashboard
            onNavigateToSection={handleNavigateToSection}
            isFullOverview={false}
          />

          <main
            className="owner-main-content"
            id="owner-main-content"
            data-testid={`owner-section-content-${activeSection}`}
          >
            <div className="owner-section-header">
              <div className="owner-section-header-titles">
                <h2 className="owner-section-title">{currentSection.label}</h2>
                <p className="owner-section-subtitle">{currentSection.description}</p>
              </div>

              {/* In-page Sub-Tabs for clean navigation within section (D-115) */}
              {activeSection === 'approval' && (
                <nav className="owner-section-subtabs" aria-label="เมนูย่อยระบบอนุมัติ">
                  <a href="#owner-session-approval-manager" className="owner-section-subtab">
                    <span>รอบการแสดง / แก้ไข / ยกเลิก</span>
                  </a>
                  <a href="#owner-refund-approval-manager" className="owner-section-subtab">
                    <span>คำขอคืนเงิน</span>
                  </a>
                </nav>
              )}

              {activeSection === 'finance' && (
                <nav className="owner-section-subtabs" aria-label="เมนูย่อยระบบการเงิน">
                  <a href="#owner-weekly-payout-manager" className="owner-section-subtab">
                    <span>จ่ายเงินรายสัปดาห์</span>
                  </a>
                  <a href="#owner-fee-settings-manager" className="owner-section-subtab">
                    <span>ค่าบริการและเงินสำรอง</span>
                  </a>
                  <a href="#owner-debt-repayment-manager" className="owner-section-subtab">
                    <span>หนี้สินและเงินล่าช้า</span>
                  </a>
                </nav>
              )}

              {activeSection === 'customer' && (
                <nav className="owner-section-subtabs" aria-label="เมนูย่อยระบบลูกค้า">
                  <a href="#owner-contact-correction-manager" className="owner-section-subtab">
                    <span>แก้ไขข้อมูลติดต่อผู้ซื้อ</span>
                  </a>
                  <a href="#owner-email-deliveries-manager" className="owner-section-subtab">
                    <span>ตรวจสอบการส่งอีเมล</span>
                  </a>
                </nav>
              )}

              {activeSection === 'system' && (
                <nav className="owner-section-subtabs" aria-label="เมนูย่อยระบบและข่าวสาร">
                  <a href="#invite-organizer-form" className="owner-section-subtab">
                    <span>เชิญผู้จัดงานใหม่</span>
                  </a>
                  <a href="#owner-news-manager" className="owner-section-subtab">
                    <span>จัดการข่าวสาร</span>
                  </a>
                  <a href="#owner-sync-conflicts-manager" className="owner-section-subtab">
                    <span>ข้อขัดแย้งออฟไลน์</span>
                  </a>
                </nav>
              )}
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
      )}
    </div>
  );
}
