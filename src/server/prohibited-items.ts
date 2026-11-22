import type { Pool } from 'pg';
import { inTransaction } from './database.ts';

export interface ProhibitedItemData {
  id: string;
  iconName: 'CameraOffIcon' | 'AlertTriangleIcon' | 'CrossCircleIcon' | 'SparklesIcon' | 'ShieldCheckIcon' | 'InfoIcon';
  title: string;
  desc: string;
}

export const DEFAULT_PROHIBITED_ITEMS: ProhibitedItemData[] = [
  {
    id: 'cameras',
    iconName: 'CameraOffIcon',
    title: 'กล้องและอุปกรณ์บันทึกภาพ',
    desc: 'ไม่อนุญาตให้นำกล้อง DSLR, กล้อง Mirrorless, เลนส์ซูมระยะไกล, ขาตั้งกล้อง, ไม้เซลฟี่ และโดรนเข้าพื้นที่จัดงาน',
  },
  {
    id: 'weapons',
    iconName: 'AlertTriangleIcon',
    title: 'อาวุธและของมีคมทุกชนิด',
    desc: 'ห้ามนำอาวุธปืน, มีดพก, กรรไกร, คัตเตอร์, วัตถุปลายแหลม และสิ่งเทียมอาวุธทุกประเภทเข้าสู่สถานที่จัดงานโดยเด็ดขาด',
  },
  {
    id: 'food',
    iconName: 'CrossCircleIcon',
    title: 'อาหารและเครื่องดื่มภายนอก',
    desc: 'ไม่อนุญาตให้นำอาหารกล่อง, ขนม, ขวดแก้ว, กระป๋องโลหะ หรือเครื่องดื่มแอลกอฮอล์จากภายนอกเข้างาน (มีจุดบริการจำหน่ายภายในงาน)',
  },
  {
    id: 'banners',
    iconName: 'SparklesIcon',
    title: 'ป้ายไฟขนาดใหญ่และเลเซอร์',
    desc: 'ห้ามนำป้ายไฟหรือป้ายผ้าขนาดเกิน A4 (21x29.7 ซม.), ปากกาเลเซอร์พอยเตอร์, โทรโข่ง หรืออุปกรณ์ส่งเสียงรบกวนการแสดง',
  },
  {
    id: 'drugs',
    iconName: 'ShieldCheckIcon',
    title: 'สารเสพติดและวัตถุไวไฟ',
    desc: 'ห้ามนำสารเสพติดทุกประเภท, บุหรี่ไฟฟ้า, น้ำยาบุหรี่ไฟฟ้า, ดอกไม้ไฟ, พลุ, ประทัด และสารเคมีไวไฟเข้าพื้นที่โดยเด็ดขาด',
  },
  {
    id: 'luggage',
    iconName: 'InfoIcon',
    title: 'กระเป๋าขนาดใหญ่และสัมภาระ',
    desc: 'ไม่อนุญาตให้นำกระเป๋าเดินทางขนาดเกิน 40x30 ซม., เก้าอี้พับ, บันไดพับ, ร่มก้านยาวปลายแหลม และสัตว์เลี้ยงทุกชนิดเข้างาน',
  },
];

export async function ensureProhibitedItemsSchema(pool: Pool): Promise<void> {
  await inTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [945162035]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_prohibited_items (
        id TEXT PRIMARY KEY DEFAULT 'global',
        items JSONB NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedBy" TEXT REFERENCES auth_user(id)
      )
    `);
  });
}

export async function readProhibitedItems(pool: Pool, _eventId?: string): Promise<ProhibitedItemData[]> {
  await ensureProhibitedItemsSchema(pool);
  const result = await pool.query<{ items: ProhibitedItemData[] }>(
    'SELECT items FROM site_prohibited_items WHERE id = $1',
    ['global'],
  );
  if (result.rows[0]?.items && Array.isArray(result.rows[0].items) && result.rows[0].items.length > 0) {
    return result.rows[0].items;
  }
  return DEFAULT_PROHIBITED_ITEMS;
}

export async function saveProhibitedItems(
  pool: Pool,
  items: ProhibitedItemData[],
  updatedBy?: string | null,
): Promise<ProhibitedItemData[]> {
  await ensureProhibitedItemsSchema(pool);
  const sanitized = items
    .filter((item) => item.title?.trim())
    .map((item, idx) => ({
      id: item.id || `item-${idx + 1}-${Date.now()}`,
      iconName: item.iconName || 'ShieldCheckIcon',
      title: item.title.trim(),
      desc: (item.desc || '').trim(),
    }));

  await pool.query(
    `INSERT INTO site_prohibited_items (id, items, "updatedAt", "updatedBy")
     VALUES ('global', $1::jsonb, now(), $2)
     ON CONFLICT (id) DO UPDATE SET items = EXCLUDED.items, "updatedAt" = now(), "updatedBy" = EXCLUDED."updatedBy"`,
    [JSON.stringify(sanitized), updatedBy || null],
  );

  return sanitized;
}
