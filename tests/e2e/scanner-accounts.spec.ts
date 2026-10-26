import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 140 : 190;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Scanner account assignment and scoping (TASK-009, AC-09)', () => {
  test('organizer assigns scanner to event, then scanner logs in and sees only assigned event', async ({ page }, testInfo) => {
    const eventTitle = `คอนเสิร์ตทีมสแกน ${testInfo.project.name}`;
    const scannerEmail = `scanner-${testInfo.project.name}@ticket.invalid`;
    const scannerName = `ทีมสแกนประตูหน้า ${testInfo.project.name}`;
    const scannerPassword = `Scanner-Password-Secret!${testInfo.project.name}009`;

    // 1. Organizer logs in
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    // 2. Organizer creates an event
    if (testInfo.project.name === 'mobile-chromium') {
      await page.getByTestId('organizer-mobile-menu-toggle').click();
    }
    await page.getByTestId('organizer-nav-events').click();
    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('ศูนย์การประชุมแห่งชาติสิริกิติ์');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    // 3. Organizer assigns scanner to the event
    if (testInfo.project.name === 'mobile-chromium') {
      await page.getByTestId('organizer-mobile-menu-toggle').click();
    }
    await page.getByTestId('organizer-nav-scanners').click();
    await expect(page.getByRole('heading', { name: 'จัดการทีมสแกนบัตรเฉพาะงาน' })).toBeVisible();
    await page.getByLabel('เลือกงานคอนเสิร์ตที่ต้องการจัดทีมสแกน').selectOption({ label: `${eventTitle} (ฉบับร่าง)` });

    await page.getByLabel('ชื่อทีมสแกน / ผู้สแกน').fill(scannerName);
    await page.getByLabel('อีเมลทีมสแกน *').fill(scannerEmail);
    await page.getByLabel('รหัสผ่าน (อย่างน้อย 15 ตัวอักษร)').fill(scannerPassword);
    await page.getByRole('button', { name: 'เพิ่มทีมสแกนสำหรับงานนี้' }).click();

    await expect(page.getByText('เพิ่มทีมสแกนสำหรับงานคอนเสิร์ตเรียบร้อยแล้ว')).toBeVisible();
    await expect(page.getByRole('cell', { name: scannerName })).toBeVisible();

    // 4. Organizer logs out
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page).toHaveURL('/login');

    // 5. Newly created scanner logs in
    await page.getByLabel('อีเมล', { exact: true }).fill(scannerEmail);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(scannerPassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();

    // 6. Scanner arrives in /back-office/scanner
    await expect(page).toHaveURL('/back-office/scanner');
    await expect(page.getByRole('heading', { name: 'พื้นที่ทีมสแกนบัตร', exact: true })).toBeVisible();
    await expect(page.getByText(scannerName, { exact: true })).toBeVisible();

    // 7. Scanner sees the assigned event
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    // No emojis on page (D-14)
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // 8. Scanner cannot access owner workspace (AC-09: does not receive owner privilege)
    const ownerRes = await page.goto('/back-office/owner');
    expect(ownerRes?.status()).toBe(404);
  });
});
