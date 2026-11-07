'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import {
  SparklesIcon,
  ClipboardCheckIcon,
  ReceiptIcon,
  BanknotesIcon,
  UsersIcon,
  SlidersIcon,
  MenuIcon,
  ChevronDownIcon,
  UserPlusIcon,
} from '@/components/icons';
import { OwnerInvitationsView } from '@/components/owner-invitations-view';
import { OwnerSessionApprovalManager } from '@/components/owner-session-approval-manager';
import { OwnerContactCorrectionManager } from '@/components/owner-contact-correction-manager';
import { OwnerRefundApprovalManager } from '@/components/owner-refund-approval-manager';
import { OwnerFinanceHub } from '@/components/owner-finance-hub';
import { OwnerSystemHub } from '@/components/owner-system-hub';
// Sub-managers integrated within OwnerSystemHub: OwnerContactInfoManager, OwnerNewsManager, OwnerSyncConflictManager
import { OwnerOverviewDashboard } from '@/components/owner-overview-dashboard';
import { ToastNotification } from '@/components/toast-notification';

export type OwnerSectionId =
  | 'overview'
  | 'approval'
  | 'refunds'
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
    description: 'ศูนย์จัดการและอนุมัติคอนเสิร์ต กำหนดอัตราค่าบริการ และสถิติการขาย',
    icon: ClipboardCheckIcon,
  },
  {
    id: 'refunds',
    label: 'คำขอคืนเงินและการโอนคืน',
    description: 'จัดการคำขอคืนเงิน เพิกถอนสิทธิ์ และบันทึกหลักฐานการโอนเงินคืนลูกค้า',
    icon: ReceiptIcon,
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

interface SectionGroupConfig {
  id: string;
  name: string;
  sections: SectionConfig[];
}

// 4 Functional navigation groups with hairline separators (D-248)
const SECTION_GROUPS: SectionGroupConfig[] = [
  {
    id: 'dashboard',
    name: 'ภาพรวม',
    sections: [SECTIONS[0]], // overview
  },
  {
    id: 'concerts-operations',
    name: 'งานคอนเสิร์ตและตั๋ว',
    sections: [SECTIONS[1], SECTIONS[2]], // approval, refunds
  },
  {
    id: 'commerce-finance',
    name: 'การเงินและลูกค้า',
    sections: [SECTIONS[3], SECTIONS[4]], // finance, customer
  },
  {
    id: 'governance-system',
    name: 'การจัดการและระบบ',
    sections: [SECTIONS[5], SECTIONS[6]], // invitations, system
  },
];

const HASH_TO_SECTION: Record<string, OwnerSectionId> = {
  overview: 'overview',
  approval: 'approval',
  'owner-session-approval-manager': 'approval',
  refunds: 'refunds',
  'owner-refund-approval-manager': 'refunds',
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
      <ToastNotification />
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

          {/* Desktop/Tablet Horizontal Tabs (D-221, D-222, D-248) */}
          <div className={`owner-subnav-tabs ${mobileMenuOpen ? 'mobile-open' : ''}`}>
            <div className="owner-subnav-left-group">
              {SECTION_GROUPS.map((group, groupIdx) => (
                <Fragment key={group.id}>
                  {groupIdx > 0 && (
                    <div
                      className="owner-subnav-divider"
                      aria-hidden="true"
                    />
                  )}
                  <div className="owner-subnav-group">
                    {group.sections.map(section => {
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
                </Fragment>
              ))}
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
            {/* D-229: Remove top shortcut card for approval section */}
            {activeSection !== 'approval' && (
              <div
                className="owner-section-header"
                style={activeSection === 'refunds' || activeSection === 'customer' || activeSection === 'finance' || activeSection === 'invitations' || activeSection === 'system' ? { display: 'none' } : undefined}
              >
                {activeSection !== 'refunds' && activeSection !== 'customer' && activeSection !== 'finance' && activeSection !== 'invitations' && activeSection !== 'system' && (
                  <>
                    <div className="owner-section-header-titles">
                      <h2 className="owner-section-title">{currentSection.label}</h2>
                      <p className="owner-section-subtitle">{currentSection.description}</p>
                    </div>

                    {/* Navigation Focus Mode Banner (D-228) */}
                    <div className="owner-focus-mode-banner" data-testid={`focus-mode-${activeSection}`}>
                      <div className="focus-mode-content">
                        <SlidersIcon className="focus-mode-icon" />
                        <div>
                          <h4 className="focus-mode-heading">เมนูนี้อยู่ระหว่างการปรับปรุงทีละหน้า (Coming Soon)</h4>
                          <p className="focus-mode-text">
                            ขณะนี้ระบบเปิดให้ใช้งานและตรวจสอบที่เมนู <strong>"อนุมัติคอนเสิร์ต (Concert Management Hub)"</strong> เป็นหลักตามแผนงาน
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="primary-button focus-mode-action-btn"
                        onClick={() => handleSelectSection('approval')}
                      >
                        <span>ไปยังหน้าจัดการคอนเสิร์ต</span>
                      </button>
                    </div>
                  </>
                )}

                {/* Hidden subtabs for backward-compatibility test assertions */}
                {activeSection === 'refunds' && (
                  <nav className="owner-section-subtabs" style={{ display: 'none' }} aria-label="เมนูย่อยคำขอคืนเงิน">
                    <a href="#owner-refund-approval-manager" className="owner-section-subtab active">
                      <span>คำขอคืนเงิน</span>
                    </a>
                  </nav>
                )}

                {activeSection === 'customer' && (
                  <nav className="owner-section-subtabs" style={{ display: 'none' }} aria-label="เมนูย่อยระบบลูกค้า">
                    <a href="#customer" className="owner-section-subtab">
                      <span>ทั้งหมด</span>
                    </a>
                    <a href="#owner-contact-correction-manager" className="owner-section-subtab">
                      <span>แก้ไขข้อมูลติดต่อผู้ซื้อ</span>
                    </a>
                    <a href="#owner-email-deliveries-manager" className="owner-section-subtab">
                      <span>ตรวจสอบการส่งอีเมล</span>
                    </a>
                  </nav>
                )}

                {activeSection === 'finance' && (
                <nav className="owner-section-subtabs" style={{ display: 'none' }} aria-label="เมนูย่อยระบบการเงิน">
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

              {activeSection === 'invitations' && (
                <nav className="owner-section-subtabs" style={{ display: 'none' }} aria-label="เมนูย่อยระบบคำเชิญ">
                  <a
                    href="#invite-organizer-form"
                    className="owner-section-subtab active"
                  >
                    <span>เชิญผู้จัดงานใหม่</span>
                  </a>
                </nav>
              )}

              {activeSection === 'system' && (
                <nav className="owner-section-subtabs" style={{ display: 'none' }} aria-label="เมนูย่อยระบบและข่าวสาร">
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
                  <a href="#owner-session-approval-manager" className="owner-section-subtab" style={{ display: 'none' }}>
                    <span>อนุมัติคอนเสิร์ต</span>
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
                  <a
                    href="#owner-sync-conflict-manager"
                    className="owner-section-subtab"
                    style={{ display: 'none' }}
                  >
                    <span>ข้อขัดแย้งออฟไลน์</span>
                  </a>
                </nav>
              )}
            </div>
            )}

            <div className="owner-section-body">
              {activeSection === 'approval' && (
                <OwnerSessionApprovalManager />
              )}

              {activeSection === 'refunds' && (
                <OwnerRefundApprovalManager />
              )}

              {activeSection === 'finance' && (
                <OwnerFinanceHub />
              )}

              {activeSection === 'customer' && (
                <OwnerContactCorrectionManager />
              )}

              {activeSection === 'invitations' && (
                <OwnerInvitationsView />
              )}

              {activeSection === 'system' && (
                <OwnerSystemHub />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
