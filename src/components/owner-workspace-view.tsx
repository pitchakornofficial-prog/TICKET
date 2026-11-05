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
} from '@/components/icons';
import { OwnerInvitationsView } from '@/components/owner-invitations-view';
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
import { OwnerContactInfoManager } from '@/components/owner-contact-info-manager';
import { OwnerOverviewDashboard } from '@/components/owner-overview-dashboard';

export type OwnerSectionId =
  | 'overview'
  | 'approval'
  | 'finance'
  | 'customer'
  | 'invitations'
  | 'system';

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
    description: 'แดชบอร์ดสรุปสถิติและคิวงานสำคัญระดับแพลตฟอร์ม',
    icon: SparklesIcon,
  },
  {
    id: 'approval',
    label: 'อนุมัติคอนเสิร์ต',
    description: 'ตรวจสอบอนุมัติรอบแสดงและคำขอคืนเงินของลูกค้า',
    icon: ClipboardCheckIcon,
  },
  {
    id: 'finance',
    label: 'การเงินและรอบโอน',
    description: 'รอบโอนเงินรายสัปดาห์ ค่าบริการระบบ และเงินสำรอง',
    icon: BanknotesIcon,
  },
  {
    id: 'customer',
    label: 'ลูกค้าและคำสั่งซื้อ',
    description: 'จัดการข้อมูลผู้ซื้อและตรวจสอบการส่งตั๋วทางอีเมล',
    icon: UsersIcon,
  },
  {
    id: 'invitations',
    label: 'คำเชิญผู้จัดงานและทีมงาน',
    description: 'จัดการคำเชิญผู้จัดงานและทีมงานผู้ดูแลระบบ',
    icon: UserPlusIcon,
  },
  {
    id: 'system',
    label: 'ระบบและข่าวสาร',
    description: 'ประกาศข่าวสาร ข้อมูลติดต่อ และแก้ข้อขัดแย้งออฟไลน์',
    icon: SlidersIcon,
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
  invitations: 'invitations',
  invitation: 'invitations',
  'owner-invitations-view': 'invitations',
  'invite-organizer-form': 'invitations',
  system: 'system',
  'owner-news-manager': 'system',
  'owner-contact-info-manager': 'system',
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
  const [activeSubTab, setActiveSubTab] = useState<string>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && hash in HASH_TO_SECTION) {
        setActiveSection(HASH_TO_SECTION[hash]);
        if (hash === 'owner-session-approval-manager') setActiveSubTab('sessions');
        else if (hash === 'owner-refund-approval-manager') setActiveSubTab('refunds');
        else if (hash === 'owner-weekly-payout-manager') setActiveSubTab('payouts');
        else if (hash === 'owner-fee-settings-manager') setActiveSubTab('fees');
        else if (hash === 'owner-debt-repayment-manager' || hash === 'owner-payment-recovery-manager') setActiveSubTab('debts');
        else if (hash === 'owner-contact-correction-manager') setActiveSubTab('contacts');
        else if (hash === 'owner-email-deliveries-manager') setActiveSubTab('emails');
        else if (hash === 'owner-news-manager') setActiveSubTab('news');
        else if (hash === 'owner-contact-info-manager') setActiveSubTab('contacts');
        else if (hash === 'owner-sync-conflicts-manager' || hash === 'owner-sync-conflict-manager') setActiveSubTab('conflicts');
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
    setActiveSubTab('all');
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`);
      window.scrollTo(0, 0);
    }
  };

  const handleNavigateToSection = (section: OwnerSectionId, targetManagerId?: string) => {
    setActiveSection(section);
    if (targetManagerId) {
      if (targetManagerId === 'owner-session-approval-manager') setActiveSubTab('sessions');
      else if (targetManagerId === 'owner-refund-approval-manager') setActiveSubTab('refunds');
      else if (targetManagerId === 'owner-weekly-payout-manager') setActiveSubTab('payouts');
      else if (targetManagerId === 'owner-fee-settings-manager') setActiveSubTab('fees');
      else if (targetManagerId === 'owner-debt-repayment-manager') setActiveSubTab('debts');
      else if (targetManagerId === 'owner-contact-correction-manager') setActiveSubTab('contacts');
      else if (targetManagerId === 'owner-email-deliveries-manager') setActiveSubTab('emails');
      else if (targetManagerId === 'owner-news-manager') setActiveSubTab('news');
      else if (targetManagerId === 'owner-contact-info-manager') setActiveSubTab('contacts');
      else if (targetManagerId.includes('sync-conflict')) setActiveSubTab('conflicts');
      else setActiveSubTab('all');
    } else {
      setActiveSubTab('all');
    }
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      const hash = targetManagerId || section;
      window.history.replaceState(null, '', `#${hash}`);
      if (targetManagerId) {
        setTimeout(() => {
          const el = document.getElementById(targetManagerId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
        }, 50);
      } else {
        window.scrollTo(0, 0);
      }
    }
  };

  return (
    <div className="owner-workspace-container" data-testid="owner-workspace-view">
      {/* Horizontal Sub-Nav Bar (D-115, D-221, D-222) */}
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

          {/* Desktop/Tablet Horizontal Tabs (D-221, D-222) */}
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
                    data-legacy-testid={section.id === 'invitations' ? 'owner-nav-invite' : undefined}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="owner-subnav-icon" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
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
      ) : (
        <div className="owner-workspace-content-wrap">
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

              {/* Functional Sub-Tabs (D-115, D-221, D-223) */}
              {activeSection === 'approval' && (
                <nav className="owner-section-subtabs" aria-label="เมนูย่อยระบบอนุมัติ">
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#approval"
                    className={`owner-section-subtab ${activeSubTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('all')}
                  >
                    <span>ทั้งหมด</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-session-approval-manager"
                    className={`owner-section-subtab ${activeSubTab === 'sessions' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('sessions')}
                  >
                    <span>รอบการแสดง / แก้ไข / ยกเลิก</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-refund-approval-manager"
                    className={`owner-section-subtab ${activeSubTab === 'refunds' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('refunds')}
                  >
                    <span>คำขอคืนเงิน</span>
                  </a>
                </nav>
              )}

              {activeSection === 'finance' && (
                <nav className="owner-section-subtabs" aria-label="เมนูย่อยระบบการเงิน">
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#finance"
                    className={`owner-section-subtab ${activeSubTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('all')}
                  >
                    <span>ทั้งหมด</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-weekly-payout-manager"
                    className={`owner-section-subtab ${activeSubTab === 'payouts' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('payouts')}
                  >
                    <span>จ่ายเงินรายสัปดาห์</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-fee-settings-manager"
                    className={`owner-section-subtab ${activeSubTab === 'fees' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('fees')}
                  >
                    <span>ค่าบริการและเงินสำรอง</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-debt-repayment-manager"
                    className={`owner-section-subtab ${activeSubTab === 'debts' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('debts')}
                  >
                    <span>หนี้สินและเงินล่าช้า</span>
                  </a>
                </nav>
              )}

              {activeSection === 'customer' && (
                <nav className="owner-section-subtabs" aria-label="เมนูย่อยระบบลูกค้า">
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#customer"
                    className={`owner-section-subtab ${activeSubTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('all')}
                  >
                    <span>ทั้งหมด</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-contact-correction-manager"
                    className={`owner-section-subtab ${activeSubTab === 'contacts' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('contacts')}
                  >
                    <span>แก้ไขข้อมูลติดต่อผู้ซื้อ</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-email-deliveries-manager"
                    className={`owner-section-subtab ${activeSubTab === 'emails' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('emails')}
                  >
                    <span>ตรวจสอบการส่งอีเมล</span>
                  </a>
                </nav>
              )}

              {activeSection === 'invitations' && (
                <nav className="owner-section-subtabs" aria-label="เมนูย่อยระบบคำเชิญ">
                  <a
                    href="#invite-organizer-form"
                    className="owner-section-subtab active"
                  >
                    <span>เชิญผู้จัดงานใหม่</span>
                  </a>
                </nav>
              )}

              {activeSection === 'system' && (
                <nav className="owner-section-subtabs" aria-label="เมนูย่อยระบบและข่าวสาร">
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#system"
                    className={`owner-section-subtab ${activeSubTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('all')}
                  >
                    <span>ทั้งหมด</span>
                  </a>
                  <a href="#invite-organizer-form" className="owner-section-subtab" style={{ display: 'none' }}>
                    <span>เชิญผู้จัดงานใหม่</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-news-manager"
                    className={`owner-section-subtab ${activeSubTab === 'news' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('news')}
                  >
                    <span>จัดการข่าวสาร</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-contact-info-manager"
                    className={`owner-section-subtab ${activeSubTab === 'contacts' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('contacts')}
                  >
                    <span>ข้อมูลติดต่อเจ้าของระบบ</span>
                  </a>
                  {/* biome-ignore lint/a11y/useValidAnchor: In-page subtab hash navigation */}
                  <a
                    href="#owner-sync-conflicts-manager"
                    className={`owner-section-subtab ${activeSubTab === 'conflicts' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('conflicts')}
                  >
                    <span>ข้อขัดแย้งออฟไลน์</span>
                  </a>
                </nav>
              )}
            </div>

            <div className="owner-section-body">
              {activeSection === 'approval' && (
                <>
                  {(activeSubTab === 'all' || activeSubTab === 'sessions') && <OwnerSessionApprovalManager />}
                  {(activeSubTab === 'all' || activeSubTab === 'refunds') && <OwnerRefundApprovalManager />}
                </>
              )}

              {activeSection === 'finance' && (
                <>
                  {(activeSubTab === 'all' || activeSubTab === 'payouts') && <OwnerWeeklyPayoutManager />}
                  {(activeSubTab === 'all' || activeSubTab === 'fees') && (
                    <>
                      <OwnerFeeSettingsManager />
                      <OwnerReserveReleaseManager />
                    </>
                  )}
                  {(activeSubTab === 'all' || activeSubTab === 'debts') && (
                    <>
                      <OwnerDebtRepaymentManager />
                      <OwnerPaymentRecoveryManager />
                    </>
                  )}
                </>
              )}

              {activeSection === 'customer' && (
                <>
                  {(activeSubTab === 'all' || activeSubTab === 'contacts') && <OwnerContactCorrectionManager />}
                  {(activeSubTab === 'all' || activeSubTab === 'emails') && <OwnerEmailDeliveriesManager />}
                </>
              )}

              {activeSection === 'invitations' && (
                <OwnerInvitationsView />
              )}

              {activeSection === 'system' && (
                <>
                  {(activeSubTab === 'all' || activeSubTab === 'news') && <OwnerNewsManager />}
                  {(activeSubTab === 'all' || activeSubTab === 'contacts') && <OwnerContactInfoManager />}
                  {(activeSubTab === 'all' || activeSubTab === 'conflicts') && <OwnerSyncConflictManager />}
                </>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
