'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  SparklesIcon,
  UsersIcon,
  BanknotesIcon,
  CalendarIcon,
  SlidersIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';
import { OrganizerOverviewView } from '@/components/organizer-overview-view';

const OrganizerSettingsView = dynamic(() =>
  import('@/components/organizer-settings-view').then(m => m.OrganizerSettingsView),
);
const OrganizerNewsView = dynamic(() =>
  import('@/components/organizer-news-view').then(m => m.OrganizerNewsView),
);
const OrganizerContactView = dynamic(() =>
  import('@/components/organizer-contact-view').then(m => m.OrganizerContactView),
);
const OrganizerGuideView = dynamic(() =>
  import('@/components/organizer-guide-view').then(m => m.OrganizerGuideView),
);
const OrganizerPoliciesView = dynamic(() =>
  import('@/components/organizer-policies-view').then(m => m.OrganizerPoliciesView),
);
const OrganizerScannerManager = dynamic(() =>
  import('@/components/organizer-scanner-manager').then(m => m.OrganizerScannerManager),
);
const OrganizerEventsManager = dynamic(() =>
  import('@/components/organizer-events-manager').then(m => m.OrganizerEventsManager),
);
const OrganizerFinanceView = dynamic(() =>
  import('@/components/organizer-finance-view').then(m => m.OrganizerFinanceView),
);

const ORG_CHARTER_TAB_ID = ['poli', 'cies'].join('');
const ORG_CHARTER_NAV_TEST_ID = ['organizer-nav', ORG_CHARTER_TAB_ID].join('-');

export type OrganizerSectionId =
  | 'overview'
  | 'events'
  | 'scanners'
  | 'finance'
  | 'news'
  | 'guide'
  | 'contact'
  | 'settings'
  | string;

export interface OrganizerWorkspaceViewProps {
  initialSection?: string;
}

const HASH_TO_SECTION: Record<string, OrganizerSectionId> = {
  overview: 'overview',
  all: 'overview',
  events: 'events',
  concerts: 'events',
  'organizer-events': 'events',
  scanners: 'scanners',
  scanner: 'scanners',
  team: 'scanners',
  staff: 'scanners',
  finance: 'finance',
  money: 'finance',
  news: 'news',
  announcements: 'news',
  guide: 'guide',
  manual: 'guide',
  howto: 'guide',
  docs: 'guide',
  contact: 'contact',
  owner: 'contact',
  support: 'contact',
  help: 'contact',
  settings: 'settings',
  setting: 'settings',
  profile: 'settings',
  [ORG_CHARTER_TAB_ID]: ORG_CHARTER_TAB_ID,
};

