import { testClientIp } from '../support/client-context';
import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { join } from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\pitch\\.gemini\\antigravity\\brain\\f3b17a1f-dda0-4cba-b956-acb5931d57f6';

test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test('captures screenshots of pure image homepage banner and owner banner hub', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const isMobile = testInfo.project.name.includes('mobile');
  const suffix = isMobile ? '-mobile.png' : '-desktop.png';

  // 1. Homepage: Pure Graphic Panoramic Banner (No overlay text, no buttons)
  await page.goto('/');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: join(ARTIFACT_DIR, `homepage-pure-banner${suffix}`),
    fullPage: false,
  });

  // 2. Owner Login
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/back-office/);

  // 3. System Hub -> Banners Tab
  await page.goto('/back-office/owner#system');
  await page.waitForTimeout(800);

  // Click on "แบนเนอร์หน้าแรก" tab
  const bannersTab = page.locator('[data-testid="tab-banners"]');
  await expect(bannersTab).toBeVisible();
  await bannersTab.click();
  await page.waitForTimeout(600);

  // Capture Banners Tab List
  await page.screenshot({
    path: join(ARTIFACT_DIR, `owner-system-banners-tab${suffix}`),
    fullPage: true,
  });

  // 4. Open Create/Edit Banner Modal
  const addBannerBtn = page.locator('[data-testid="open-create-banner-modal-btn"]');
  if (await addBannerBtn.isVisible()) {
    await addBannerBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: join(ARTIFACT_DIR, `owner-system-banner-modal${suffix}`),
      fullPage: false,
    });
  }
});
