'use client';

import { useState, useEffect } from 'react';
import {
  SparklesIcon,
  UsersIcon,
  BanknotesIcon,
  CalendarIcon,
  ShieldCheckIcon,
  SlidersIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';

import { OrganizerSettingsView } from '@/components/organizer-settings-view';
import { OrganizerNewsView } from '@/components/organizer-news-view';
import { OrganizerContactView } from '@/components/organizer-contact-view';
import { OrganizerGuideView } from '@/components/organizer-guide-view';

export type OrganizerSectionId =
  | 'overview'
  | 'events'
  | 'scanners'
  | 'finance'
  | 'news'
  | 'policies'
  | 'guide'
  | 'contact'
  | 'settings';

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
  policies: 'policies',
  policy: 'policies',
  terms: 'policies',
  agreement: 'policies',
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
};

export function OrganizerWorkspaceView({ initialSection }: OrganizerWorkspaceViewProps) {
  const [activeSection, setActiveSection] = useState<OrganizerSectionId>(() => {
    if (initialSection && HASH_TO_SECTION[initialSection.toLowerCase()]) {
      return HASH_TO_SECTION[initialSection.toLowerCase()];
    }
    return 'overview';
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    setMobileMenuOpen(false);
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', `#${section}`);
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

              <button
                type="button"
                data-testid="organizer-nav-policies"
                className={`organizer-subnav-tab ${activeSection === 'policies' ? 'active' : ''}`}
                onClick={() => handleSelectTab('policies')}
              >
                <ShieldCheckIcon className="organizer-subnav-icon" />
                <span>ข้อตกลง</span>
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