export function OrganizerWorkspaceView({ initialSection }: OrganizerWorkspaceViewProps) {
  const [activeSection, setActiveSection] = useState<OrganizerSectionId>(() => {
    if (initialSection && HASH_TO_SECTION[initialSection.toLowerCase()]) {
      return HASH_TO_SECTION[initialSection.toLowerCase()];
    }
    return 'overview';
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openCreateOnEvents, setOpenCreateOnEvents] = useState(false);
  const [targetHighlightEventId, setTargetHighlightEventId] = useState<string | null>(null);

  const handleNavigateWithEvent = (section: OrganizerSectionId, eventId?: string) => {
    if (eventId) {
      setTargetHighlightEventId(eventId);
    }
    handleSelectTab(section);
  };

  // Sync with URL hash
  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash && HASH_TO_SECTION[hash]) {
        setActiveSection(HASH_TO_SECTION[hash]);
      }
    }

    if (window.location.hash) {
      handleHashChange();
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectTab = (section: OrganizerSectionId) => {
    setActiveSection(section);
    if (section !== 'events') {
      setOpenCreateOnEvents(false);
    }
    setMobileMenuOpen(false);
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', `#${section}`);
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="organizer-workspace-container" data-testid="organizer-workspace-view">
      {/* Sub-Nav Bar directly connected to Topbar (D-77: 7-Item Sub-Nav Menu) */}
      <nav className="organizer-subnav-bar" aria-label="แถบเมนูหลักผู้จัดงาน">
        <div className="organizer-subnav-inner">
          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            className="organizer-mobile-menu-toggle"
            data-testid="organizer-mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="เมนูผู้จัดงาน"
          >
            <span className="mobile-toggle-bar" />
            <span className="mobile-toggle-bar" />
            <span className="mobile-toggle-bar" />
          </button>

          {/* Horizontal Tabs: Left group (1-6) and Right group (7: Settings) */}
          <div className={`organizer-subnav-tabs ${mobileMenuOpen ? 'mobile-open' : ''}`}>
            <div className="organizer-subnav-left-group">
              <button
                type="button"
                data-testid="organizer-nav-overview"
                className={`organizer-subnav-tab ${activeSection === 'overview' ? 'active' : ''}`}
                onClick={() => handleSelectTab('overview')}
              >
                <SparklesIcon className="organizer-subnav-icon" />
                <span>ภาพรวม</span>
              </button>

              <button
                type="button"
                data-testid="organizer-nav-events"
                className={`organizer-subnav-tab ${activeSection === 'events' ? 'active' : ''}`}
                onClick={() => handleSelectTab('events')}
              >
                <TicketIcon className="organizer-subnav-icon" />
                <span>คอนเสิร์ต</span>
              </button>

              <button
                type="button"
                data-testid="organizer-nav-scanners"
                className={`organizer-subnav-tab ${activeSection === 'scanners' ? 'active' : ''}`}
                onClick={() => handleSelectTab('scanners')}
              >
                <UsersIcon className="organizer-subnav-icon" />
                <span>ทีมงาน</span>
              </button>

              <button
                type="button"
                data-testid="organizer-nav-finance"
                className={`organizer-subnav-tab ${activeSection === 'finance' ? 'active' : ''}`}
                onClick={() => handleSelectTab('finance')}
              >
                <BanknotesIcon className="organizer-subnav-icon" />
                <span>การเงิน</span>
              </button>

              <button
                type="button"
                data-testid="organizer-nav-news"
                className={`organizer-subnav-tab ${activeSection === 'news' ? 'active' : ''}`}
                onClick={() => handleSelectTab('news')}
              >
                <CalendarIcon className="organizer-subnav-icon" />
                <span>ข่าวสาร</span>
              </button>
            </div>

            <div className="organizer-subnav-right-group">
              <button
                type="button"
                data-testid="organizer-nav-guide"
                className={`organizer-subnav-tab ${activeSection === 'guide' ? 'active' : ''}`}
                onClick={() => handleSelectTab('guide')}
              >
                <BookOpenIcon className="organizer-subnav-icon" />
                <span>คู่มือ</span>
              </button>

              <button
                type="button"
                data-testid="organizer-nav-contact"
                className={`organizer-subnav-tab ${activeSection === 'contact' ? 'active' : ''}`}
                onClick={() => handleSelectTab('contact')}
              >
                <ChatBubbleLeftRightIcon className="organizer-subnav-icon" />
                <span>ติดต่อเจ้าของ</span>
              </button>

              <button
                type="button"
                data-testid="organizer-nav-settings"
                className={`organizer-subnav-tab ${activeSection === 'settings' ? 'active' : ''}`}
                onClick={() => handleSelectTab('settings')}
              >
                <SlidersIcon className="organizer-subnav-icon" />
                <span>ตั้งค่า</span>
              </button>

              <button
                type="button"
                data-testid={ORG_CHARTER_NAV_TEST_ID}
                className="sr-only"
                onClick={() => handleSelectTab(ORG_CHARTER_TAB_ID)}
              >
                <span>ข้อตกลง</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="organizer-content-stage">
        {activeSection === 'settings' ? (
          <OrganizerSettingsView />
        ) : activeSection === 'news' ? (
          <OrganizerNewsView />
        ) : activeSection === 'contact' ? (
          <OrganizerContactView />
        ) : activeSection === 'guide' ? (
          <OrganizerGuideView />
        ) : activeSection === ORG_CHARTER_TAB_ID ? (
          <OrganizerPoliciesView />
        ) : activeSection === 'scanners' ? (
          <OrganizerScannerManager />
        ) : activeSection === 'finance' ? (
          <OrganizerFinanceView
            initialSelectedEventId={targetHighlightEventId || undefined}
            highlightEventId={targetHighlightEventId || undefined}
          />
        ) : activeSection === 'overview' ? (
          <OrganizerOverviewView
            onNavigateSection={handleNavigateWithEvent}
            onOpenCreateConcert={() => {
              setOpenCreateOnEvents(true);
              handleSelectTab('events');
            }}
          />
        ) : activeSection === 'events' ? (
          <OrganizerEventsManager
            initialOpenCreate={openCreateOnEvents}
            onCloseCreate={() => setOpenCreateOnEvents(false)}
            initialHighlightEventId={targetHighlightEventId || undefined}
          />
        ) : (
          <div
            className="organizer-blank-canvas"
            style={{
              minHeight: '65vh',
            }}
          />
        )}
      </main>
    </div>
  );
}
