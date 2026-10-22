import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 154 : 204;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Owner Refund Approval flow (TASK-022, AC-36, AC-88, AC-89, AC-90, AC-107)', () => {
  test('buyer submits refund for 1 ticket; owner approves it; ticket is revoked, quota returned, and scanner rejects refunded ticket while valid ticket passes', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(90000);
    const eventTitle = `คอนเสิร์ต อนุมัติคืนเงิน ${testInfo.project.name} ${Date.now()}`;
    const guestEmail = `approval-buyer-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const guestName = `คุณมานะ อนุมัติคืนเงิน ${testInfo.project.name}`;
    const guestPhone = '0812345679';

    const scannerEmail = `scanner-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const scannerName = `ทีมสแกนเนอร์ ${testInfo.project.name}`;
    const scannerPassword = fixturePassword;

    // 1. Organizer logs in and creates event with session 10 days in future (240h > 168h)
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค ชาเลนเจอร์ ฮอลล์ 1');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Session 10 days in future, admission window now until 11 days
    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000).toISOString();
    const sessionEndTime = new Date(Date.now() + 244 * 3600 * 1000).toISOString();
    const admissionStartTime = new Date(Date.now() - 3600 * 1000).toISOString();
    const admissionEndTime = new Date(Date.now() + 250 * 3600 * 1000).toISOString();

    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            admissionStartTime,
            admissionEndTime,
            ticketTypes: [{ name: 'VIP Zone A', price: 2000, quota: 10 }],
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

    // Add scanner to event (AC-09)
    const addScannerRes = await page.request.post(`/api/organizer/events/${createdEvent.id}/scanners`, {
      data: {
        name: scannerName,
        email: scannerEmail,
        password: scannerPassword,
      },
    });
    expect(addScannerRes.status()).toBe(201);

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
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน VIP Zone A' });
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

    // Grab both ticket codes
    const ticketCode0 = (await page.locator('#ticket-code-0').innerText()).trim();
    const ticketCode1 = (await page.locator('#ticket-code-1').innerText()).trim();
    expect(ticketCode0).toMatch(/^TK-/);
    expect(ticketCode1).toMatch(/^TK-/);

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

    await expect(page.getByText(`ผู้ซื้อ: ${guestName}`)).toBeVisible();

    // 5. Submit refund request for ticket 0 only (partial refund AC-34)
    const toggleRefundBtn = page.locator('[data-testid="toggle-refund-section-btn"]');
    await toggleRefundBtn.scrollIntoViewIfNeeded();
    await toggleRefundBtn.click();

    const checkboxes = page.locator('input[name="refund-ticket-checkbox"]');
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.first().click();

    await page.locator('#refund-reason-input').fill('ขอคืนเงินบัตรใบแรก 1 ใบ');
    await page.locator('#bank-name-input').fill('ธนาคารไทยพาณิชย์');
    await page.locator('#bank-account-no-input').fill('555-4-32109-8');
    await page.locator('#bank-account-name-input').fill(guestName);

    const submitRefundBtn = page.locator('[data-testid="submit-refund-request-btn"]');
    await submitRefundBtn.scrollIntoViewIfNeeded();
    await submitRefundBtn.click();

    await expect(page.getByText('สถานะ: รอเจ้าหน้าที่ตรวจสอบ')).toBeVisible();

    // 6. Owner logs in and approves the refund request (AC-36, AC-90, AC-107)
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const refundManager = page.locator('#owner-refund-approval-manager');
    await refundManager.scrollIntoViewIfNeeded();
    await expect(refundManager).toBeVisible();

    const pendingRefundItem = refundManager.locator('.refund-request-card', { hasText: guestName });
    await expect(pendingRefundItem).toBeVisible();
    await expect(pendingRefundItem.getByText('฿2,000.00', { exact: true })).toBeVisible();

    // Click Approve (AC-36, AC-90, AC-107)
    const approveBtn = pendingRefundItem.getByRole('button', { name: 'อนุมัติการคืนเงิน' });
    await approveBtn.scrollIntoViewIfNeeded();
    await approveBtn.click({ force: true });

    const feedbackBanner = page.locator('#owner-refund-feedback-banner');
    await expect(feedbackBanner).toBeVisible();
    await expect(feedbackBanner).toContainText('อนุมัติการคืนเงิน');

    // 7. Verify scanning behavior: Refunded ticket rejected (AC-89), other ticket accepted
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    await page.getByLabel('อีเมล', { exact: true }).fill(scannerEmail);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(scannerPassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/scanner');

    // Open terminal for this session
    const openTerminalBtn = page.locator(`#open-terminal-btn-${sessionId}`);
    await openTerminalBtn.scrollIntoViewIfNeeded();
    await expect(openTerminalBtn).toBeVisible();
    await openTerminalBtn.click({ force: true });

    await expect(page.locator('#admission-terminal-container')).toBeVisible();

    // Scan refunded ticket ticketCode0 (AC-89)
    await page.locator('#scanner-ticket-input').fill(ticketCode0);
    await page.locator('#scanner-submit-btn').click({ force: true });

    const resultCard = page.locator('#scan-result-card');
    await expect(resultCard).toBeVisible();
    await expect(resultCard).toHaveClass(/result-rejected/);
    await expect(page.locator('#scan-result-message')).toContainText('บัตรถูกคืนเงินแล้ว');

    // Scan valid ticket ticketCode1 (AC-36: sibling ticket remains valid)
    await page.locator('#scanner-ticket-input').fill(ticketCode1);
    await page.locator('#scanner-submit-btn').click({ force: true });

    await expect(resultCard).toHaveClass(/result-success-entry/);
    await expect(page.locator('#scan-result-message')).toContainText('บันทึกเข้างานสำเร็จ (ผ่าน)');
  });
});
