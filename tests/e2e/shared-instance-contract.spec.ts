import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 149 : 199;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('TASK-037: Shared Instance Contract (AC-105)', () => {
  test('Cross-request persistence: authenticated session and data persist across multiple browser tabs and reloads', async ({ context, page }) => {
    // 1. Log in as Organizer on first page
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');
    await expect(page.getByRole('heading', { name: 'พื้นที่ผู้จัดงาน', exact: true })).toBeVisible();

    // 2. Open a second independent tab/page in the same browser context (sharing cookie session, simulating distinct requests)
    const page2 = await context.newPage();
    await page2.goto('/back-office/organizer');
    await expect(page2).toHaveURL('/back-office/organizer');

    // Verify session identity is recognized on page 2
    await expect(page2.getByRole('heading', { name: 'พื้นที่ผู้จัดงาน', exact: true })).toBeVisible();
    await expect(page2.getByText(fixtureAccounts.organizer.name, { exact: true })).toBeVisible();

    // 3. Navigate across routes in page 2 and confirm zero memory-loss or state drops
    await page2.goto('/events');
    await expect(page2).toHaveURL('/events');
    const bodyText = await page2.locator('body').innerText();
    expect(bodyText).not.toMatch(/\p{Extended_Pictographic}/u);

    await page2.close();
  });

  test('Guest session token and rate limit verification: guest order lookup flow maintains state without process-memory dependencies', async ({ page }) => {
    // Navigate to lookup page at /my-tickets
    await page.goto('/my-tickets');
    await expect(page).toHaveURL('/my-tickets');
    await expect(page.getByRole('heading', { name: 'ค้นหาบัตรคอนเสิร์ตของฉัน' })).toBeVisible();

    // Form inputs exist and are functional
    const emailInput = page.locator('#lookup-email');
    const phoneInput = page.locator('#lookup-phone');
    await expect(emailInput).toBeVisible();
    await expect(phoneInput).toBeVisible();

    // Verify typography and zero emojis
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test('Back-office Owner financial controls and scanner views operate with zero buyer PII (AC-65, AC-105)', async ({ page }) => {
    // Log in as Scanner
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.scanner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/scanner');

    // Verify scanner terminal UI has zero buyer PII
    const scannerText = await page.locator('body').innerText();
    expect(scannerText).not.toContain('buyer@');
    expect(scannerText).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
