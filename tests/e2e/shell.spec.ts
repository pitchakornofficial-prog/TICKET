import { expect, test } from '@playwright/test';

test('Thai TICKET shell is readable and honest about not yet selling tickets', async ({ page }, testInfo) => {
  const failures: string[] = [];
  const loadedThaiFonts: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.request().resourceType() === 'font' && response.ok() && response.url().includes('kanit-thai')) {
      loadedThaiFonts.push(response.url());
    }
  });
  await page.goto('/');
  await expect(page).toHaveTitle('TICKET — บัตรคอนเสิร์ต');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('link', { name: 'TICKET หน้าแรก' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ความทรงจำครั้งใหม่');
  await expect(page.getByRole('heading', { name: 'กำลังเตรียมเปิดให้บริการ' })).toBeVisible();
  await expect(page.getByText('ยังไม่เปิดจำหน่ายบัตรในขณะนี้')).toBeVisible();
  await expect(page.getByRole('button', { name: /ซื้อ|ชำระ/ })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 16px Kanit', 'บัตรคอนเสิร์ต'))).toBe(true);
  expect(await page.evaluate(() => [...document.fonts].some(font => font.family.replaceAll(/["']/g, '') === 'Kanit' && font.status === 'loaded'))).toBe(true);
  expect(loadedThaiFonts.some(url => new URL(url).origin === 'http://127.0.0.1:3100')).toBe(true);
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Kanit');
  expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(await page.locator('header svg').count()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'ข้ามไปเนื้อหาหลัก' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.getByRole('link', { name: 'TICKET หน้าแรก' }).click();
  await expect(page).toHaveURL('/');
  expect(failures).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('shell.png'), fullPage: true });
});
