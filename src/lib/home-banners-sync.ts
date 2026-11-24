// Home Hero Banners Synchronization and Store (Q1A, Q2A, Q3A, Q4A)
// Homepage displays pure panoramic graphic banner without overlay text or buttons.

export type BannerType = 'featured_concert' | 'custom';
export type BannerLinkType = 'concert' | 'custom_url' | 'none';

export interface HeroBannerItem {
  id: string;
  type: BannerType;
  title?: string; // internal reference name for admin back-office
  imageUrl: string;
  linkType: BannerLinkType;
  eventId?: string;
  eventTitle?: string;
  customUrl?: string;
  order: number;
  isActive: boolean;
  startAt?: string | null;
  endAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const STORAGE_KEY_HOME_BANNERS = 'ticket_home_hero_banners';
export const EVENT_HOME_BANNERS_CHANGED = 'ticket:home-banners-changed';

export const DEFAULT_HERO_BANNERS: HeroBannerItem[] = [
  {
    id: 'banner-01',
    type: 'featured_concert',
    title: 'Rock Rimmool Live Festival 2026',
    imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80',
    linkType: 'concert',
    eventId: 'evt_rock_rimmool_2026',
    eventTitle: 'Rock Rimmool Live Festival 2026',
    order: 1,
    isActive: true,
    startAt: null,
    endAt: null,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'banner-02',
    type: 'featured_concert',
    title: 'Isan Folk & Acoustic Night 2026',
    imageUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1600&q=80',
    linkType: 'concert',
    eventId: 'evt_isan_folk_2026',
    eventTitle: 'Isan Folk & Acoustic Night 2026',
    order: 2,
    isActive: true,
    startAt: null,
    endAt: null,
    createdAt: '2026-11-02T09:00:00.000Z',
    updatedAt: '2026-11-02T09:00:00.000Z',
  },
  {
    id: 'banner-03',
    type: 'custom',
    title: 'UBU Freshy Festival 2026',
    imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1600&q=80',
    linkType: 'concert',
    eventId: 'evt_ubu_freshy_2026',
    eventTitle: 'UBU Freshy Music Fest 2026',
    order: 3,
    isActive: true,
    startAt: null,
    endAt: null,
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
  },
];

/**
 * Filter banners that are currently active and within schedule window
 */
export function isBannerScheduleActive(banner: HeroBannerItem, now = new Date()): boolean {
  if (!banner.isActive) return false;
  const currentTime = now.getTime();
  if (banner.startAt) {
    const startTime = new Date(banner.startAt).getTime();
    if (currentTime < startTime) return false;
  }
  if (banner.endAt) {
    const endTime = new Date(banner.endAt).getTime();
    if (currentTime > endTime) return false;
  }
  return true;
}

/**
 * Load all hero banners from storage, with default fallbacks
 */
export function loadHomeBanners(): HeroBannerItem[] {
  if (typeof window === 'undefined') {
    return DEFAULT_HERO_BANNERS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HOME_BANNERS);
    if (!raw) return DEFAULT_HERO_BANNERS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.sort((a, b) => a.order - b.order);
    }
    return DEFAULT_HERO_BANNERS;
  } catch {
    return DEFAULT_HERO_BANNERS;
  }
}

/**
 * Fetch banners from the central database API and update local cache
 */
export async function loadSharedHomeBanners(): Promise<HeroBannerItem[]> {
  try {
    const res = await fetch('/api/public/banners', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.banners)) {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY_HOME_BANNERS, JSON.stringify(data.banners));
          } catch {
            // ignore
          }
        }
        return data.banners;
      }
    }
  } catch {
    // fallback to local
  }
  return loadHomeBanners();
}

/**
 * Save hero banners list to storage and broadcast change event
 */
export function saveHomeBanners(banners: HeroBannerItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    const sorted = [...banners].sort((a, b) => a.order - b.order);
    localStorage.setItem(STORAGE_KEY_HOME_BANNERS, JSON.stringify(sorted));
    window.dispatchEvent(new CustomEvent(EVENT_HOME_BANNERS_CHANGED, { detail: sorted }));
  } catch (error) {
    console.warn('Failed to save home hero banners to storage', error);
  }
}

/**
 * Save hero banners to central database and broadcast change event across all devices
 */
export async function saveSharedHomeBanners(banners: HeroBannerItem[]): Promise<void> {
  const sorted = [...banners].sort((a, b) => a.order - b.order);
  saveHomeBanners(sorted);

  const res = await fetch('/api/owner/banners', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ banners: sorted }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'บันทึกแบนเนอร์ไม่สำเร็จ');
  }
}

/**
 * Reset hero banners back to initial default configuration
 */
export function resetHomeBanners(): HeroBannerItem[] {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY_HOME_BANNERS);
      window.dispatchEvent(new CustomEvent(EVENT_HOME_BANNERS_CHANGED, { detail: DEFAULT_HERO_BANNERS }));
    } catch (error) {
      console.warn('Failed to reset home banners', error);
    }
  }
  return DEFAULT_HERO_BANNERS;
}
