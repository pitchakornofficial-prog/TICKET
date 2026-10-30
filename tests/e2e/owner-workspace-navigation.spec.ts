import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 180 : 220;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 30)}` });
});

test.describe('Owner Workspace 4-Section Navigation & Responsive Layout (TASK-038, AC-116, D-15, D-16, D-18, D-19)', () => {
  test('Owner workspace shows 4 sections in sidebar, renders only active section, and switches smoothly', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60000);

    // 1. Log in as owner
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    // Heading and owner info must remain visible
    await expect(page.getByRole('heading', { name: 'พื้นที่เจ้าของเว็บ', exact: true })).toBeVisible();
    await expect(page.getByText(fixtureAccounts.owner.name, { exact: true })).toBeVisible();

    const isMobile = testInfo.project.name === 'mobile-chromium';

    if (isMobile) {
      // Mobile toggle button should be visible (D-19)
      const mobileToggle = page.locator('[data-testid="owner-mobile-menu-toggle"]');
      await expect(mobileToggle).toBeVisible();
      await expect(mobileToggle).toContainText('หมวดหมู่: อนุมัติ');

      // Default active section is Approval:
      await expect(page.locator('[data-testid="owner-section-content-approval"]')).toBeVisible();
      await expect(page.locator('#owner-refund-approval-manager')).toBeVisible();

      // Open mobile menu
      await mobileToggle.click();

      // Switch to Finance
      await page.locator('[data-testid="owner-nav-finance"]').click();
      await expect(page.locator('[data-testid="owner-section-content-finance"]')).toBeVisible();
      await expect(page.locator('[data-testid="owner-section-content-approval"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="owner-weekly-payout-manager"]')).toBeVisible();

      // Ensure no horizontal document overflow
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    } else {
      // Desktop: All 4 nav items visible in sidebar (D-15, D-16)
      const navApproval = page.locator('[data-testid="owner-nav-approval"]');
      const navFinance = page.locator('[data-testid="owner-nav-finance"]');
      const navCustomer = page.locator('[data-testid="owner-nav-customer"]');
      const navSystem = page.locator('[data-testid="owner-nav-system"]');

      await expect(navApproval).toBeVisible();
      await expect(navFinance).toBeVisible();
      await expect(navCustomer).toBeVisible();
      await expect(navSystem).toBeVisible();

      // Section 1: Approval (Default active)
      await expect(navApproval).toHaveClass(/active/);
      await expect(page.locator('[data-testid="owner-section-content-approval"]')).toBeVisible();
      await expect(page.locator('#owner-refund-approval-manager')).toBeVisible();
      // Other managers must NOT be rendered in approval section
      await expect(page.locator('[data-testid="owner-weekly-payout-manager"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="owner-sync-conflicts-manager"]')).not.toBeVisible();

      // Section 2: Switch to Finance
      await navFinance.click();
      await expect(navFinance).toHaveClass(/active/);
      await expect(page.locator('[data-testid="owner-section-content-finance"]')).toBeVisible();
      await expect(page.locator('#owner-refund-approval-manager')).not.toBeVisible();
      await expect(page.locator('[data-testid="owner-weekly-payout-manager"]')).toBeVisible();
      await expect(page.locator('[data-testid="owner-debt-repayment-manager"]')).toBeVisible();

      // Section 3: Switch to Customer
      await navCustomer.click();
      await expect(navCustomer).toHaveClass(/active/);
      await expect(page.locator('[data-testid="owner-section-content-customer"]')).toBeVisible();
      await expect(page.locator('[data-testid="owner-weekly-payout-manager"]')).not.toBeVisible();
      await expect(page.getByRole('heading', { name: 'แก้ไขข้อมูลติดต่อคำสั่งซื้อที่ชำระแล้ว (AC-76, G-24)' })).toBeVisible();

      // Section 4: Switch to System
      await navSystem.click();
      await expect(navSystem).toHaveClass(/active/);
      await expect(page.locator('[data-testid="owner-section-content-system"]')).toBeVisible();
      await expect(page.locator('[data-testid="owner-sync-conflicts-manager"]')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'เชิญผู้จัดงานใหม่' })).toBeVisible();

      // Switch back to Approval
      await navApproval.click();
      await expect(navApproval).toHaveClass(/active/);
      await expect(page.locator('[data-testid="owner-section-content-approval"]')).toBeVisible();
    }
  });
});
