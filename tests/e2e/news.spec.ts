import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 10 : 80;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('News feature (TASK-008, AC-04)', () => {
  test('owner creates and publishes news, then guest reads news detail', async ({ page }, testInfo) => {
    const newsTitle = `ประกาศด่วน ${testInfo.project.name} เปิดจำหน่ายรอบเสริม`;
    const newsContent = 'เนื่องจากกระแสตอบรับอย่างล้นหลาม ทีมงานขอประกาศเปิดจำหน่ายบัตรคอนเสิร์ตเพิ่มเติม';

    // 1. Owner logs in
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    // 2. Owner workspace has news manager
    await expect(page.getByRole('heading', { name: 'จัดการข่าวสารและประกาศ' })).toBeVisible();

    // 3. Fill and submit news
    await page.getByLabel('หัวข้อข่าว').fill(newsTitle);
    await page.getByLabel('เนื้อหาข่าว').fill(newsContent);
    await page.getByRole('button', { name: 'เผยแพร่ข่าว' }).click();

    // 4. Verify success banner
    await expect(page.getByText('เผยแพร่ข่าวสารเรียบร้อยแล้ว')).toBeVisible();

    // 5. Verify newly created news appears in owner table
    await expect(page.getByRole('cell', { name: newsTitle })).toBeVisible();

    // 6. Sign out
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page).toHaveURL('/login');

    // 7. Guest navigates to /news
    await page.goto('/news');
    await expect(page).toHaveTitle(/ข่าวสารและประกาศ/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ข่าวสารและประกาศ');
    await expect(page.getByRole('heading', { name: newsTitle })).toBeVisible();

    // No emojis on public news page
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // 8. Guest clicks into news detail
    await page.getByRole('link', { name: newsTitle }).click();
    await expect(page).toHaveURL(/\/news\/news_/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(newsTitle);
    await expect(page.getByText(newsContent)).toBeVisible();
    await expect(page.getByText(/เผยแพร่เมื่อ/)).toBeVisible();

    // No emojis on public news detail page
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
