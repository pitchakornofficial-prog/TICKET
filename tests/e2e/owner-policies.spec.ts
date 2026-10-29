import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 140 : 180;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 30)}` });
});

test.describe('Owner Platform Governance Policies View (D-116)', () => {
  test('Owner can access policies tab, filter categories, search terms, toggle full terms, and view on mobile', async ({
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

    if (isMobile) {
      // Open mobile menu
      const mobileToggle = page.locator('[data-testid="owner-mobile-menu-toggle"]');
      await expect(mobileToggle).toBeVisible();
      await mobileToggle.click();

      // Click Policies tab
      const navPolicies = page.locator('[data-testid="owner-nav-policies"]');
      await expect(navPolicies).toBeVisible();
      await navPolicies.click();

      // Verify policies view is visible
      const policiesView = page.locator('[data-testid="owner-policies-view"]');
      await expect(policiesView).toBeVisible();
      await expect(page.getByRole('heading', { name: 'นโยบายและกฎบัตรการกำกับดูแลแพลตฟอร์ม' })).toBeVisible();

      // Ensure no horizontal document overflow
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    } else {
      // Desktop: Click Policies tab from sub-nav
      const navPolicies = page.locator('[data-testid="owner-nav-policies"]');
      await expect(navPolicies).toBeVisible();
      await navPolicies.click();
      await expect(navPolicies).toHaveClass(/active/);

      // Verify policies view
      const policiesView = page.locator('[data-testid="owner-policies-view"]');
      await expect(policiesView).toBeVisible();
      await expect(page.getByRole('heading', { name: 'นโยบายและกฎบัตรการกำกับดูแลแพลตฟอร์ม' })).toBeVisible();

      // Print CTA button
      await expect(page.locator('[data-testid="owner-policies-print-btn"]')).toBeVisible();

      // Category tab filter: Reserve fund
      const reserveTab = page.locator('[data-testid="owner-policy-tab-reserve"]');
      await expect(reserveTab).toBeVisible();
      await reserveTab.click();
      await expect(reserveTab).toHaveClass(/is-active/);
      await expect(page.locator('[data-testid="owner-policy-card-reserve"]')).toBeVisible();
      await expect(page.locator('[data-testid="owner-policy-card-governance"]')).not.toBeVisible();

      // Switch back to All
      await page.locator('[data-testid="owner-policy-tab-all"]').click();
      await expect(page.locator('[data-testid="owner-policy-card-governance"]')).toBeVisible();
      await expect(page.locator('[data-testid="owner-policy-card-reserve"]')).toBeVisible();

      // Search functionality
      const searchInput = page.locator('[data-testid="owner-policies-search-input"]');
      await searchInput.fill('สแกนเนอร์');
      await expect(page.locator('[data-testid="owner-policy-card-security"]')).toBeVisible();
      await expect(page.locator('[data-testid="owner-policy-card-reserve"]')).not.toBeVisible();

      // Clear search
      await page.locator('button[aria-label="ล้างคำค้นหา"]').click();
      await expect(page.locator('[data-testid="owner-policy-card-reserve"]')).toBeVisible();

      // Expand / Collapse individual card
      const toggleGovernanceBtn = page.locator('[data-testid="owner-policy-toggle-btn-governance"]');
      await expect(toggleGovernanceBtn).toBeVisible();
      await toggleGovernanceBtn.click();
      const governanceTerms = page.locator('[data-testid="owner-policy-terms-governance"]');
      await expect(governanceTerms).toBeVisible();
      await expect(governanceTerms.getByText('โครงสร้างและอัตราค่าบริการแพลตฟอร์ม (Platform Fee Schedule)')).toBeVisible();

      // Collapse individual card
      await toggleGovernanceBtn.click();
      await expect(page.locator('[data-testid="owner-policy-terms-governance"]')).not.toBeVisible();

      // Expand all button
      const expandAllBtn = page.locator('[data-testid="owner-policies-expand-all-btn"]');
      await expect(expandAllBtn).toBeVisible();
      await expandAllBtn.click();
      await expect(page.locator('[data-testid="owner-policy-terms-governance"]')).toBeVisible();
      await expect(page.locator('[data-testid="owner-policy-terms-reserve"]')).toBeVisible();

      // Collapse all button
      const collapseAllBtn = page.locator('[data-testid="owner-policies-collapse-all-btn"]');
      await expect(collapseAllBtn).toBeVisible();
      await collapseAllBtn.click();
      await expect(page.locator('[data-testid="owner-policy-terms-governance"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="owner-policy-terms-reserve"]')).not.toBeVisible();
    }
  });
});
