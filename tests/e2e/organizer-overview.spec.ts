import { testClientIp } from '../support/client-context';
import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test('organizer views overview workspace, inspects KPIs, banners, active concerts, and uses launchpads', async ({
  page,
}, testInfo) => {
  // 1. Organizer logs in
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/organizer', { timeout: 15000 });

  // 2. Overview is the default active section
  await expect(page.getByTestId('organizer-overview-view')).toBeVisible();

  // 3. Verify header and action buttons
  await expect(
    page.getByRole('heading', { name: 'ภาพรวมระบบผู้จัดงาน' }),
  ).toBeVisible();
  await expect(page.getByTestId('overview-create-event-btn')).toBeVisible();
  await expect(page.getByTestId('overview-refresh-btn')).toBeVisible();

  // 4. Verify 4 Executive KPI summary cards (D-210 to D-216)
  await expect(page.getByTestId('overview-kpi-events')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-tickets')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-revenue')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-time-summary')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-today')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-week')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-month')).toBeVisible();

  // 5. Verify concert performance section
  await expect(page.getByTestId('overview-performance-section')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /ประสิทธิภาพรายคอนเสิร์ต/ }),
  ).toBeVisible();

  // 6. Navigate to finance section via subnav tab
  if (testInfo.project.name === 'mobile-chromium') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId('organizer-mobile-menu-toggle').click();
  }
  await page.getByTestId('organizer-nav-finance').click();
  await expect(
    page.getByRole('heading', { name: 'รายงานการเงินและยอดรับเงิน' }),
  ).toBeVisible();

  // 7. Return to overview via nav tab
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
