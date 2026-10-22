import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 146 : 196;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Late payment recovery & owner exception review (TASK-016, AC-72, AC-73, AC-74, G-23, G-35)', () => {
  test('late payment opens owner review case for full refund, guest sees under-review notice with no tickets, and owner sees case in back-office', async ({
    page,
    request,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ต Late Payment Recovery ${testInfo.project.name}`;
    const guestEmail = `buyer-late-${testInfo.project.name}@ticket.invalid`;
    const guestName = `สุรศักดิ์ จ่ายช้า ${testInfo.project.name}`;
    const guestPhone = '0876543210';

    // 1. Organizer logs in and creates event
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค ชาเลนเจอร์');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Add session with quota = 30
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-12-10T19:00:00.000Z',
            endTime: '2026-12-10T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตร โซน A', price: 1800, quota: 30 }],
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

    // 2. Owner logs in, configures customer fee 50 THB, and approves session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const feeRes = await page.request.put(`/api/owner/events/${createdEvent.id}/fee-settings`, {
      data: {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 50,
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

    // 3. Guest visits concert detail page
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

    // 5. Select 2 tickets (subtotal = 3,600, fee = 100, total = 3,700 THB)
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน บัตร โซน A' });
    await addBtn.click();
    await addBtn.click();
    await page.getByRole('button', { name: 'ยืนยันการเลือกบัตร (2 ใบ)' }).click();

    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();
    const orderId = (await page.locator('#reservation-order-id').innerText()).trim();
    expect(orderId).toMatch(/^ORD-/);

    // 6. Generate PromptPay QR
    const generateQrBtn = page.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' });
    await expect(generateQrBtn).toBeVisible();
    await generateQrBtn.click();

    await expect(page.locator('#promptpay-qr-image')).toBeVisible();
    const chargeId = (await page.locator('#payment-charge-id').innerText()).trim();

    // 7. Simulate payment provider reporting late payment: paidAt 16 minutes after reservation (deadline was 15 mins)
    const latePaidAt = new Date(Date.now() + 16 * 60 * 1000).toISOString();
    const payRes = await request.post(`/api/public/checkout/orders/${orderId}/pay-test`, {
      data: {
        chargeId,
        providerPaidAt: latePaidAt,
      },
    });
    expect(payRes.status()).toBe(200);
    const payData = await payRes.json();
    expect(payData.status).toBe('paid_after_deadline');
    expect(payData.caseId).toBeDefined();

    // 8. Guest page reloads or inspects order
    await page.reload();

    // Verify Customer UI under-review notice
    await expect(page.locator('#payment-exception-banner')).toBeVisible();
    await expect(page.getByText('รอตรวจสอบเพื่อคืนเงิน (Under Review)')).toBeVisible();
    await expect(page.getByText('เปิดเคสตรวจสอบคืนเงินเต็มจำนวนแล้ว')).toBeVisible();

    // Zero ticket cards must be issued
    expect(await page.locator('.ticket-card').count()).toBe(0);

    // 9. Owner logs in and views payment exception case in back-office
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const exceptionCard = page.locator('.payment-exception-card', { hasText: orderId });
    await expect(exceptionCard).toBeVisible();
    await expect(exceptionCard.getByText('ชำระเงินหลังหมดเวลา 15 นาที')).toBeVisible();
    await expect(exceptionCard.getByText(guestName)).toBeVisible();
    await expect(exceptionCard.getByText('3,700')).toBeVisible(); // Full refund amount including fee

    // 10. Design rules: zero emojis (D-14), responsive layout
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
