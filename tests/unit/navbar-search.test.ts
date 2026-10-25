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
});
