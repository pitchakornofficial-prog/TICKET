import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Unified 1200px Workspace Width & Standardized Section Header Architecture (D-119)', () => {
  const rootDir = process.cwd();
  const css = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

  it('standardizes 1200px max-width across all organizer and owner section containers in globals.css', () => {
    // Stage containers
    expect(css).toContain('.organizer-content-stage');
    expect(css).toContain('.owner-workspace-content-wrap');
    expect(css).toContain('.owner-content-stage');

    // Section containers
    expect(css).toContain('.overview-workspace-container');
    expect(css).toContain('.events-management-container');
    expect(css).toContain('.organizer-scanner-card');
    expect(css).toContain('.finance-management-container');
    expect(css).toContain('.news-management-container');
    expect(css).toContain('.policies-management-container');
    expect(css).toContain('.guide-page-container');
    expect(css).toContain('.contact-page-container');
    expect(css).toContain('.settings-page-container');

    // Verify 1200px presence for each
    const requiredContainers = [
      'overview-workspace-container',
      'events-management-container',
      'organizer-scanner-card',
      'finance-management-container',
      'news-management-container',
      'policies-management-container',
      'guide-page-container',
      'contact-page-container',
      'settings-page-container',
      'owner-workspace-content-wrap',
    ];

    for (const container of requiredContainers) {
      const regex = new RegExp(`\\.${container}[^{]*\\{[^}]*max-width:\\s*1200px`, 's');
      expect(css).toMatch(regex);
    }
  });

  it('standardizes header toolbars and 1.5rem titles across organizer views', () => {
    const overview = readFileSync(join(rootDir, 'src/components/organizer-overview-view.tsx'), 'utf8');
    const events = readFileSync(join(rootDir, 'src/components/organizer-events-manager.tsx'), 'utf8');
    const scanners = readFileSync(join(rootDir, 'src/components/organizer-scanner-manager.tsx'), 'utf8');
    const finance = readFileSync(join(rootDir, 'src/components/organizer-finance-view.tsx'), 'utf8');
    const news = readFileSync(join(rootDir, 'src/components/organizer-news-view.tsx'), 'utf8');
    const policies = readFileSync(join(rootDir, 'src/components/organizer-policies-view.tsx'), 'utf8');
    const guide = readFileSync(join(rootDir, 'src/components/organizer-guide-view.tsx'), 'utf8');
    const contact = readFileSync(join(rootDir, 'src/components/organizer-contact-view.tsx'), 'utf8');
    const settings = readFileSync(join(rootDir, 'src/components/organizer-settings-view.tsx'), 'utf8');

    // Overview
    expect(overview).toContain('overview-header-toolbar');
    expect(overview).toContain('overview-header-title');
    expect(overview).toContain('ภาพรวมระบบผู้จัดงาน');

    // Events
    expect(events).toContain('events-management-header');
    expect(events).toContain('events-management-title');
    expect(events).toContain('งานคอนเสิร์ตของคุณ');

    // Scanners
    expect(scanners).toContain('scanner-workspace-header');
    expect(scanners).toContain('organizer-scanner-heading');
    expect(scanners).toContain('เจ้าหน้าที่และอุปกรณ์สแกนบัตร');

    // Finance
    expect(finance).toContain('finance-management-header');
    expect(finance).toContain('finance-management-title');
    expect(finance).toContain('รายงานการเงินและยอดรับเงิน');

    // News
    expect(news).toContain('news-management-header');
    expect(news).toContain('news-management-title');
    expect(news).toContain('จัดการข่าวสารและประกาศ');

    // Policies
    expect(policies).toContain('policies-management-header');
    expect(policies).toContain('policies-management-title');
    expect(policies).toContain('ข้อตกลงและเงื่อนไขการให้บริการสำหรับผู้จัดงาน');

    // Guide
    expect(guide).toContain('guide-page-header');
    expect(guide).toContain('guide-page-title');
    expect(guide).toContain('คู่มือการใช้งานระบบสำหรับผู้จัดงาน');

    // Contact
    expect(contact).toContain('contact-page-header');
    expect(contact).toContain('contact-page-title');
    expect(contact).toContain('ติดต่อเจ้าของระบบ TICKET');

    // Settings
    expect(settings).toContain('settings-page-header');
    expect(settings).toContain('settings-page-title');
    expect(settings).toContain('การตั้งค่าโปรไฟล์และบัญชีผู้จัดงาน');
  });

  it('ensures full-width edge-to-edge navbar and footer while content stage remains centered at 1200px (D-121)', () => {
    // admin-portal-wrapper and back-office-minimal-footer span 100% width
    expect(css).toMatch(/\.admin-portal-wrapper\s*\{[^}]*width:\s*100%/);
    expect(css).not.toMatch(/\.admin-portal-wrapper\s*\{[^}]*max-width:\s*1200px/);

    // stage and sections stay centered at 1200px
    expect(css).toMatch(/\.organizer-content-stage[^{]*\{[^}]*max-width:\s*1200px/);
    expect(css).toMatch(/\.owner-content-stage[^{]*\{[^}]*max-width:\s*1200px/);
  });

  it('ensures clean header baselines and action buttons relocated into control/filter toolbars (D-122)', () => {
    const overview = readFileSync(join(rootDir, 'src/components/organizer-overview-view.tsx'), 'utf8');
    const events = readFileSync(join(rootDir, 'src/components/organizer-events-manager.tsx'), 'utf8');
    const finance = readFileSync(join(rootDir, 'src/components/organizer-finance-view.tsx'), 'utf8');
    const news = readFileSync(join(rootDir, 'src/components/organizer-news-view.tsx'), 'utf8');
    const policies = readFileSync(join(rootDir, 'src/components/organizer-policies-view.tsx'), 'utf8');
    const ownerOverview = readFileSync(join(rootDir, 'src/components/owner-overview-dashboard.tsx'), 'utf8');
    const ownerPolicies = readFileSync(join(rootDir, 'src/components/owner-policies-view.tsx'), 'utf8');

    // 1. Events: Header has no buttons; events-filter-actions holds create button
    const eventsHeader = events.match(/<header className="events-management-header">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(eventsHeader).not.toContain('<Button');
    expect(eventsHeader).not.toContain('<button');
    expect(events).toContain('className="events-filter-actions"');
    expect(events).toContain('data-testid="open-create-concert-btn"');

    // 2. News: Header has no buttons; news-filter-bar holds create button
    const newsHeader = news.match(/<header className="news-management-header">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(newsHeader).not.toContain('<Button');
    expect(newsHeader).not.toContain('<button');
    expect(news).toContain('className="news-filter-bar"');
    expect(news).toContain('className="news-create-btn"');

    // 3. Finance: Header has no buttons; finance-tabs-wrapper holds actions
    const financeHeader = finance.match(/<header className="finance-management-header">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(financeHeader).not.toContain('<Button');
    expect(financeHeader).not.toContain('<button');
    expect(finance).toContain('className="finance-tabs-wrapper"');
    expect(finance).toContain('data-testid="finance-print-btn"');
    expect(finance).toContain('data-testid="finance-refresh-btn"');

    // 4. Policies: Header has no buttons; policies-filter-actions holds print button
    const policiesHeader = policies.match(/<header className="policies-management-header">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(policiesHeader).not.toContain('<Button');
    expect(policiesHeader).not.toContain('<button');
    expect(policies).toContain('className="policies-filter-actions"');
    expect(policies).toContain('data-testid="policies-print-btn"');

    // 5. Organizer Overview: Header has no buttons; overview-quick-actions-bar holds actions
    const overviewHeader = overview.match(/<header className="overview-header-toolbar">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(overviewHeader).not.toContain('<Button');
    expect(overviewHeader).not.toContain('<button');
    expect(overview).toContain('className="overview-quick-actions-bar"');
    expect(overview).toContain('data-testid="overview-create-event-btn"');
    expect(overview).toContain('data-testid="overview-refresh-btn"');

    // 6. Owner Policies: Header has no print button; policies-filter-actions holds print button
    const ownerPoliciesHeader = ownerPolicies.match(/<header className="policies-management-header">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(ownerPoliciesHeader).not.toContain('<Button');
    expect(ownerPoliciesHeader).not.toContain('<button');
    expect(ownerPolicies).toContain('className="policies-filter-actions"');
    expect(ownerPolicies).toContain('data-testid="owner-policies-print-btn"');

    // 7. Owner Overview: Header has no actions; owner-overview-quick-actions-bar holds actions
    const ownerOverviewHeader = ownerOverview.match(/<header className="owner-overview-header-toolbar">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(ownerOverviewHeader).not.toContain('<Button');
    expect(ownerOverviewHeader).not.toContain('<button');
    expect(ownerOverview).toContain('className="owner-overview-quick-actions-bar"');
    expect(ownerOverview).toContain('data-testid="owner-overview-invite-btn"');
    expect(ownerOverview).toContain('data-testid="owner-overview-refresh-btn"');
  });

  it('ensures consistent news page baseline by removing duplicate wrapper padding (D-123)', () => {
    // organizer-news-page must have padding: 0 so it aligns cleanly to the same 1.5rem baseline as all other menus
    expect(css).toMatch(/\.organizer-news-page\s*\{[^}]*padding:\s*0/);
  });

  it('ensures 100% monochrome black & white buttons across organizer and owner back-office (D-124)', () => {
    // 1. Primary buttons use solid dark (#0f172a)
    expect(css).toMatch(/\.events-create-btn\s*\{[^}]*background:\s*#0f172a/);
    expect(css).toMatch(/\.overview-create-btn\s*\{[^}]*background-color:\s*#0f172a/);
    expect(css).toMatch(/\.ui-btn-primary\s*\{[^}]*background:\s*#0f172a/);

    // 2. Secondary/Outline buttons use white (#ffffff) with grey border (#cbd5e1)
    expect(css).toMatch(/\.ui-btn-outline\s*\{[^}]*background:\s*#ffffff/);
    expect(css).toMatch(/\.ui-btn-outline\s*\{[^}]*border-color:\s*#cbd5e1/);

    // 3. Danger buttons use solid dark (#0f172a) adhering to 100% monochrome
    expect(css).toMatch(/\.ui-btn-danger\s*\{[^}]*background:\s*#0f172a/);

    // 4. Owner subnav quick invite button is monochrome
    expect(css).toMatch(/\.owner-subnav-tab\.invite-quick-btn\s*\{[^}]*color:\s*#0f172a/);
  });

  it('ensures standardized button hover elevation across back-office buttons (D-126)', () => {
    // 1. Shared atomic buttons lift up on hover
    expect(css).toMatch(/\.ui-btn:hover:not\(:disabled\)\s*\{[^}]*transform:\s*translateY\(-1px\)/);
    // 2. Events create button lifts up on hover
    expect(css).toMatch(/\.events-create-btn:hover\s*\{[^}]*transform:\s*translateY\(-1px\)/);
    // 3. Overview buttons lift up on hover
    expect(css).toMatch(/\.overview-create-btn:hover\s*\{[^}]*transform:\s*translateY\(-1px\)/);
    expect(css).toMatch(/\.overview-refresh-btn:hover:not\(:disabled\)\s*\{[^}]*transform:\s*translateY\(-1px\)/);
    // 4. Finance action buttons lift up on hover
    expect(css).toMatch(/\.finance-action-btn:hover:not\(:disabled\)\s*\{[^}]*transform:\s*translateY\(-1px\)/);
    // 5. Policies print button lifts up on hover
    expect(css).toMatch(/\.policies-print-btn:hover\s*\{[^}]*transform:\s*translateY\(-1px\)/);
  });

  it('ensures zero emojis (D-14) across all modified organizer and owner views', () => {
    const files = [
      'src/components/organizer-overview-view.tsx',
      'src/components/organizer-events-manager.tsx',
      'src/components/organizer-scanner-manager.tsx',
      'src/components/organizer-finance-view.tsx',
      'src/components/organizer-news-view.tsx',
      'src/components/organizer-policies-view.tsx',
      'src/components/organizer-guide-view.tsx',
      'src/components/organizer-contact-view.tsx',
      'src/components/organizer-settings-view.tsx',
      'src/components/owner-overview-dashboard.tsx',
      'src/components/owner-policies-view.tsx',
    ];

    for (const file of files) {
      const content = readFileSync(join(rootDir, file), 'utf8');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
