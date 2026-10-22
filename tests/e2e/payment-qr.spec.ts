import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 144 : 194;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('PromptPay Payment QR generation flow (TASK-014, AC-15, AC-26, AC-12, AC-13, AC-70)', () => {
  test('guest reserves tickets, creates PromptPay QR matching exact quote/THB, and preserves state on refresh', async ({
    page,
    request,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ตชำระเงิน QR ${testInfo.project.name}`;
    const guestEmail = `buyer-qr-${testInfo.project.name}@ticket.invalid`;
    const guestName = `ศิริพงษ์ พร้อมเพย์ ${testInfo.project.name}`;
    const guestPhone = '0823456789';

    // 1. Organizer logs in and creates event
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

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Add session with ticket quota = 50
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-11-20T19:00:00.000Z',
            endTime: '2026-11-20T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตร Regular', price: 2000, quota: 50 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    const sessionId = updatedData.event.sessions[0].id;

    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 2. Owner logs in, configures per_ticket customer fee 30 THB, and approves session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const feeRes = await page.request.put(`/api/owner/events/${createdEvent.id}/fee-settings`, {
      data: {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 30,
        reservePercentage: 10,
      },
    });
    expect(feeRes.status()).toBe(200);

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click();
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 3. Guest opens the concert detail page
    await page.goto(`/events/${createdEvent.id}`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    // 4. Guest completes OTP verification
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

    await page.getByLabel('รหัส OTP 6 หลัก *').fill(code);
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(page.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    // 5. Select 2 tickets (2 * 2,000 = 4,000 THB; fee = 2 * 30 = 60 THB; total = 4,060 THB)
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน บัตร Regular' });
    await addBtn.click();
    await addBtn.click();
    await page.getByRole('button', { name: 'ยืนยันการเลือกบัตร (2 ใบ)' }).click();

    // 6. Confirmed reservation card
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();
    const orderId = (await page.locator('#reservation-order-id').innerText()).trim();
    expect(orderId).toMatch(/^ORD-/);

    // Verify quote amounts (AC-26)
    await expect(page.locator('#quote-subtotal')).toContainText('4,000');
    await expect(page.locator('#quote-customer-fee')).toContainText('60');
    await expect(page.locator('#quote-total')).toContainText('4,060');

    // 7. Generate PromptPay QR
    const generateQrBtn = page.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' });
    await expect(generateQrBtn).toBeVisible();
    await generateQrBtn.click();

    // 8. Verify QR code displayed with exact quote and THB currency (AC-15, AC-26)
    await expect(page.locator('#promptpay-qr-image')).toBeVisible();
    await expect(page.locator('#payment-total-thb')).toContainText('4,060');
    await expect(page.locator('#payment-currency')).toHaveText('THB');
    const chargeId = (await page.locator('#payment-charge-id').innerText()).trim();
    expect(chargeId).toMatch(/^chrg_test_/);

    // 9. Page refresh test (AC-70): restores order, charge, and remaining deadline
    await page.reload();
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();
    expect(await page.locator('#reservation-order-id').innerText()).toBe(orderId);
    await expect(page.locator('#promptpay-qr-image')).toBeVisible();
    expect(await page.locator('#payment-charge-id').innerText()).toBe(chargeId);
    await expect(page.locator('#payment-total-thb')).toContainText('4,060');

    // 10. Direct payment request without OTP token is rejected (AC-12)
    const directRes = await request.post(`/api/public/checkout/orders/${orderId}/payment-qr`, {
      data: { verifiedToken: 'fake-token' },
    });
    expect(directRes.status()).toBe(403);

    // 11. Design rules: zero emojis (D-14), responsive layout
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
