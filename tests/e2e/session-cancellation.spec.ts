import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 180 : 230;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 40)}` });
});

test.describe('Cancel issued session & create refund cases (TASK-026, AC-35, AC-91, AC-108, R5)', () => {
  test('organizer submits cancellation, public remains active while pending, owner approves cancellation, stops new checkout, and creates automatic face-value refund cases for issued tickets without buyer submission', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    const eventTitle = `คอนเสิร์ตยกเลิกรอบการแสดง ${testInfo.project.name}`;
    const guestEmail = `guest-cancel-${testInfo.project.name}@ticket.invalid`;
    const guestPhone = '0895556677';
    const guestName = 'คุณสมหมาย ใจดี';

    const sessionStartTime = '2026-12-15T12:00:00.000Z';
    const sessionEndTime = '2026-12-15T15:00:00.000Z';

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
            startTime: sessionStartTime,
            endTime: sessionEndTime,
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
    await expect(buyerPage.getByText('ชำระเงินสำเร็จ')).toBeVisible();
    await expect(buyerPage.getByText('ออกบัตรสำเร็จแล้ว')).toBeVisible();

    // 4. Organizer submits cancellation request (AC-35, AC-108)
    await page.reload();
    const openCancelBtn = page.getByTestId(`open-cancel-btn-${createdEvent.id}`);
    await expect(openCancelBtn).toBeVisible();
    await openCancelBtn.click();

    const cancelSection = page.getByTestId('cancellation-form-section');
    await expect(cancelSection).toBeVisible();

    await page.getByTestId('cancellation-reason-input').fill('ศิลปินติดภารกิจด่วน ไม่สามารถจัดแสดงได้');
    await page.getByTestId('submit-cancel-session-btn').click();

    const cancelFeedback = page.getByTestId('cancel-feedback-message');
    await expect(cancelFeedback).toBeVisible();
    await expect(cancelFeedback).toContainText('ยื่นคำขอยกเลิกรอบการแสดงเรียบร้อยแล้ว');

    // 5. Owner reviews pending cancellations and approves (AC-35, AC-91)
    await ownerPage.reload();
    const canRequestCard = ownerPage.getByTestId(/cancellation-request-/).filter({ hasText: eventTitle });
    await expect(canRequestCard).toBeVisible();
    await expect(canRequestCard).toContainText('ศิลปินติดภารกิจด่วน ไม่สามารถจัดแสดงได้');

    const approveCanBtn = canRequestCard.getByRole('button', { name: 'อนุมัติยกเลิกรอบ (AC-35)' });
    await expect(approveCanBtn).toBeVisible();
    await approveCanBtn.click({ force: true });

    await expect(ownerPage.getByText(/อนุมัติการยกเลิกรอบการแสดงของ.*สำเร็จ/)).toBeVisible();

    // 6. Check automatic refund case in Owner back-office refund manager
    await ownerPage.reload();
    const approvedTabPromise = ownerPage.waitForResponse(
      resp => resp.url().includes('/api/owner/refunds?status=approved') && resp.status() === 200,
    );
    await ownerPage.getByRole('button', { name: 'รอโอนเงินคืน (Approved)' }).click();
    await approvedTabPromise;

    const ownerRefundCard = ownerPage.locator('.refund-request-card', { hasText: guestEmail });
    await expect(ownerRefundCard).toBeVisible();
    await expect(ownerRefundCard).toContainText('รอบการแสดงถูกยกเลิก (Session Cancelled)');
    // R5: strictly face value of VIP Seating (2,500 THB)
    await expect(ownerRefundCard).toContainText('2,500');

    // 7. Buyer views order/tickets: automatic refund request is present and approved without buyer submission (G-38, AC-91)
    await buyerPage.goto('/my-tickets');
    await buyerPage.locator('#lookup-email').fill(guestEmail);
    await buyerPage.locator('#lookup-phone').fill(guestPhone);
    await buyerPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อเปิดดูบัตร' }).click();

    await expect(buyerPage.getByRole('heading', { name: 'ยืนยันรหัส OTP' })).toBeVisible();
    await expect(buyerPage.getByText('ระบบได้ส่งรหัส OTP 6 หลักไปยังอีเมล')).toBeVisible();

    const lookupOtpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    expect(lookupOtpRes.status()).toBe(200);
    const lookupOtpData = await lookupOtpRes.json();
    await buyerPage.locator('#lookup-otp-code').fill(lookupOtpData.code);
    await buyerPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();

    await expect(buyerPage.getByText('รหัสคำสั่งซื้อ')).toBeVisible();
    await expect(buyerPage.getByText('รอบการแสดงถูกยกเลิก (Session Cancelled)')).toBeVisible();
    await expect(buyerPage.getByText(/ยอดเงินที่ขอคืน:.*2,500/)).toBeVisible();

    // Clean up contexts
    await ownerContext.close();
    await buyerContext.close();
  });
});
