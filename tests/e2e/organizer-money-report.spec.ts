import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 170 : 220;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 40)}` });
});

test.describe('Organizer money report: sales, fees, payout readiness (TASK-028, AC-28, AC-64, AC-77, AC-78, AC-80, AC-81, AC-82, AC-110, AC-07, AC-84)', () => {
  test('organizer views financial report with correct KPI cards, masked buyer contact data, and cross-role denial', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    const eventTitle = `คอนเสิร์ต รายงานการเงิน ${testInfo.project.name} ${Date.now()}`;
    const buyerEmail = `buyer-report-${testInfo.project.name}@ticket.invalid`;
    const buyerPhone = '0812345678';
    const buyerName = 'คุณสมชาย สายเปย์';

    const sessionStartTime = new Date(Date.now() + 200 * 3600 * 1000).toISOString();
    const sessionEndTime = new Date(Date.now() + 204 * 3600 * 1000).toISOString();

    // 1. Organizer logs in and creates event
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
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

    // Configure session: 1000 THB ticket
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            ticketTypes: [{ name: 'Standing VIP', price: 1000, quota: 10 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    const sessionId = updatedData.event.sessions[0].id;

    // Submit session for owner approval
    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    // 2. Owner approves session and sets fee settings (5% organizer fee, 10% reserve)
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/login');
    await ownerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await ownerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(ownerPage).toHaveURL('/back-office/owner');

    const sessionCard = ownerPage.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click({ force: true });
    await expect(ownerPage.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    // Owner configures fees: 5% organizer fee, 20 THB customer fee, 10% reserve
    const feeConfigRes = await ownerPage.request.put(`/api/owner/events/${createdEvent.id}/fee-settings`, {
      data: {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 20,
        reservePercentage: 10,
      },
    });
    expect(feeConfigRes.status()).toBe(200);
    await ownerContext.close();

    // 3. Buyer purchases 2 tickets (2,000 THB tickets subtotal)
    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto(`/events/${createdEvent.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle })).toBeVisible();

    await buyerPage.getByLabel('ชื่อ-นามสกุล *').fill(buyerName);
    await buyerPage.getByLabel('อีเมล *').fill(buyerEmail);
    await buyerPage.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(buyerPhone);
    await buyerPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(buyerPage.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(buyerEmail)}`,
    );
    expect(otpRes.status()).toBe(200);
    const { code } = await otpRes.json();

    await buyerPage.getByLabel('รหัส OTP 6 หลัก *').fill(code);
    await buyerPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(buyerPage.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    // Select 2 tickets
    const addBtn = buyerPage.getByRole('button', { name: 'เพิ่มจำนวน Standing VIP' });
    await addBtn.click();
    await addBtn.click();
    await buyerPage.getByRole('button', { name: 'ยืนยันการเลือกบัตร (2 ใบ)' }).click();
    await expect(buyerPage.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    // Generate PromptPay QR
    const generateQrBtn = buyerPage.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' });
    await expect(generateQrBtn).toBeVisible();
    await generateQrBtn.click();

    await expect(buyerPage.locator('#promptpay-qr-image')).toBeVisible();
    const simulateBtn = buyerPage.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.click();

    await expect(buyerPage.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await buyerContext.close();

    // 4. Organizer views money report
    await page.goto('/back-office/organizer');
    const openReportBtn = page.locator(`[data-testid="open-money-report-btn-${createdEvent.id}"]`);
    await expect(openReportBtn).toBeVisible();
    await openReportBtn.click();

    // Money report modal appears
    const reportModal = page.locator('#organizer-money-report-modal');
    await expect(reportModal).toBeVisible();

    // Verify KPI amounts
    // Gross: 2,000.00
    await expect(page.locator('[data-testid="gross-sales-amount"]')).toContainText('2,000.00');
    // Net sales: 2,000.00
    await expect(page.locator('[data-testid="net-sales-amount"]')).toContainText('2,000.00');
    // Organizer fee: 5% of 2,000 = 100.00
    await expect(page.locator('[data-testid="organizer-fee-amount"]')).toContainText('100.00');
    // Net entitlement: 2,000 - 100 = 1,900.00
    await expect(page.locator('[data-testid="net-entitlement-amount"]')).toContainText('1,900.00');
    // Held reserve: 10% of 1,900 = 190.00
    await expect(page.locator('[data-testid="held-reserve-amount"]')).toContainText('190.00');
    // Payable amount: 1,900 - 190 = 1,710.00
    await expect(page.locator('[data-testid="payable-amount"]')).toContainText('1,710.00');

    // 5. Contact privacy verification (AC-64)
    // Buyer name is visible
    await expect(reportModal.getByText(buyerName)).toBeVisible();
    // Buyer email is masked: al***@...
    const maskedEmailEl = page.locator('[data-testid="masked-email"]').first();
    await expect(maskedEmailEl).toBeVisible();
    const maskedEmailText = await maskedEmailEl.textContent();
    expect(maskedEmailText).toContain('***');
    expect(maskedEmailText).not.toBe(buyerEmail);

    // Buyer phone is masked: 081***5678
    const maskedPhoneEl = page.locator('[data-testid="masked-phone"]').first();
    await expect(maskedPhoneEl).toBeVisible();
    const maskedPhoneText = await maskedPhoneEl.textContent();
    expect(maskedPhoneText).toContain('***');
    expect(maskedPhoneText).not.toBe(buyerPhone);

    // 6. Role authorization denial (AC-07, AC-82)
    // Unauthenticated GET returns 401
    const unauthRes = await request.get(`/api/organizer/events/${createdEvent.id}/money-report`);
    expect(unauthRes.status()).toBe(401);

    // Scanner account attempts to view money report -> 403 Forbidden
    const scannerContext = await browser.newContext();
    const scannerPage = await scannerContext.newPage();
    await scannerPage.goto('/login');
    await scannerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.scanner.email);
    await scannerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scannerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scannerPage).toHaveURL('/back-office/scanner');

    const scannerAccessRes = await scannerPage.request.get(`/api/organizer/events/${createdEvent.id}/money-report`);
    expect(scannerAccessRes.status()).toBe(403);
    await scannerContext.close();
  });
});
