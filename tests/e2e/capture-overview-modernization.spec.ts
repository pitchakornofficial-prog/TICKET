import { testClientIp } from '../support/client-context';
import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { join } from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\pitch\\.gemini\\antigravity\\brain\\f3b17a1f-dda0-4cba-b956-acb5931d57f6';

test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test('captures high-res screenshots of redesigned owner overview', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const isMobile = testInfo.project.name.includes('mobile');
  const suffix = isMobile ? '-mobile.png' : '-desktop.png';

  // 1. Log in
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/back-office/);

  // 2. Navigate to Overview
  await page.goto('/back-office/owner#overview');
  await page.waitForTimeout(1000);

  // Screenshot 1: Default overview (Line Chart + Top 5 Concerts + Live Activity Feed)
  await page.screenshot({
    path: join(ARTIFACT_DIR, `owner-01-overview-redesign${suffix}`),
    fullPage: true,
  });

  // Switch to Bar Chart
  const barChartTab = page.getByRole('tab', { name: /กราฟแท่งเปรียบเทียบรายคอนเสิร์ต/ });
  if (await barChartTab.isVisible()) {
    await barChartTab.click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: join(ARTIFACT_DIR, `owner-01-overview-barchart${suffix}`),
      fullPage: true,
    });
  }
});
