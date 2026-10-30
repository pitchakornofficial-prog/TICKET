import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 142 : 192;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Reservation expiry, refresh idempotency and quota release (TASK-013, AC-70, AC-71, G-14, G-34)', () => {
  test('restores active reservation on refresh, transitions to expired state at deadline, releases quota, and allows new order', async ({
    page,
    request,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ตทดสอบ Expiry ${testInfo.project.name}`;
    const guestEmail = `buyer-expiry-${testInfo.project.name}@ticket.invalid`;
    const guestName = `สมชาย สิ้นสุด ${testInfo.project.name}`;
    const guestPhone = '0811122334';

    // 1. Organizer logs in and creates event
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    const createEventRes = await page.request.post('/api/events', {
      data: {
        title: eventTitle,
        description: 'คอนเสิร์ตทดสอบ Expiry',
        location: 'เซ็นทรัลเวิลด์ ไลฟ์',
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-11-20T19:00:00.000Z',
            endTime: '2026-11-20T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตรนั่งมาตรฐาน', price: 1200, quota: 2 }],
          },
        ],
      },
    });
    expect(createEventRes.status()).toBe(201);
    const createdEvent = (await createEventRes.json()).event;
    const sessionId = createdEvent.sessions[0].id;

    // Submit session for approval
    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 2. Owner logs in and approves session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click();
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 3. Guest opens the concert detail page and navigates to checkout
    await page.goto(`/events/${createdEvent.id}`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    const enterQueueBtn = page.getByTestId('enter-queue-cta-btn').filter({ visible: true });
    if (await enterQueueBtn.isVisible()) {
      await enterQueueBtn.click();
      const proceedBtn = page.locator('#proceed-to-checkout-btn');
      await expect(proceedBtn).toBeVisible({ timeout: 10000 });
      await proceedBtn.click();
    } else {
      await page.goto(`/events/${createdEvent.id}/checkout`);
    }
    await expect(page).toHaveURL(new RegExp(`/events/${createdEvent.id}/checkout`));

    // 4. Select 2 tickets (consuming all quota)
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน บัตรนั่งมาตรฐาน' });
    await addBtn.click();
    await addBtn.click();
    await expect(page.getByText('รวมราคาบัตร (2 ใบ)')).toBeVisible();

    // Complete OTP verification
    await page.getByLabel('ชื่อ-นามสกุล *').fill(guestName);
    await page.getByLabel('อีเมล *').fill(guestEmail);
    await page.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(guestPhone);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();

    await expect(page.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    expect(otpRes.status()).toBe(200);
    const { code } = await otpRes.json();
    expect(code).toMatch(/^\d{6}$/);

    await page.getByLabel('รหัส OTP 6 หลัก *').fill(code);
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();

    const confirmModalBtn = page.getByRole('button', { name: 'ยืนยันและดำเนินการต่อ' });
    if (await confirmModalBtn.isVisible()) {
      await confirmModalBtn.click();
    }
    await expect(page.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    // 5. Confirm reservation -> navigates to Payment page
    const confirmReserveBtn = page.locator('#confirm-reservation-btn');
    await expect(confirmReserveBtn).toBeEnabled();
    await confirmReserveBtn.scrollIntoViewIfNeeded();
    await confirmReserveBtn.click({ force: true });

    // 6. Active reservation confirmed
    await expect(page).toHaveURL(/\/orders\/ORD-[A-Z0-9-]+\/payment$/);
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();
    const orderId = (await page.locator('#reservation-order-id').innerText()).trim();
    expect(orderId).toMatch(/^ORD-/);
    await expect(page.locator('#reservation-countdown')).toBeVisible();

    // 7. Test page refresh (AC-70, G-14)
    // Reloading page preserves order ID and does not restart or grant a new 15-minute window
    await page.reload();
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();
    expect(await page.locator('#reservation-order-id').innerText()).toBe(orderId);

    // 8. Test Expiry Transition and Quota Release (AC-71, G-34)
    // Expire the order in database via test hook
    const expireRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=expire_order&orderId=${encodeURIComponent(orderId)}`,
    );
    expect(expireRes.status()).toBe(200);

    // Reload page to reflect expired status
    await page.reload();

    // Verify UI does NOT show as reserved ("UI ไม่แสดงว่ายังกันต่อ" - AC-71)
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).not.toBeVisible();
    await expect(page.getByText('หมดเวลาการกันบัตร (Expired)')).toBeVisible();
    await expect(page.getByText('คำสั่งซื้อนี้หมดเวลาชำระเงิน 15 นาทีแล้ว (AC-71)')).toBeVisible();
    await expect(page.locator('#reservation-countdown')).toContainText('0:00 นาที (หมดเวลา)');

    // 9. Reset and start fresh order with released quota
    const modalBtn = page.locator('#timeout-modal-redirect-btn');
    if (await modalBtn.isVisible()) {
      await modalBtn.click();
    } else {
      const resetBtn = page.getByRole('button', { name: /(กลับไปเลือกบัตรใหม่|เริ่มทำรายการใหม่|กลับไปหน้ารายละเอียดคอนเสิร์ต)/ }).first();
      await resetBtn.click({ force: true });
    }

    if (!page.url().includes('/checkout')) {
      const enterQueueBtn = page.getByTestId('enter-queue-cta-btn').filter({ visible: true });
      if (await enterQueueBtn.isVisible()) {
        await enterQueueBtn.click();
        const proceedBtn = page.locator('#proceed-to-checkout-btn');
        await expect(proceedBtn).toBeVisible({ timeout: 10000 });
        await proceedBtn.click();
      } else {
        await page.goto(`/events/${createdEvent.id}/checkout`);
      }
    }
    await expect(page).toHaveURL(new RegExp(`/events/${createdEvent.id}/checkout`));

    // Quantity selector is restored and shows released quota
    await expect(page.getByRole('heading', { name: 'เลือกรอบการแสดงและจำนวนบัตร' })).toBeVisible();
    await expect(page.getByText(/คงเหลือ 2 ใบ/)).toBeVisible();

    // 10. Design rules: zero emojis (D-14), responsive layout
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
