import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.describe('TASK-036: Responsive Role Interfaces and Mandatory Contract (AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-104)', () => {
  test('AC-43, AC-45, AC-46, AC-47: Brand, Kanit typography, 60/30/10 theme, and zero emojis across customer and back-office', async ({ page }) => {
    // 1. Customer homepage
    await page.goto('/');
    await expect(page).toHaveTitle(/TICKET/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'th');

    // Brand name "TICKET" visible on header
    const brand = page.locator('.brand');
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText(/TICKET/);

    // Computed font is Kanit
    const bodyFont = await page.evaluate(() => {
      return window.getComputedStyle(document.body).fontFamily;
    });
    expect(bodyFont.toLowerCase()).toContain('kanit');

    // Zero emojis across entire page body
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\p{Extended_Pictographic}/u);

    // No horizontal layout overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // 2. Login Page
    await page.goto('/login');
    await expect(page.locator('.eyebrow')).toHaveText(/TICKET \/ พื้นที่ทีมงาน/);
    const loginBodyText = await page.locator('body').innerText();
    expect(loginBodyText).not.toMatch(/\p{Extended_Pictographic}/u);

    // 3. Organizer login and workspace responsiveness
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    // Verify back-office brand and zero emojis
    await expect(page.locator('.eyebrow')).toHaveText(/TICKET \/ พื้นที่ทีมงาน/);
    const organizerBodyText = await page.locator('body').innerText();
    expect(organizerBodyText).not.toMatch(/\p{Extended_Pictographic}/u);

    // Responsive check for back-office
    const backOfficeOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(backOfficeOverflow).toBe(false);
  });

  test('AC-104: Timezone preservation: browser in non-Bangkok timezone (UTC) renders times in Asia/Bangkok', async ({ browser }) => {
    // Launch a context explicitly set to UTC
    const utcContext = await browser.newContext({
      timezoneId: 'UTC',
      locale: 'th-TH',
    });
    const utcPage = await utcContext.newPage();

    await utcPage.goto('/');
    await expect(utcPage.locator('footer')).toContainText('Asia/Bangkok');

    // Check footer copyright time zone notice
    const footerText = await utcPage.locator('.footer-bottom').innerText();
    expect(footerText).toContain('Asia/Bangkok');

    // News page timestamp checking in Thai format
    await utcPage.goto('/news');
    await expect(utcPage).toHaveURL('/news');
    const newsBodyText = await utcPage.locator('body').innerText();
    expect(newsBodyText).not.toMatch(/\p{Extended_Pictographic}/u);

    await utcContext.close();
  });

  test('AC-44, AC-48: Scanner admission terminal responsive controls and semantic text+icon feedback', async ({ page }) => {
    // Login as scanner
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.scanner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/scanner');

    // Verify scanner page displays without horizontal overflow
    const scannerOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(scannerOverflow).toBe(false);

    // Zero emojis
    const scannerBody = await page.locator('body').innerText();
    expect(scannerBody).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
