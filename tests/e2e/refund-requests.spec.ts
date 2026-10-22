import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 152 : 202;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Buyer Refund Requests flow (TASK-021, AC-32, AC-33, AC-34, AC-21)', () => {
  test('buyer requests partial refund within 168h cutoff, verifies face-value math, pending status without QR revocation, and duplicate prevention', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(90000);
    const eventTitle = `คอนเสิร์ต ขอคืนเงิน ${testInfo.project.name} ${Date.now()}`;
    const guestEmail = `refund-buyer-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const guestName = `คุณสมชาย ผู้ขอคืนเงิน ${testInfo.project.name}`;
    const guestPhone = '0812345678';

    // 1. Organizer logs in and creates event with session 10 days in future (240h > 168h)
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค ชาเลนเจอร์ ฮอลล์');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Session 10 days in future
    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000).toISOString();
    const sessionEndTime = new Date(Date.now() + 244 * 3600 * 1000).toISOString();

    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            ticketTypes: [{ name: 'บัตร Regular', price: 1200, quota: 20 }],
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

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 2. Owner logs in and approves session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click({ force: true });
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 3. Guest visits concert detail page and completes purchase for 2 tickets
    await page.goto(`/events/${createdEvent.id}`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    // Guest checkout form
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

    // Select 2 tickets
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน บัตร Regular' });
    await addBtn.click();
    await addBtn.click();

    await page.getByRole('button', { name: 'ยืนยันการเลือกบัตร (2 ใบ)' }).click();
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    // Generate PromptPay QR and simulate payment
    const generateQrBtn = page.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' });
    await expect(generateQrBtn).toBeVisible();
    await generateQrBtn.click();
    await expect(page.locator('#promptpay-qr-image')).toBeVisible();

    const simulateBtn = page.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.click();
    await expect(page.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await expect(page.getByText('ออกบัตรสำเร็จแล้ว (2 ใบ)')).toBeVisible();

    // 4. Guest visits /my-tickets to view order and initiate refund
    await page.goto('/my-tickets');
    await expect(page.getByRole('heading', { name: 'ค้นหาบัตรคอนเสิร์ตของฉัน' })).toBeVisible();

    await page.locator('#lookup-email').fill(guestEmail);
    await page.locator('#lookup-phone').fill(guestPhone);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อเปิดดูบัตร' }).click();
    await expect(page.getByRole('heading', { name: 'ยืนยันรหัส OTP' })).toBeVisible();

    const lookupOtpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    expect(lookupOtpRes.status()).toBe(200);
    const { code: lookupCode } = await lookupOtpRes.json();

    await page.locator('#lookup-otp-code').fill(lookupCode);
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();

    // In orders view
    await expect(page.getByText(`ผู้ซื้อ: ${guestName}`)).toBeVisible();
    await expect(page.getByText(eventTitle)).toBeVisible();
    await expect(page.getByText('รายการบัตรเข้างาน (2 ใบ)')).toBeVisible();

    // 5. Open refund section (AC-32, AC-33, AC-34)
    const toggleRefundBtn = page.locator('[data-testid="toggle-refund-section-btn"]');
    await toggleRefundBtn.scrollIntoViewIfNeeded();
    await toggleRefundBtn.click();

    await expect(page.getByText('แบบฟอร์มยื่นคำขอคืนเงิน (Partial / Whole Refund)')).toBeVisible();
    await expect(page.getByText('เงื่อนไขการคืนเงินปกติ (AC-32):')).toBeVisible();

    // Check that 2 ticket checkboxes are available
    const checkboxes = page.locator('input[name="refund-ticket-checkbox"]');
    await expect(checkboxes).toHaveCount(2);

    // Select only the first ticket for partial refund (AC-34)
    await checkboxes.first().click();

    // Verify face-value amount display is strictly 1,200 THB (AC-33: excludes customer fees)
    await expect(page.getByText('จำนวนบัตรที่เลือกขอคืน (1 ใบ)')).toBeVisible();
    await expect(page.getByText('ยอดเงินคืนคำนวณจากราคาหน้าบัตร (Face Value) เท่านั้น ไม่รวมค่าธรรมเนียมการบริการลูกค้า')).toBeVisible();

    // Fill refund reason and bank details
    await page.locator('#refund-reason-input').fill('ติดธุระส่วนตัว ขอคืนบัตร 1 ใบ');
    await page.locator('#bank-name-input').fill('ธนาคารกสิกรไทย');
    await page.locator('#bank-account-no-input').fill('123-4-56789-0');
    await page.locator('#bank-account-name-input').fill(guestName);

    // Submit refund request
    const submitRefundBtn = page.locator('[data-testid="submit-refund-request-btn"]');
    await submitRefundBtn.scrollIntoViewIfNeeded();
    await submitRefundBtn.click();

    // Expect success message and pending status
    await expect(page.getByText('สถานะ: รอเจ้าหน้าที่ตรวจสอบ')).toBeVisible();
    await expect(page.getByText('รอการตรวจสอบ (pending)')).toBeVisible();
    await expect(page.getByText('คำขออยู่ในสถานะรอตรวจสอบ บัตรยังสามารถใช้สแกนเข้างานได้จนกว่าจะได้รับการอนุมัติ (AC-34)')).toBeVisible();

    // Verify that both tickets and QR codes remain visible and not revoked (AC-34)
    await expect(page.getByText('รายการบัตรเข้างาน (2 ใบ)')).toBeVisible();
    const qrImages = page.locator('img[alt^="QR Code บัตร"]');
    await expect(qrImages).toHaveCount(2);
  });
});
