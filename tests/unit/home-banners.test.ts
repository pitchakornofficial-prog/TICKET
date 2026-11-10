import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_HERO_BANNERS,
  isBannerScheduleActive,
  loadHomeBanners,
  saveHomeBanners,
  resetHomeBanners,
  STORAGE_KEY_HOME_BANNERS,
  type HeroBannerItem,
} from '../../src/lib/home-banners-sync';

class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string) {
    this.store[key] = value;
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('Home Hero Banners Sync & Filtering (Q1A, Q2A, Q3A, Q4A)', () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as unknown as { localStorage: unknown }).localStorage = mockStorage;
    (globalThis as unknown as { window: unknown }).window = {
      dispatchEvent: () => true,
      localStorage: mockStorage,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage;
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it('provides rich default banners with valid structure and ordering', () => {
    expect(DEFAULT_HERO_BANNERS.length).toBeGreaterThanOrEqual(3);
    const first = DEFAULT_HERO_BANNERS[0];
    expect(first.id).toBe('banner-01');
    expect(first.type).toBe('featured_concert');
    expect(first.linkType).toBe('concert');
    expect(first.isActive).toBe(true);
    expect(first.order).toBe(1);

    // Verify ordering sequence
    for (let i = 0; i < DEFAULT_HERO_BANNERS.length; i++) {
      expect(DEFAULT_HERO_BANNERS[i].order).toBe(i + 1);
    }
  });

  describe('isBannerScheduleActive', () => {
    const baseBanner: HeroBannerItem = {
      id: 'test-banner',
      type: 'custom',
      title: 'Special Summer Concert',
      imageUrl: 'https://example.com/banner.jpg',
      linkType: 'none',
      order: 1,
      isActive: true,
      startAt: null,
      endAt: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };

    it('returns true when banner is active with no schedule constraints', () => {
      expect(isBannerScheduleActive(baseBanner)).toBe(true);
    });

    it('returns false immediately when isActive is false', () => {
      const inactive = { ...baseBanner, isActive: false };
      expect(isBannerScheduleActive(inactive)).toBe(false);
    });

    it('handles scheduled start date correctly', () => {
      const scheduled = {
        ...baseBanner,
        startAt: '2026-11-10T00:00:00.000Z',
        endAt: null,
      };

      // Before start time
      const beforeDate = new Date('2026-11-09T23:59:59.000Z');
      expect(isBannerScheduleActive(scheduled, beforeDate)).toBe(false);

      // At or after start time
      const afterDate = new Date('2026-11-10T00:00:01.000Z');
      expect(isBannerScheduleActive(scheduled, afterDate)).toBe(true);
    });

    it('handles scheduled end date correctly', () => {
      const scheduled = {
        ...baseBanner,
        startAt: null,
        endAt: '2026-11-20T23:59:59.000Z',
      };

      // Before end time
      const beforeEnd = new Date('2026-11-20T12:00:00.000Z');
      expect(isBannerScheduleActive(scheduled, beforeEnd)).toBe(true);

      // After end time
      const afterEnd = new Date('2026-11-21T00:00:00.000Z');
      expect(isBannerScheduleActive(scheduled, afterEnd)).toBe(false);
    });

    it('handles both start and end dates', () => {
      const scheduled = {
        ...baseBanner,
        startAt: '2026-11-10T00:00:00.000Z',
        endAt: '2026-11-20T23:59:59.000Z',
      };

      expect(isBannerScheduleActive(scheduled, new Date('2026-11-05T00:00:00.000Z'))).toBe(false);
      expect(isBannerScheduleActive(scheduled, new Date('2026-11-15T00:00:00.000Z'))).toBe(true);
      expect(isBannerScheduleActive(scheduled, new Date('2026-11-25T00:00:00.000Z'))).toBe(false);
    });
  });

  describe('Storage & Sync Methods', () => {
    it('loads default banners when storage is empty', () => {
      const banners = loadHomeBanners();
      expect(banners.length).toBe(DEFAULT_HERO_BANNERS.length);
      expect(banners[0].id).toBe(DEFAULT_HERO_BANNERS[0].id);
    });

    it('saves banners to localStorage and loads them ordered', () => {
      const customBanners: HeroBannerItem[] = [
        {
          id: 'b2',
          type: 'custom',
          title: 'Banner 2',
          imageUrl: 'https://example.com/2.jpg',
          linkType: 'none',
          order: 2,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'b1',
          type: 'featured_concert',
          title: 'Banner 1',
          imageUrl: 'https://example.com/1.jpg',
          linkType: 'concert',
          eventId: 'evt-1',
          order: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      saveHomeBanners(customBanners);
      const loaded = loadHomeBanners();
      expect(loaded.length).toBe(2);
      expect(loaded[0].id).toBe('b1');
      expect(loaded[1].id).toBe('b2');
    });

    it('resets banners back to default', () => {
      mockStorage.setItem(STORAGE_KEY_HOME_BANNERS, JSON.stringify([]));
      const reset = resetHomeBanners();
      expect(reset.length).toBe(DEFAULT_HERO_BANNERS.length);
      expect(mockStorage.getItem(STORAGE_KEY_HOME_BANNERS)).toBeNull();
    });
  });
});
