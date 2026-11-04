import { expect, type Page } from '@playwright/test';

// The current event wizard starts with a required session and ticket type.
export async function saveEventDraft(page: Page) {
  await page.getByRole('button', { name: '2. กติกา & รอบการแสดง', exact: true }).click();
  const start = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  await page.getByLabel('วันเวลาเริ่มการแสดง (Show Start) *', { exact: true }).fill(start.toISOString().slice(0, 16));
  await page.getByLabel('วันเวลาสิ้นสุดการแสดง (Show End) *', { exact: true }).fill(end.toISOString().slice(0, 16));
  await page.getByLabel('ชื่อประเภทบัตรหรือโซน', { exact: true }).fill('บัตรทดสอบ');
  await page.getByLabel('ราคาบัตร (บาท)', { exact: true }).fill('1000');
  await page.getByLabel('จำนวนโควตาบัตร (ใบ)', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'บันทึกแบบร่าง', exact: true }).click();
  await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();
}
