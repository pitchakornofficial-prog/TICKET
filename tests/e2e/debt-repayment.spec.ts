import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 183 : 233;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 40)}` });
});

test.describe('Event debt repayment and cross-event isolation (TASK-031, AC-85, AC-86, G-33, G-39)', () => {
  test('Event A debt does not deduct Event B; owner records debt repayment with idempotency and role isolation', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    const eventATitle = `คอนเสิร์ต งานติดหนี้ A ${testInfo.project.name} ${Date.now()}`;
    const eventBTitle = `คอนเสิร์ต งานปกติ B ${testInfo.project.name} ${Date.now()}`;

    const buyerEmailA = `buyer-debt-a-${testInfo.project.name}@ticket.invalid`;
    const buyerEmailB = `buyer-debt-b-${testInfo.project.name}@ticket.invalid`;
    const buyerPhone = '0812345678';
    const buyerName = 'คุณวิชัย ทดสอบหนี้';

    const now = Date.now();
    const sessionStartTime = new Date(now + 240 * 3600 * 1000).toISOString();
    const sessionEndTime = new Date(now + 244 * 3600 * 1000).toISOString();

    // 1. Organizer logs in and creates Event A and Event B
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    // Create Event A
    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventATitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค อารีน่า A');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    // Create Event B
    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventBTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค อารีน่า B');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const eventA = events.find((e: { title: string; id: string }) => e.title === eventATitle);
    const eventB = events.find((e: { title: string; id: string }) => e.title === eventBTitle);
    expect(eventA).toBeDefined();
    expect(eventB).toBeDefined();

    // Configure sessions for Event A and Event B
    const updateResA = await page.request.put(`/api/events/${eventA.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            ticketTypes: [{ name: 'VIP Zone A', price: 1000, quota: 10 }],
          },
        ],
      },
    });
    expect(updateResA.status()).toBe(200);
    const sessionAId = (await updateResA.json()).event.sessions[0].id;

    const updateResB = await page.request.put(`/api/events/${eventB.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            ticketTypes: [{ name: 'VIP Zone B', price: 1000, quota: 10 }],
          },
        ],
      },
    });
    expect(updateResB.status()).toBe(200);
    const sessionBId = (await updateResB.json()).event.sessions[0].id;

    // Submit sessions for approval
    await page.request.post(`/api/events/${eventA.id}?action=submit-session`, { data: { sessionId: sessionAId } });
    await page.request.post(`/api/events/${eventB.id}?action=submit-session`, { data: { sessionId: sessionBId } });

    // 2. Owner logs in, approves both sessions, and configures fee settings (10% fee, 10% reserve)
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/login');
    await ownerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await ownerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(ownerPage).toHaveURL('/back-office/owner');

    await ownerPage.request.post('/api/owner/sessions', { data: { sessionId: sessionAId } });
    await ownerPage.request.post('/api/owner/sessions', { data: { sessionId: sessionBId } });

    await ownerPage.request.put(`/api/owner/events/${eventA.id}/fee-settings`, {
      data: { organizerFeeMode: 'percentage', organizerFeeRate: 10, customerFeeMode: 'per_ticket', customerFeeRate: 0, reservePercentage: 10 },
    });
    await ownerPage.request.put(`/api/owner/events/${eventB.id}/fee-settings`, {
      data: { organizerFeeMode: 'percentage', organizerFeeRate: 10, customerFeeMode: 'per_ticket', customerFeeRate: 0, reservePercentage: 10 },
    });

    // 3. Buyer purchases 1 ticket in Event A (1,000 THB)
    const buyerContextA = await browser.newContext();
    const buyerPageA = await buyerContextA.newPage();
    await buyerPageA.goto(`/events/${eventA.id}`);
    await expect(buyerPageA.getByRole('heading', { name: eventATitle })).toBeVisible({ timeout: 25000 });

    await buyerPageA.getByLabel('ชื่อ-นามสกุล *').fill(buyerName);
    await buyerPageA.getByLabel('อีเมล *').fill(buyerEmailA);
    await buyerPageA.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(buyerPhone);
    await buyerPageA.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(buyerPageA.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otpResA = await request.get(`/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(buyerEmailA)}`);
    const { code: codeA } = await otpResA.json();
    await buyerPageA.getByLabel('รหัส OTP 6 หลัก *').fill(codeA);
    await buyerPageA.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(buyerPageA.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    await buyerPageA.getByRole('button', { name: 'เพิ่มจำนวน VIP Zone A' }).click();
    await buyerPageA.getByRole('button', { name: /ยืนยันการเลือกบัตร/ }).click({ force: true });
    await expect(buyerPageA.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    await buyerPageA.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' }).click({ force: true });
    await expect(buyerPageA.locator('#promptpay-qr-image')).toBeVisible();
    const simBtnA = buyerPageA.locator('#simulate-payment-button');
    await expect(simBtnA).toBeVisible();
    await simBtnA.scrollIntoViewIfNeeded();
    await simBtnA.dispatchEvent('click');
    await expect(buyerPageA.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible({ timeout: 25000 });

    // 4. Owner pays out 810 THB for Event A
    await ownerPage.goto('/back-office/owner');
    await ownerPage.reload();
    await ownerPage.locator('[data-testid="owner-nav-finance"]').click();
    const payoutManager = ownerPage.locator('[data-testid="owner-weekly-payout-manager"]');
    await expect(payoutManager).toBeVisible();
    const payoutSelect = payoutManager.locator('#payout-event-select');
    await expect(payoutSelect.locator(`option[value="${eventA.id}"]`)).toBeAttached({ timeout: 20000 });
    await payoutSelect.selectOption(eventA.id);
    await expect(payoutManager.locator('[data-testid="owner-payable-amount"]')).toContainText('810.00', { timeout: 20000 });

    await payoutManager.locator('#submit-payout-btn').click({ force: true });
    await expect(ownerPage.getByText('บันทึกการโอนเงินสำเร็จเรียบร้อย')).toBeVisible({ timeout: 20000 });
    await expect(payoutManager.locator('[data-testid="owner-payable-amount"]')).toContainText('0.00');
    await expect(payoutManager.locator('[data-testid="owner-total-paid-out"]')).toContainText('810.00');

    await buyerContextA.close();

    // 5. Organizer requests cancellation for Session A and Owner approves -> triggers automatic refund cases for tickets
    const cancelReq = await page.request.post(`/api/organizer/events/${eventA.id}/sessions/${sessionAId}/cancel`, {
      data: { reason: 'ยกเลิกรอบเนื่องจากเหตุจำเป็น' },
    });
    expect([200, 201]).toContain(cancelReq.status());

    const pendingCancelsRes = await ownerPage.request.get('/api/owner/sessions/cancellations');
    const { cancellations } = await pendingCancelsRes.json();
    const cCase = cancellations.find((c: { sessionId: string }) => c.sessionId === sessionAId);
    expect(cCase).toBeDefined();

    const approveCancelRes = await ownerPage.request.post(`/api/owner/sessions/cancellations/${cCase.id}/approve`);
    expect(approveCancelRes.status()).toBe(200);

    // Event A is now in debt: E = 0, P = 810 -> Debt = 810 THB!

    // 7. Buyer purchases 1 ticket in Event B (1,000 THB)
    const buyerContextB = await browser.newContext();
    const buyerPageB = await buyerContextB.newPage();
    await buyerPageB.goto(`/events/${eventB.id}`);
    await expect(buyerPageB.getByRole('heading', { name: eventBTitle })).toBeVisible({ timeout: 25000 });

    await buyerPageB.getByLabel('ชื่อ-นามสกุล *').fill(buyerName);
    await buyerPageB.getByLabel('อีเมล *').fill(buyerEmailB);
    await buyerPageB.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(buyerPhone);
    await buyerPageB.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(buyerPageB.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otpResB = await request.get(`/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(buyerEmailB)}`);
    const { code: codeB } = await otpResB.json();
    await buyerPageB.getByLabel('รหัส OTP 6 หลัก *').fill(codeB);
    await buyerPageB.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();

    await buyerPageB.getByRole('button', { name: 'เพิ่มจำนวน VIP Zone B' }).click();
    await buyerPageB.getByRole('button', { name: /ยืนยันการเลือกบัตร/ }).click({ force: true });
    await buyerPageB.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' }).click({ force: true });
    const simBtnB = buyerPageB.locator('#simulate-payment-button');
    await expect(simBtnB).toBeVisible();
    await simBtnB.scrollIntoViewIfNeeded();
    await simBtnB.dispatchEvent('click');
    await expect(buyerPageB.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible({ timeout: 25000 });
    await buyerContextB.close();

    // 8. Organizer checks Event B Money Report: Payable = 810 THB (CRITICAL AC-85 check!)
    await page.goto('/back-office/organizer');
    const openReportBBtn = page.locator(`[data-testid="open-money-report-btn-${eventB.id}"]`);
    await expect(openReportBBtn).toBeVisible();
    await openReportBBtn.click({ force: true });

    await expect(page.locator('#organizer-money-report-modal')).toBeVisible();
    // Event B payable must NOT be deducted by Event A's 810 THB debt!
    await expect(page.locator('[data-testid="payable-amount"]')).toContainText('810.00');
    await page.getByRole('button', { name: 'ปิดรายงาน' }).click();

    // 9. Organizer checks Event A Money Report: shows Debt 810 THB & isolation alert (AC-85, AC-86)
    const openReportABtn = page.locator(`[data-testid="open-money-report-btn-${eventA.id}"]`);
    await expect(openReportABtn).toBeVisible();
    await openReportABtn.click({ force: true });

    await expect(page.locator('[data-testid="debt-amount"]')).toContainText('810.00');
    await expect(page.locator('[data-testid="debt-isolation-alert"]')).toBeVisible();
    await expect(page.locator('[data-testid="empty-repayments-message"]')).toBeVisible();
    await page.getByRole('button', { name: 'ปิดรายงาน' }).click();

    // 10. Owner navigates to Debt Repayment Manager (TASK-031, AC-86)
    await ownerPage.goto('/back-office/owner');
    await ownerPage.reload();
    await ownerPage.locator('[data-testid="owner-nav-finance"]').click();
    const debtManager = ownerPage.locator('[data-testid="owner-debt-repayment-manager"]');
    await expect(debtManager).toBeVisible();

    const debtSelect = debtManager.locator('#owner-debt-repayment-event-select');
    await expect(debtSelect.locator(`option[value="${eventA.id}"]`)).toBeAttached({ timeout: 20000 });
    await debtSelect.selectOption(eventA.id);

    // Verify debt status badge & amount
    const debtStatusBadge = debtManager.locator('[data-testid="event-debt-status-badge"]');
    await expect(debtStatusBadge).toBeVisible({ timeout: 20000 });
    await expect(debtStatusBadge).toContainText('มียอดค้างชำระ (Debt Outstanding — AC-85)', { timeout: 20000 });
    await expect(debtManager.locator('[data-testid="owner-debt-amount"]')).toContainText('810.00', { timeout: 20000 });
    await expect(debtManager.locator('[data-testid="debt-refund-excess"]')).toContainText('810.00', { timeout: 20000 });

    // Owner fills repayment notes & submits repayment of 810 THB
    await debtManager.locator('#debt-repayment-notes-input').fill('ผู้จัดงานโอนชดเชยยอดค้างชำระเรียบร้อย');
    const submitRepaymentBtn = debtManager.locator('#submit-debt-repayment-btn');
    await expect(submitRepaymentBtn).toBeEnabled({ timeout: 20000 });
    await submitRepaymentBtn.click({ force: true });

    // Success notification
    await expect(ownerPage.getByText('บันทึกรับชำระเงินคืนจากผู้จัดงานสำเร็จเรียบร้อยจำนวน ฿810.00 (AC-86)')).toBeVisible({ timeout: 20000 });

    // Status updates: No debt, debt amount = 0.00, button disabled
    await expect(debtStatusBadge).toContainText('ไม่มีหนี้ค้างชำระ (No Debt)', { timeout: 20000 });
    await expect(debtManager.locator('[data-testid="owner-debt-amount"]')).toContainText('0.00', { timeout: 20000 });
    await expect(submitRepaymentBtn).toBeDisabled();

    // Repayments history table contains the 810 THB row
    const repaymentsTable = debtManager.locator('[data-testid="debt-repayments-history-table"]');
    await expect(repaymentsTable).toBeVisible();
    await expect(repaymentsTable).toContainText('810.00');
    await expect(repaymentsTable).toContainText('ผู้จัดงานโอนชดเชยยอดค้างชำระเรียบร้อย');

    // 11. Organizer verifies Event A Money Report now reflects cleared debt & repayment history
    await page.goto('/back-office/organizer');
    const openReportAAfterBtn = page.locator(`[data-testid="open-money-report-btn-${eventA.id}"]`);
    await expect(openReportAAfterBtn).toBeVisible();
    await openReportAAfterBtn.click({ force: true });

    // Debt card is replaced by payable = 0.00 (not debt anymore)
    await expect(page.locator('[data-testid="payable-amount"]')).toContainText('0.00', { timeout: 20000 });
    await expect(page.locator('text=รับคืนหนี้แล้ว: ฿810.00')).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'ปิดรายงาน' }).click();

    // 12. Role isolation checks (AC-86)
    // Organizer tries to POST repayment -> 403 Forbidden
    const orgRepayRes = await page.request.post(`/api/owner/events/${eventA.id}/debt-repayments`, {
      data: { amount: 100 },
    });
    expect(orgRepayRes.status()).toBe(403);

    // Scanner tries to POST repayment -> 403 Forbidden
    const scannerContext = await browser.newContext();
    const scannerPage = await scannerContext.newPage();
    await scannerPage.goto('/login');
    await scannerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.scanner.email);
    await scannerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scannerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scannerPage).toHaveURL('/back-office/scanner');

    const scannerRepayRes = await scannerPage.request.post(`/api/owner/events/${eventA.id}/debt-repayments`, {
      data: { amount: 100 },
    });
    expect(scannerRepayRes.status()).toBe(403);
    await scannerContext.close();

    // Unauthenticated request -> 401 Unauthorized
    const unauthRepayRes = await request.post(`/api/owner/events/${eventA.id}/debt-repayments`, {
      data: { amount: 100 },
    });
    expect(unauthRepayRes.status()).toBe(401);

    await ownerContext.close();
  });
});
