import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 140 : 190;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Event fee settings and reserve percentages (TASK-010, AC-23, AC-24, AC-25, AC-29)', () => {
  test('owner configures organizer fee, customer fee, and reserve percentage, and settings persist', async ({
    page,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ตตั้งค่าบริการ ${testInfo.project.name}`;

    // 1. Organizer logs in to create an event
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค อารีน่า เมืองทองธานี');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    // Organizer logs out
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page).toHaveURL('/login');

    // 2. Owner logs in
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    // 3. Owner views fee settings section
    await expect(
      page.getByRole('heading', { name: 'ตั้งค่าบริการและเงินสำรองรายงาน' }),
    ).toBeVisible();

    // Select the created event
    const eventSelect = page.getByLabel('เลือกคอนเสิร์ต');
    await expect(eventSelect).toBeVisible();
    const targetOption = eventSelect.locator('option', { hasText: eventTitle });
    await expect(targetOption).toBeAttached();
    const eventIdValue = (await targetOption.getAttribute('value')) ?? '';
    await eventSelect.selectOption(eventIdValue);

    // Verify form is visible
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    // 4. Configure Organizer Fee (AC-23): Percentage mode, 6.5%
    await page.locator('#organizer-fee-mode').selectOption('percentage');
    await page.locator('#organizer-fee-rate').fill('6.5');

    // 5. Configure Customer Fee (AC-24): Per Ticket mode, 25 Baht
    await page.locator('#customer-fee-mode').selectOption('per_ticket');
    await page.locator('#customer-fee-rate').fill('25');

    // 6. Configure Reserve Percentage (AC-29): 12%
    await page.locator('#reserve-percentage').fill('12');

    // 7. Save settings
    await page.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
    await expect(page.getByText('บันทึกค่าบริการและเงินสำรองสำเร็จ')).toBeVisible();

    // Verify effective summary (AC-25: single effective mode per party)
    await expect(page.locator('#effective-organizer-rate')).toHaveText('6.50');
    await expect(page.locator('#effective-customer-rate')).toHaveText('25.00');
    await expect(page.locator('#effective-reserve-rate')).toHaveText('12.00');

    // 8. Reload page to verify persistence
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'ตั้งค่าบริการและเงินสำรองรายงาน' }),
    ).toBeVisible();
    await eventSelect.selectOption(eventIdValue);

    await expect(page.locator('#organizer-fee-mode')).toHaveValue('percentage');
    await expect(page.locator('#organizer-fee-rate')).toHaveValue('6.5');
    await expect(page.locator('#customer-fee-mode')).toHaveValue('per_ticket');
    await expect(page.locator('#customer-fee-rate')).toHaveValue('25');
    await expect(page.locator('#reserve-percentage')).toHaveValue('12');

    // 9. Check design rules: No emojis (D-14), responsive layout
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // 10. Switch customer fee mode to per_order (AC-24) to verify mode change
    await page.locator('#customer-fee-mode').selectOption('per_order');
    await page.locator('#customer-fee-rate').fill('40');
    await page.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
    await expect(page.getByText('บันทึกค่าบริการและเงินสำรองสำเร็จ')).toBeVisible();

    await expect(page.locator('#effective-customer-rate')).toHaveText('40.00');

    // 11. Organizer logout and check direct action denial
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page).toHaveURL('/login');

    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    // Organizer does NOT see owner fee settings manager
    await expect(
      page.getByRole('heading', { name: 'ตั้งค่าบริการและเงินสำรองรายงาน' }),
    ).not.toBeVisible();

    // Organizer direct API mutation must return 403 Forbidden
    const mutateRes = await page.request.put('/api/organizer/events/test-id/fee-settings', {
      data: { organizerFeeRate: 99 },
    });
    expect(mutateRes.status()).toBe(403);
  });
});
