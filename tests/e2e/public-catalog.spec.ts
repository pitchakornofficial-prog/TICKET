import { expect, test } from '@playwright/test';

test.describe('Public customer pages and navigation (TASK-007, D-02, D-05, D-08, D-13, D-14)', () => {
  test('homepage displays header navigation, search form, and multi-column footer without emojis', async ({ page }) => {
    await page.goto('/');

    // Title and locale
    await expect(page).toHaveTitle(/TICKET/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'th');

    // Header nav links (D-33: no back-office login link on public UI)
    await expect(page.getByRole('link', { name: 'หน้าแรก', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'เกี่ยวกับเรา' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'ติดต่อเรา' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'เข้าสู่ระบบหลังบ้าน' })).toHaveCount(0);

    // Search input
    const searchInput = page.getByRole('searchbox', { name: 'ค้นหาชื่องานคอนเสิร์ต' });
    await expect(searchInput).toBeVisible();

    // Footer links to policy pages
    await expect(page.getByRole('link', { name: 'เงื่อนไขการซื้อและรับบัตร' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'นโยบายคืนเงิน / ยกเลิก / เลื่อนงาน' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'นโยบายความเป็นส่วนตัว' })).toBeVisible();

    // No emojis on page (D-14)
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);

    // No horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('informational and policy pages render with clean typography and proper headings', async ({ page }) => {
    // 1. About page
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('เวทีที่คุณรัก');
    await expect(page.getByText('ซื้อง่าย ไม่ต้องสมัครสมาชิก')).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);

    // 2. Contact page
    await page.goto('/contact');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ติดต่อเรา');
    await expect(page.getByText('support@ticket.invalid')).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);

    // 3. Terms page
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('เงื่อนไขการซื้อและรับบัตร');
    await expect(page.getByText('กติกาการกันบัตร 15 นาที')).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);

    // 4. Refund policy page
    await page.goto('/refund-policy');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('นโยบายคืนเงิน ยกเลิก และเลื่อนงาน');
    await expect(page.getByText('ไม่น้อยกว่า 168 ชั่วโมง (7 วันบริบูรณ์)')).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);

    // 5. Privacy policy page
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('นโยบายความเป็นส่วนตัว');
    await expect(page.getByText('ปิดบังข้อมูลติดต่อส่วนบุคคล (Masked Contact Data)')).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test('search form submits query and displays results or empty state (AC-03)', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.getByRole('searchbox', { name: 'ค้นหาชื่องานคอนเสิร์ต' });
    await searchInput.fill('NonExistentRockConcert2026');
    await page.getByRole('button', { name: 'ค้นหา' }).click();

    await expect(page).toHaveURL(/\/\?q=NonExistentRockConcert2026/);
    await expect(page.getByText('ผลการค้นหาสำหรับ “NonExistentRockConcert2026”')).toBeVisible();
    await expect(page.getByText('ไม่พบคอนเสิร์ตที่ตรงกับคำค้นหา')).toBeVisible();

    // Clear search link returns to home
    await page.getByRole('link', { name: 'ล้างคำค้นหา' }).click();
    await expect(page).toHaveURL('/');
  });
});
