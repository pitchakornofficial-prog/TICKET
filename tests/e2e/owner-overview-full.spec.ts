import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 240 : 250;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 30)}` });
});

test.describe('Owner Full Overview Workspace & Modern Sub-Nav (D-115)', () => {
  test('Owner navigates to overview tab, inspects platform KPIs, action items, and uses launchpads', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60000);

    // 1. Log in as owner
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const isMobile = testInfo.project.name === 'mobile-chromium';

    // 2. Open Overview section
    if (isMobile) {
      await page.locator('[data-testid="owner-mobile-menu-toggle"]').click();
    }
    await page.locator('[data-testid="owner-nav-overview"]').click();
    await expect(page).toHaveURL(/#overview/);

    // 3. Verify Header and Action Buttons
    await expect(
      page.getByRole('heading', { name: 'ภาพรวมระบบจัดการ (Owner Overview)' }),
    ).toBeVisible();
    await expect(page.locator('[data-testid="owner-overview-invite-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="owner-overview-refresh-btn"]')).toBeVisible();

    // 4. Verify 4 Platform KPI Summary Cards
    await expect(page.locator('[data-testid="owner-kpi-concerts"]')).toBeVisible();
    await expect(page.locator('[data-testid="owner-kpi-pending"]')).toBeVisible();
    await expect(page.locator('[data-testid="owner-kpi-revenue"]')).toBeVisible();
    await expect(page.locator('[data-testid="owner-kpi-system"]')).toBeVisible();

    // 5. Verify 5 Action Items Cards
    await expect(page.locator('[data-testid="overview-card-pending-sessions"]')).toBeVisible();
    await expect(page.locator('[data-testid="overview-card-pending-refunds"]')).toBeVisible();
    await expect(page.locator('[data-testid="overview-card-payment-exceptions"]')).toBeVisible();
    await expect(page.locator('[data-testid="overview-card-failed-emails"]')).toBeVisible();
    await expect(page.locator('[data-testid="overview-card-sync-conflicts"]')).toBeVisible();

    // 6. Verify 4 Launchpad Shortcut Cards
    await expect(page.locator('[data-testid="launchpad-owner-approval"]')).toBeVisible();
    await expect(page.locator('[data-testid="launchpad-owner-finance"]')).toBeVisible();
    await expect(page.locator('[data-testid="launchpad-owner-customer"]')).toBeVisible();
    await expect(page.locator('[data-testid="launchpad-owner-system"]')).toBeVisible();

    // 7. Click Launchpad Approval -> jumps to approval section
    await page.locator('[data-testid="launchpad-owner-approval"]').click();
    await expect(page.locator('[data-testid="owner-section-content-approval"]')).toBeVisible();
    await expect(page.locator('#owner-refund-approval-manager')).toBeVisible();

    // 8. Return to overview
    if (isMobile) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('[data-testid="owner-mobile-menu-toggle"]').click();
    }
    await page.locator('[data-testid="owner-nav-overview"]').click();
    await expect(
      page.getByRole('heading', { name: 'ภาพรวมระบบจัดการ (Owner Overview)' }),
    ).toBeVisible();
  });
});
