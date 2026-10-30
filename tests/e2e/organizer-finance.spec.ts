import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 600;
test.beforeEach(async ({ context }, testInfo) => {
  const offset = testInfo.project.name === 'desktop-chromium' ? 0 : 50;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${offset + nextIp++}` });
});

test('organizer views financial reports and payouts workspace, switches tabs, and checks KPIs', async ({
  page,
}, testInfo) => {
  // 1. Organizer logs in
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/organizer');

  // 2. Open finance section
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByTestId('organizer-mobile-menu-toggle').click();
  }
  await page.getByTestId('organizer-nav-finance').click();

  // 3. Verify header and utility buttons
  await expect(
    page.getByRole('heading', { name: 'รายงานการเงินและยอดรับเงิน' }),
  ).toBeVisible();
  await expect(page.getByTestId('finance-print-btn')).toBeVisible();
  await expect(page.getByTestId('finance-refresh-btn')).toBeVisible();

  // 4. Verify 4 KPI summary cards
  await expect(page.getByTestId('finance-kpi-gross')).toBeVisible();
  await expect(page.getByTestId('finance-kpi-fees')).toBeVisible();
  await expect(page.getByTestId('finance-kpi-payable')).toBeVisible();
  await expect(page.getByTestId('finance-kpi-paidout')).toBeVisible();

  // 5. Verify Breakdown tab is active initially
  const breakdownTab = page.getByTestId('finance-tab-breakdown');
  const payoutsTab = page.getByTestId('finance-tab-payouts');
  await expect(breakdownTab).toHaveClass(/is-active/);
  await expect(page.getByTestId('finance-breakdown-view')).toBeVisible();

  // 6. Test concert selector button
  const selectorBtn = page.getByTestId('finance-concert-selector-btn');
  await expect(selectorBtn).toBeVisible();

  // 7. Switch to Payouts tab
  await payoutsTab.click();
  await expect(payoutsTab).toHaveClass(/is-active/);
  await expect(page.getByTestId('finance-payouts-view')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'ประวัติการโอนเงินเข้าบัญชี (Payout History)' }),
  ).toBeVisible();

  // Switch back to Breakdown tab
  await breakdownTab.click();
  await expect(breakdownTab).toHaveClass(/is-active/);
  await expect(page.getByTestId('finance-breakdown-view')).toBeVisible();
});
