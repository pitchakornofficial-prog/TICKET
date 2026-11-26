import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OWNER_CONTACT_INFO } from '@/lib/owner-contact-sync';
import { readPublicOwnerContactInfo } from '@/server/owner-contact-info';

describe('readPublicOwnerContactInfo', () => {
  it('returns saved admin contact info when present in database', async () => {
    const saved = {
      ...DEFAULT_OWNER_CONTACT_INFO,
      email: 'hello@ticket-live.test',
      hotline: '02-999-0000',
      lineId: '@ticket-live',
    };
    const mockPool = {
      query: async (sql: string) => {
        if (sql.includes('SELECT data FROM owner_contact_info')) {
          return { rows: [{ data: saved }] };
        }
        return { rows: [] };
      },
      connect: async () => ({
        query: async () => ({ rows: [] }),
        release: () => {},
      }),
    } as unknown as Pool;

    const result = await readPublicOwnerContactInfo(mockPool);
    expect(result.email).toBe('hello@ticket-live.test');
    expect(result.hotline).toBe('02-999-0000');
    expect(result.lineId).toBe('@ticket-live');
  });

  it('falls back to DEFAULT_OWNER_CONTACT_INFO when database is empty or fails', async () => {
    const failingPool = {
      query: async () => {
        throw new Error('ECONNREFUSED');
      },
      connect: async () => {
        throw new Error('ECONNREFUSED');
      },
    } as unknown as Pool;

    const result = await readPublicOwnerContactInfo(failingPool);
    expect(result).toEqual(DEFAULT_OWNER_CONTACT_INFO);
  });
});

describe('customer static pages consistency', () => {
  it('syncs /contact and /about with readPublicOwnerContactInfo and removes old hardcoded emails', () => {
    const rootDir = process.cwd();
    const contactPage = readFileSync(join(rootDir, 'src/app/contact/page.tsx'), 'utf8');
    const aboutPage = readFileSync(join(rootDir, 'src/app/about/page.tsx'), 'utf8');

    expect(contactPage).toContain('readPublicOwnerContactInfo');
    expect(aboutPage).toContain('readPublicOwnerContactInfo');
    expect(contactPage).not.toContain('support@phatysd.me');
    expect(contactPage).not.toContain('organizer@phatysd.me');
    expect(aboutPage).not.toContain('support@phatysd.me');
  });

  it('uses clean secondary CTA buttons and FloatingBackToTop across all 5 static customer pages', () => {
    const rootDir = process.cwd();
    const pages = [
      'src/app/contact/page.tsx',
      'src/app/about/page.tsx',
      'src/app/privacy/page.tsx',
      'src/app/refund-policy/page.tsx',
      'src/app/terms/page.tsx',
    ];

    for (const relPath of pages) {
      const source = readFileSync(join(rootDir, relPath), 'utf8');
      expect(source).toContain('FloatingBackToTop');
      expect(source).not.toContain('primary-button');
      expect(source).toContain('alternates:');
      expect(source).toContain('openGraph:');
    }
  });
});
