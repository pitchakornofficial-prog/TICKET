import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 170 : 220;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 40)}` });
});

test.describe('Reschedule session & special refund window (TASK-025, AC-38, AC-108, G-13)', () => {
  test('handles reschedule amendment, keeps public session unchanged while pending, updates date upon owner approval, and allows special refund window submission', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    const eventTitle = `คอนเสิร์ตเลื่อนรอบการแสดง ${testInfo.project.name}`;
    const guestEmail = `guest-reschedule-${testInfo.project.name}@ticket.invalid`;
    const guestPhone = '0891112233';
    const guestName = 'คุณวิชัย สมบูรณ์';

    // Original dates: 2026-12-10 19:00:00+07:00 (12:00 UTC)
    const originalStartTime = '2026-12-10T12:00:00.000Z';
    const originalEndTime = '2026-12-10T15:00:00.000Z';

    // Rescheduled dates: 2026-12-25 19:00:00+07:00
    const newStartTime = '2026-12-25T19:00';
    const newEndTime = '2026-12-25T22:00';

    // 1. Organizer logs in and creates event with session
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
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

    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: originalStartTime,
            endTime: originalEndTime,
            ticketTypes: [{ name: 'VIP Seating', price: 2500, quota: 20 }],
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

    // 2. Owner logs in on isolated ownerPage and approves initial session
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await ownerPage.goto('/login');
    await expect(ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await ownerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await ownerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(ownerPage).toHaveURL('/back-office/owner');

    const sessionCard = ownerPage.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click({ force: true });
    await expect(ownerPage.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    // 3. Guest visits public concert page in isolated buyerContext and buys 1 ticket
    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();

    await buyerPage.goto(`/events/${createdEvent.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle })).toBeVisible();

    // Verify original session time is shown (December 10, 2026 / 10 ธันวาคม 2569)
    await expect(buyerPage.locator('.session-date-heading', { hasText: '10 ธันวาคม 2569' })).toBeVisible();

    // Guest checkout form
    await buyerPage.getByLabel('ชื่อ-นามสกุล *').fill(guestName);
    await buyerPage.getByLabel('อีเมล *').fill(guestEmail);
    await buyerPage.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(guestPhone);
    await buyerPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(buyerPage.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    expect(otpRes.status()).toBe(200);
    const { code } = await otpRes.json();

    await buyerPage.getByLabel('รหัส OTP 6 หลัก *').fill(code);
    await buyerPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(buyerPage.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    const addBtn = buyerPage.getByRole('button', { name: 'เพิ่มจำนวน VIP Seating' });
    await addBtn.click();
    await buyerPage.getByRole('button', { name: 'ยืนยันการเลือกบัตร (1 ใบ)' }).click();
    await expect(buyerPage.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    await buyerPage.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' }).click();
    await expect(buyerPage.locator('#promptpay-qr-image')).toBeVisible();

    await buyerPage.locator('#simulate-payment-button').click();
    await expect(buyerPage.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await expect(buyerPage.getByText('ออกบัตรสำเร็จแล้ว (1 ใบ)')).toBeVisible();

    // 4. Organizer submits a reschedule amendment on organizer page
    await page.goto('/back-office/organizer');
    await page.locator(`[data-testid="open-amendment-btn-${createdEvent.id}"]`).click({ force: true });
    await expect(page.locator('#amendment-form-section')).toBeVisible();

    // Enter new reschedule times
    await page.locator('#amendment-start-time').fill(newStartTime);
    await page.locator('#amendment-end-time').fill(newEndTime);
    await page.locator('[data-testid="submit-amendment-btn"]').click();
    await expect(page.getByText(/ยื่นคำขอแก้ไขรอบการแสดงสำเร็จ/)).toBeVisible();

    // 5. Verification of AC-108 & G-13:
    // While amendment is pending, buyer still sees original session time (10 ธันวาคม 2569)
    await buyerPage.goto(`/events/${createdEvent.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle })).toBeVisible();
    await expect(buyerPage.locator('.session-date-heading', { hasText: '10 ธันวาคม 2569' })).toBeVisible();
    await expect(buyerPage.locator('.session-date-heading', { hasText: '25 ธันวาคม 2569' })).toHaveCount(0);

    // 6. Owner approves reschedule amendment and sets Special Refund Window on ownerPage
    await ownerPage.goto('/back-office/owner');

    const amendmentCard = ownerPage.locator('.session-amendment-card', { hasText: eventTitle });
    await expect(amendmentCard).toBeVisible();
    await expect(amendmentCard.getByText(/ขอเลื่อนวันเวลาการแสดง/)).toBeVisible();

    // Configure special refund window spanning from now until far in future
    const dtInputs = amendmentCard.locator('input[type="datetime-local"]');
    await dtInputs.nth(0).fill('2026-10-01T00:00');
    await dtInputs.nth(1).fill('2026-12-31T23:59');

    const approveBtn = amendmentCard.getByRole('button', { name: 'อนุมัติการแก้ไข (AC-67)' });
    await approveBtn.scrollIntoViewIfNeeded();
    await approveBtn.dispatchEvent('click');
    await expect(ownerPage.getByText(/อนุมัติการแก้ไขรอบของ/)).toBeVisible({ timeout: 10000 });

    // 7. Verification of AC-108:
    // After approval, buyer sees the updated session date (25 ธันวาคม 2569)
    await buyerPage.goto(`/events/${createdEvent.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle })).toBeVisible();
    await expect(buyerPage.locator('.session-date-heading', { hasText: '25 ธันวาคม 2569' })).toBeVisible();

    // 8. Buyer visits /my-tickets during special refund window (AC-38)
    await buyerPage.goto('/my-tickets');
    await expect(buyerPage.getByRole('heading', { name: 'ค้นหาบัตรคอนเสิร์ตของฉัน' })).toBeVisible();

    await buyerPage.locator('#lookup-email').fill(guestEmail);
    await buyerPage.locator('#lookup-phone').fill(guestPhone);
    await buyerPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อเปิดดูบัตร' }).click();
    await expect(buyerPage.getByRole('heading', { name: 'ยืนยันรหัส OTP' })).toBeVisible();

    const lookupOtpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    expect(lookupOtpRes.status()).toBe(200);
    const { code: lookupCode } = await lookupOtpRes.json();

    await buyerPage.locator('#lookup-otp-code').fill(lookupCode);
    await buyerPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();

    // In orders view
    await expect(buyerPage.getByText(`ผู้ซื้อ: ${guestName}`)).toBeVisible();
    await expect(buyerPage.getByText(eventTitle)).toBeVisible();

    // Open refund section
    const toggleRefundBtn = buyerPage.locator('[data-testid="toggle-refund-section-btn"]');
    await toggleRefundBtn.scrollIntoViewIfNeeded();
    await toggleRefundBtn.click();

    // Verify Special Refund Window notice is shown (AC-38)
    await expect(buyerPage.getByText(/ช่วงเวลาขอคืนเงินพิเศษ/)).toBeVisible();
    await expect(buyerPage.getByText(/Special Refund Window/)).toBeVisible();
    await expect(buyerPage.getByText(/AC-38/)).toBeVisible();

    // Check ticket checkbox
    const checkboxes = buyerPage.locator('input[name="refund-ticket-checkbox"]');
    await expect(checkboxes).toHaveCount(1);
    await checkboxes.first().check();

    // Verify face-value amount display (2,500 THB)
    await expect(buyerPage.getByText(/รวม ฿2,500\.00/)).toBeVisible();

    // Fill refund details
    await buyerPage.locator('#refund-reason-input').fill('รอบใหม่ไม่สะดวกเดินทางเข้าชม (AC-38)');
    await buyerPage.locator('#bank-name-input').fill('ธนาคารไทยพาณิชย์');
    await buyerPage.locator('#bank-account-no-input').fill('456-7-89012-3');
    await buyerPage.locator('#bank-account-name-input').fill(guestName);

    // Submit refund request
    const submitRefundBtn = buyerPage.locator('[data-testid="submit-refund-request-btn"]');
    await submitRefundBtn.click();

    // Verify success feedback and pending status
    await expect(buyerPage.getByText(/ยื่นคำขอคืนเงิน.*เรียบร้อยแล้ว/)).toBeVisible();
    await expect(buyerPage.getByText(/รอเจ้าหน้าที่ตรวจสอบ|Pending Review/i)).toBeVisible();

    await ownerContext.close();
    await buyerContext.close();
  });
});
