import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  parseHeroBannersList,
  readHomeBanners,
  writeHomeBanners,
} from '../../src/server/home-banners';
import { DEFAULT_HERO_BANNERS, type HeroBannerItem } from '../../src/lib/home-banners-sync';

describe('Server Home Banners Database Integration', () => {
  describe('parseHeroBannersList', () => {
    it('returns null for non-array inputs', () => {
      expect(parseHeroBannersList(null)).toBeNull();
      expect(parseHeroBannersList(undefined)).toBeNull();
      expect(parseHeroBannersList('string')).toBeNull();
      expect(parseHeroBannersList(123)).toBeNull();
      expect(parseHeroBannersList({ not: 'an array' })).toBeNull();
    });

    it('returns empty array when given an empty array []', () => {
      const result = parseHeroBannersList([]);
      expect(result).toEqual([]);
    });

    it('filters out invalid items missing id or imageUrl and sorts by order', () => {
      const input = [
        { id: 'b2', imageUrl: 'https://example.com/2.jpg', title: 'Banner 2', order: 2 },
        { id: 'invalid-missing-image' },
        null,
        'not an object',
        { id: 'b1', imageUrl: 'https://example.com/1.jpg', title: 'Banner 1', order: 1, type: 'featured_concert', linkType: 'concert', eventId: 'evt-1' },
      ];

      const result = parseHeroBannersList(input);
      expect(result).toHaveLength(2);
      expect(result?.[0].id).toBe('b1');
      expect(result?.[0].order).toBe(1);
      expect(result?.[0].type).toBe('featured_concert');
      expect(result?.[0].linkType).toBe('concert');
      expect(result?.[0].eventId).toBe('evt-1');
      expect(result?.[1].id).toBe('b2');
      expect(result?.[1].order).toBe(2);
    });

    it('defaults isActive to true unless explicitly false', () => {
      const input = [
        { id: 'b1', imageUrl: 'https://example.com/1.jpg', isActive: false },
        { id: 'b2', imageUrl: 'https://example.com/2.jpg' },
      ];
      const result = parseHeroBannersList(input);
      expect(result?.[0].isActive).toBe(false);
      expect(result?.[1].isActive).toBe(true);
    });
  });

  describe('readHomeBanners', () => {
    it('returns DEFAULT_HERO_BANNERS when no rows exist in database', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
        release: vi.fn(),
      };
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
        query: vi.fn().mockImplementation((queryText: string) => {
          if (queryText.includes('SELECT data FROM home_hero_banners')) {
            return Promise.resolve({ rowCount: 0, rows: [] });
          }
          return Promise.resolve({ rowCount: 0, rows: [] });
        }),
      } as unknown as Pool;

      const result = await readHomeBanners(mockPool);
      expect(result).toEqual(DEFAULT_HERO_BANNERS);
    });

    it('returns saved banners from the database', async () => {
      const customBanners: HeroBannerItem[] = [
        {
          id: 'custom-1',
          type: 'custom',
          title: 'Mobile Concert 2026',
          imageUrl: 'https://example.com/mobile.jpg',
          linkType: 'none',
          order: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const mockClient = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
        release: vi.fn(),
      };
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
        query: vi.fn().mockImplementation((queryText: string) => {
          if (queryText.includes('SELECT data FROM home_hero_banners')) {
            return Promise.resolve({ rowCount: 1, rows: [{ data: customBanners }] });
          }
          return Promise.resolve({ rowCount: 0, rows: [] });
        }),
      } as unknown as Pool;

      const result = await readHomeBanners(mockPool);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('custom-1');
      expect(result[0].title).toBe('Mobile Concert 2026');
    });

    it('returns empty array [] when all banners are deleted (does not fall back to default)', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
        release: vi.fn(),
      };
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
        query: vi.fn().mockImplementation((queryText: string) => {
          if (queryText.includes('SELECT data FROM home_hero_banners')) {
            return Promise.resolve({ rowCount: 1, rows: [{ data: [] }] });
          }
          return Promise.resolve({ rowCount: 0, rows: [] });
        }),
      } as unknown as Pool;

      const result = await readHomeBanners(mockPool);
      expect(result).toEqual([]);
    });

    it('returns DEFAULT_HERO_BANNERS on query error', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
        release: vi.fn(),
      };
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
        query: vi.fn().mockRejectedValue(new Error('DB Connection lost')),
      } as unknown as Pool;

      const result = await readHomeBanners(mockPool);
      expect(result).toEqual(DEFAULT_HERO_BANNERS);
    });
  });

  describe('writeHomeBanners', () => {
    it('saves sorted banners with upsert query', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
        release: vi.fn(),
      };
      const queryMock = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
        query: queryMock,
      } as unknown as Pool;

      const bannersToWrite: HeroBannerItem[] = [
        {
          id: 'b2',
          type: 'custom',
          imageUrl: 'https://example.com/2.jpg',
          order: 2,
          isActive: true,
          linkType: 'none',
          createdAt: '2026-11-01',
          updatedAt: '2026-11-01',
        },
        {
          id: 'b1',
          type: 'custom',
          imageUrl: 'https://example.com/1.jpg',
          order: 1,
          isActive: true,
          linkType: 'none',
          createdAt: '2026-11-01',
          updatedAt: '2026-11-01',
        },
      ];

      await writeHomeBanners(mockPool, bannersToWrite);

      expect(queryMock).toHaveBeenCalled();
      const insertCall = queryMock.mock.calls.find(call =>
        (call[0] as string).includes('INSERT INTO home_hero_banners'),
      );
      expect(insertCall).toBeDefined();
      const payload = JSON.parse(insertCall?.[1]?.[0] as string);
      expect(payload[0].id).toBe('b1');
      expect(payload[1].id).toBe('b2');
    });
  });
});

