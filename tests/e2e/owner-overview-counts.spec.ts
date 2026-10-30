import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 190 : 230;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 30)}` });
});

test.describe('Owner Overview Counts Dashboard (TASK-039, AC-115, D-17)', () => {
  test('Owner views pending action items overview cards and navigates to target section on card click', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // 1. Log in as owner
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    // 2. Overview Dashboard is visible at top of workspace
    const overviewDashboard = page.locator('[data-testid="owner-overview-dashboard"]');
    await expect(overviewDashboard).toBeVisible();
    await expect(page.locator('#owner-overview-title')).toContainText('ภาพรวมงานค้างที่ต้องดำเนินการ (Overview)');

    // Total pending badge is present
    const totalBadge = page.locator('[data-testid="overview-total-badge"]');
    await expect(totalBadge).toBeVisible();

    // 3. All 5 metric cards are displayed
    const cardSessions = page.locator('[data-testid="overview-card-pending-sessions"]');
    const cardRefunds = page.locator('[data-testid="overview-card-pending-refunds"]');
    const cardPayments = page.locator('[data-testid="overview-card-payment-exceptions"]');
    const cardEmails = page.locator('[data-testid="overview-card-failed-emails"]');
    const cardConflicts = page.locator('[data-testid="overview-card-sync-conflicts"]');

    await expect(cardSessions).toBeVisible();
    await expect(cardRefunds).toBeVisible();
    await expect(cardPayments).toBeVisible();
    await expect(cardEmails).toBeVisible();
    await expect(cardConflicts).toBeVisible();

    // Counts elements are visible with numbers
    await expect(page.locator('[data-testid="overview-count-pending-sessions"]')).toBeVisible();
    await expect(page.locator('[data-testid="overview-count-pending-refunds"]')).toBeVisible();
    await expect(page.locator('[data-testid="overview-count-payment-exceptions"]')).toBeVisible();
    await expect(page.locator('[data-testid="overview-count-failed-emails"]')).toBeVisible();
    await expect(page.locator('[data-testid="overview-count-sync-conflicts"]')).toBeVisible();

    // 4. Test Card Navigation: Clicking "payment-exceptions" jumps to Finance section
    await cardPayments.click();
    await expect(page.locator('[data-testid="owner-section-content-finance"]')).toBeVisible();
    await expect(page.locator('[data-testid="owner-payment-recovery-manager"]')).toBeVisible();

    // 5. Clicking "failed-emails" jumps to Customer section
    await cardEmails.click();
    await expect(page.locator('[data-testid="owner-section-content-customer"]')).toBeVisible();
    await expect(page.locator('#email-deliveries-title')).toBeVisible();

    // 6. Clicking "sync-conflicts" jumps to System section
    await cardConflicts.click();
    await expect(page.locator('[data-testid="owner-section-content-system"]')).toBeVisible();
    await expect(page.locator('[data-testid="owner-sync-conflicts-manager"]')).toBeVisible();

    // 7. Clicking "pending-sessions" jumps back to Approval section
    await cardSessions.click();
    await expect(page.locator('[data-testid="owner-section-content-approval"]')).toBeVisible();
    await expect(page.locator('#owner-session-approval-manager')).toBeVisible();

    // 8. Refresh button reloads overview counts
    const refreshBtn = page.locator('[data-testid="overview-refresh-btn"]');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await expect(page.locator('[data-testid="overview-total-badge"]')).toBeVisible();
  });
});
