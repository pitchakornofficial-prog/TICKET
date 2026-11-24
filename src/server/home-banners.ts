import type { Pool } from 'pg';
import { inTransaction } from './database.ts';
import {
  DEFAULT_HERO_BANNERS,
  type HeroBannerItem,
} from '../lib/home-banners-sync.ts';

export async function ensureHomeBannersSchema(pool: Pool): Promise<void> {
  await inTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [945162037]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS home_hero_banners (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
        data JSONB NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  });
}

export function parseHeroBannersList(input: unknown): HeroBannerItem[] | null {
  if (!Array.isArray(input)) return null;
  const items: HeroBannerItem[] = [];

  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    if (typeof b.id !== 'string' || typeof b.imageUrl !== 'string') continue;

    items.push({
      id: b.id,
      type: b.type === 'featured_concert' ? 'featured_concert' : 'custom',
      title: typeof b.title === 'string' ? b.title : undefined,
      imageUrl: b.imageUrl,
      linkType:
        b.linkType === 'concert'
          ? 'concert'
          : b.linkType === 'custom_url'
            ? 'custom_url'
            : 'none',
      eventId: typeof b.eventId === 'string' ? b.eventId : undefined,
      eventTitle: typeof b.eventTitle === 'string' ? b.eventTitle : undefined,
      customUrl: typeof b.customUrl === 'string' ? b.customUrl : undefined,
      order: typeof b.order === 'number' ? b.order : 0,
      isActive: b.isActive !== false,
      startAt: typeof b.startAt === 'string' ? b.startAt : null,
      endAt: typeof b.endAt === 'string' ? b.endAt : null,
      createdAt: typeof b.createdAt === 'string' ? b.createdAt : new Date().toISOString(),
      updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : new Date().toISOString(),
    });
  }

  return items.sort((a, b) => a.order - b.order);
}

export async function readHomeBanners(pool: Pool): Promise<HeroBannerItem[]> {
  try {
    await ensureHomeBannersSchema(pool);
    const result = await pool.query('SELECT data FROM home_hero_banners WHERE id = TRUE');
    if (result.rows[0]) {
      const parsed = parseHeroBannersList(result.rows[0].data);
      if (parsed !== null) return parsed;
    }
  } catch (err) {
    console.warn('Failed to read home_hero_banners from database, using defaults:', err);
  }
  return DEFAULT_HERO_BANNERS;
}

export async function writeHomeBanners(pool: Pool, banners: HeroBannerItem[]): Promise<void> {
  await ensureHomeBannersSchema(pool);
  const sorted = [...banners].sort((a, b) => a.order - b.order);
  await pool.query(
    `INSERT INTO home_hero_banners (id, data, "updatedAt")
     VALUES (TRUE, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now()`,
    [JSON.stringify(sorted)],
  );
}
