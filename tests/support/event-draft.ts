import { expect, type Page } from '@playwright/test';

// Fixture setup changes events through APIs/other contexts. Request a real UI
// refresh instead of depending on the background poll's current interval.
export async function refreshOrganizerEvents(page: Page, approvedEventIds: string[]) {
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/events' && response.request().method() === 'GET',
  );
  await page.getByTestId('events-refresh-btn').click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const data = await response.json() as { events: { id: string; status: string }[] };
  for (const id of approvedEventIds) {
    expect(data.events.find(event => event.id === id)).toMatchObject({ id, status: 'approved' });
  }
}

// The current event wizard starts with a required session and ticket type.
export async function saveEventDraft(page: Page) {
  await page.getByRole('tab', { name: '4. รอบ & โซนบัตร', exact: true }).click();
  const start = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  await page.getByRole('textbox', { name: /^วันเวลาเริ่มการแสดง \(Show Start\)/ }).fill(start.toISOString().slice(0, 16));
  await page.getByRole('textbox', { name: /^วันเวลาสิ้นสุดการแสดง \(Show End\)/ }).fill(end.toISOString().slice(0, 16));
  await page.getByLabel('ชื่อประเภทบัตรหรือโซน', { exact: true }).fill('บัตรทดสอบ');
  await page.getByLabel('ราคาบัตร (บาท)', { exact: true }).fill('1000');
  await page.getByLabel('จำนวนโควตาบัตร (ใบ)', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'บันทึกแบบร่าง', exact: true }).click();
  await expect(page.locator('#create-concert-title')).toBeHidden({ timeout: 15000 });
}
