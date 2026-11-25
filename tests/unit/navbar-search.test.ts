import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Navbar Search & Instant Home Transformation (AC-01, G-47)', () => {
  const rootDir = process.cwd();

  it('renders NavbarSearch in the center of the navbar in SiteShell', () => {
    const siteShell = readFileSync(
      join(rootDir, 'src/components/site-shell.tsx'),
      'utf8',
    );
    expect(siteShell).toContain('<NavbarSearch');
    expect(siteShell).toContain('header-search-center');
    expect(siteShell).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('defines NavbarSearch with input, clear button, custom event dispatch, and zero emojis', () => {
    const navbarSearch = readFileSync(
      join(rootDir, 'src/components/navbar-search.tsx'),
      'utf8',
    );
    expect(navbarSearch).toContain('id="navbar-search-input"');
    expect(navbarSearch).toContain('ticket:search');
    expect(navbarSearch).toContain('navbar-search-bar');
    expect(navbarSearch).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('defines HomeConcertCatalog that transforms page content immediately on typing', () => {
    const catalogComponent = readFileSync(
      join(rootDir, 'src/components/home-concert-catalog.tsx'),
      'utf8',
    );
    expect(catalogComponent).toContain('ticket:search');
    expect(catalogComponent).toContain('isSearching');
    expect(catalogComponent).toContain('search-results-bar');
    expect(catalogComponent).toContain('ผลการค้นหาสำหรับ');
    expect(catalogComponent).toContain('empty-catalog-section');
    expect(catalogComponent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements D-68: single clean clear button without duplicate browser X and icon-prefixed autocomplete suggestions', () => {
    const navbarSearch = readFileSync(
      join(rootDir, 'src/components/navbar-search.tsx'),
      'utf8',
    );
    expect(navbarSearch).toContain('navbar-search-dropdown');
    expect(navbarSearch).toContain('suggestion-concert-item');
    expect(navbarSearch).toContain('suggestion-location-item');
    expect(navbarSearch).toContain('TicketIcon');
    expect(navbarSearch).toContain('MapPinIcon');
    expect(navbarSearch).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('::-webkit-search-cancel-button');
    expect(globalsCss).toContain('.navbar-search-dropdown');
  });

  it('implements D-69: unified search results header, comprehensive filter toolbar, and responsive grid', () => {
    const catalogComponent = readFileSync(
      join(rootDir, 'src/components/home-concert-catalog.tsx'),
      'utf8',
    );
    expect(catalogComponent).toContain('search-results-section');
    expect(catalogComponent).toContain('search-filters-toolbar');
    expect(catalogComponent).toContain('search-results-grid');
    expect(catalogComponent).toContain('search-location-select');
    expect(catalogComponent).toContain('search-price-select');
    expect(catalogComponent).toContain('search-availability-select');
    expect(catalogComponent).toContain('search-sort-select');
    expect(catalogComponent).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.search-results-section');
    expect(globalsCss).toContain('.search-filters-toolbar');
    expect(globalsCss).toContain('.search-results-grid');
  });

  it('implements D-143: Batched Infinite Scroll and Floating Back-to-Top Button for concert catalog', () => {
    const catalogComponent = readFileSync(
      join(rootDir, 'src/components/home-concert-catalog.tsx'),
      'utf8',
    );
    expect(catalogComponent).toContain('BATCH_SIZE');
    expect(catalogComponent).toContain('catalog-events-grid');
    expect(catalogComponent).toContain('infinite-scroll-sentinel');
    expect(catalogComponent).toContain('all-events-loaded-msg');
    expect(catalogComponent).toContain('floating-back-to-top');
    expect(catalogComponent).toContain('ChevronUpIcon');
    expect(catalogComponent).toContain('เลื่อนกลับขึ้นด้านบน');
    expect(catalogComponent).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.catalog-events-grid');
    expect(globalsCss).toContain('.catalog-card-item');
    expect(globalsCss).toContain('.infinite-scroll-sentinel');
    expect(globalsCss).toContain('.all-events-loaded-msg');
    expect(globalsCss).toContain('.floating-back-to-top');
    expect(globalsCss).toContain('.floating-back-to-top-icon');
  });

  it('supports searching by artist name and mobile banner full view without cropping', () => {
    const eventsServer = readFileSync(
      join(rootDir, 'src/server/events.ts'),
      'utf8',
    );
    expect(eventsServer).toContain("OR COALESCE(e.artists, '') ILIKE '%' || $1 || '%'");
    expect(eventsServer).toContain("OR COALESCE(artists, '') ILIKE '%' || $1 || '%'");

    const catalogComponent = readFileSync(
      join(rootDir, 'src/components/home-concert-catalog.tsx'),
      'utf8',
    );
    expect(catalogComponent).toContain('Boolean(ev.artists?.toLowerCase().includes(trimmedQuery))');
    expect(catalogComponent).toContain('card-split-artist-line');
    expect(catalogComponent).not.toMatch(/\p{Extended_Pictographic}/u);

    const navbarSearch = readFileSync(
      join(rootDir, 'src/components/navbar-search.tsx'),
      'utf8',
    );
    expect(navbarSearch).toContain('Boolean(ev.artists?.toLowerCase().includes(trimmed))');
    expect(navbarSearch).toContain('matchedArtists');
    expect(navbarSearch).toContain('suggestion-artist-line');
    expect(navbarSearch).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.card-split-artist-line');
    expect(globalsCss).toContain('.suggestion-artist-line');
    expect(globalsCss).toContain('min-height: unset');
  });

  it('verifies search UI & filter mobile refinements (Item 1-5)', () => {
    const siteShell = readFileSync(
      join(rootDir, 'src/components/site-shell.tsx'),
      'utf8',
    );
    const catalogComponent = readFileSync(
      join(rootDir, 'src/components/home-concert-catalog.tsx'),
      'utf8',
    );
    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );

    // Item 1: Mobile search button always keeps SearchIcon, no duplicate X
    expect(siteShell).toContain('mobile-search-btn');
    expect(siteShell).toContain('<SearchIcon style={{ width: \'20px\', height: \'20px\' }} />');

    // Item 2: Mobile search spacer prevents obscuring top content
    expect(siteShell).toContain('mobile-search-flow-spacer');
    expect(globalsCss).toContain('.mobile-search-flow-spacer');

    // Item 3: Redesigned search-results-bar to clean borderless typography header
    expect(globalsCss).toMatch(/\.search-results-bar\s*\{[^}]*background:\s*transparent;/);
    expect(globalsCss).toMatch(/\.search-results-bar\s*\{[^}]*border:\s*none;/);

    // Item 4: Collapsible mobile filter toggle and clean 1-column mobile grid to avoid overflow
    expect(catalogComponent).toContain('mobile-filter-toggle-btn');
    expect(catalogComponent).toContain('isMobileFilterOpen');
    expect(catalogComponent).toContain('SlidersIcon');
    expect(globalsCss).toContain('.mobile-filter-toggle-btn');
    expect(globalsCss).toMatch(/grid-template-columns:\s*1fr;/);

    // Item 5: Removed clear-search-button & empty card, direct recommended concerts
    expect(catalogComponent).not.toContain('clear-search-button');
    expect(catalogComponent).not.toContain('search-empty-text-wrap');
    expect(catalogComponent).toContain('search-recommended-section');
    expect(catalogComponent).toContain('คอนเสิร์ตแนะนำที่คุณอาจสนใจ');
    expect(catalogComponent).toContain('recommendedEvents');
    expect(globalsCss).toContain('.search-recommended-section');

    // Zero emojis check
    expect(siteShell).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(catalogComponent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
