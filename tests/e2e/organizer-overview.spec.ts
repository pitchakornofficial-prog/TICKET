import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 700;
test.beforeEach(async ({ context }, testInfo) => {
  const offset = testInfo.project.name === 'desktop-chromium' ? 0 : 50;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${offset + nextIp++}` });
});

test('organizer views overview workspace, inspects KPIs, banners, active concerts, and uses launchpads', async ({
  page,
}, testInfo) => {
  // 1. Organizer logs in
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/organizer');

  // 2. Overview is the default active section
  await expect(page.getByTestId('organizer-overview-view')).toBeVisible();

  // 3. Verify header and action buttons
  await expect(
    page.getByRole('heading', { name: 'ภาพรวมระบบผู้จัดงาน' }),
  ).toBeVisible();
  await expect(page.getByTestId('overview-create-event-btn')).toBeVisible();
  await expect(page.getByTestId('overview-refresh-btn')).toBeVisible();

  // 4. Verify 4 KPI summary cards
  await expect(page.getByTestId('overview-kpi-events')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-tickets')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-revenue')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-scanners')).toBeVisible();

  // 5. Verify system status banner
  const statusBanner = page.locator('.overview-attention-banner');
  await expect(statusBanner).toBeVisible();

  // 6. Verify 4 Launchpad shortcut cards
  await expect(page.getByTestId('launchpad-finance')).toBeVisible();
  await expect(page.getByTestId('launchpad-scanners')).toBeVisible();
  await expect(page.getByTestId('launchpad-policies')).toBeVisible();
  await expect(page.getByTestId('launchpad-contact')).toBeVisible();

  // 7. Click Launchpad Finance shortcut -> navigates to finance section
  await page.getByTestId('launchpad-finance').click();
  await expect(
    page.getByRole('heading', { name: 'รายงานการเงินและยอดรับเงิน' }),
  ).toBeVisible();

  // 8. Return to overview via nav tab
  if (testInfo.project.name === 'mobile-chromium') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId('organizer-mobile-menu-toggle').click();
  }
  await page.getByTestId('organizer-nav-overview').click();
  await expect(page.getByTestId('organizer-overview-view')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'ภาพรวมระบบผู้จัดงาน' }),
  ).toBeVisible();
});
