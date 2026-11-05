import { testClientIp } from '../support/client-context';
import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { join } from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\pitch\\.gemini\\antigravity\\brain\\f3b17a1f-dda0-4cba-b956-acb5931d57f6';

test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test('captures full screenshots of all owner workspace sections', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/owner');
  await expect(page.getByRole('heading', { name: 'พื้นที่เจ้าของเว็บ', exact: true })).toBeVisible();

  // 1. Overview
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(ARTIFACT_DIR, 'owner-01-overview.png'), fullPage: true });

  // 2. Approval section
  await page.goto('/back-office/owner#approval');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(ARTIFACT_DIR, 'owner-02-approval.png'), fullPage: true });

  // 3. Finance section
  await page.goto('/back-office/owner#finance');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(ARTIFACT_DIR, 'owner-03-finance.png'), fullPage: true });

  // 4. Customer section
  await page.goto('/back-office/owner#customer');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(ARTIFACT_DIR, 'owner-04-customer.png'), fullPage: true });

  // 5. System section
  await page.goto('/back-office/owner#system');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(ARTIFACT_DIR, 'owner-05-system.png'), fullPage: true });
});
