import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 500;
test.beforeEach(async ({ context }, testInfo) => {
  const offset = testInfo.project.name === 'desktop-chromium' ? 0 : 50;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${offset + nextIp++}` });
});

test('organizer views policies and agreements, filters categories and searches terms', async ({
  page,
}, testInfo) => {
  // 1. Organizer logs in
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/organizer');

  // 2. Open policies section
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByTestId('organizer-mobile-menu-toggle').click();
  }
  await page.getByTestId('organizer-nav-policies').click();

  // 3. Verify header and print CTA
  await expect(
    page.getByRole('heading', { name: 'ข้อตกลงและเงื่อนไขการให้บริการสำหรับผู้จัดงาน' }),
  ).toBeVisible();
  await expect(page.getByTestId('policies-print-btn')).toBeVisible();

  // 4. Verify all 4 policy cards initially present
  await expect(page.getByTestId('policy-card-finance')).toBeVisible();
  await expect(page.getByTestId('policy-card-amendment')).toBeVisible();
  await expect(page.getByTestId('policy-card-scanning')).toBeVisible();
  await expect(page.getByTestId('policy-card-legal')).toBeVisible();

  // 5. Test category filter: finance
  await page.getByTestId('policy-tab-finance').click();
  await expect(page.getByTestId('policy-card-finance')).toBeVisible();
  await expect(page.getByTestId('policy-card-amendment')).not.toBeVisible();
  await expect(page.getByTestId('policy-card-scanning')).not.toBeVisible();
  await expect(page.getByTestId('policy-card-legal')).not.toBeVisible();

  // Test category filter: scanning
  const scanningTab = page.getByTestId('policy-tab-scanning');
  await scanningTab.scrollIntoViewIfNeeded();
  await scanningTab.click();
  await expect(page.getByTestId('policy-card-scanning')).toBeVisible();
  await expect(page.getByTestId('policy-card-finance')).not.toBeVisible();

  // Reset to all
  const allTab = page.getByTestId('policy-tab-all');
  await allTab.scrollIntoViewIfNeeded();
  await allTab.click();
  await expect(page.getByTestId('policy-card-finance')).toBeVisible();
  await expect(page.getByTestId('policy-card-amendment')).toBeVisible();
  await expect(page.getByTestId('policy-card-scanning')).toBeVisible();
  await expect(page.getByTestId('policy-card-legal')).toBeVisible();

  // 6. Test search bar
  const searchInput = page.getByTestId('policies-search-input');
  await searchInput.fill('PDPA');
  await expect(page.getByTestId('policy-card-legal')).toBeVisible();
  await expect(page.getByTestId('policy-card-finance')).not.toBeVisible();

  // Test empty state
  await searchInput.fill('คำค้นหาที่ไม่มีอยู่จริงxyz999');
  await expect(page.getByTestId('policy-empty-state')).toBeVisible();
  await expect(page.getByText('ไม่พบข้อตกลงที่ตรงกับคำค้นหา')).toBeVisible();

  // Clear search via empty state clear button
  await page.getByTestId('policy-empty-state').getByRole('button', { name: 'ล้างคำค้นหา' }).click();
  await expect(page.getByTestId('policy-card-finance')).toBeVisible();
  await expect(page.getByTestId('policy-card-legal')).toBeVisible();

  // 7. Test D-112: Expand/Collapse full terms
  const financeTerms = page.getByTestId('policy-terms-finance');
  await expect(financeTerms).not.toBeVisible();
  await page.getByTestId('policy-toggle-finance').click();
  await expect(financeTerms).toBeVisible();
  await page.getByTestId('policy-toggle-finance').click();
  await expect(financeTerms).not.toBeVisible();
});
