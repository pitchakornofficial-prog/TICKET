import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 156 : 206;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Owner Manual Refund Transfer & Private Proof Flow (TASK-023, AC-37, AC-92, AC-93)', () => {
  test('owner approves refund, records transfer failure (AC-93), then records transfer with proof (AC-37), guest sees completed status without proof file, non-owner is forbidden (AC-92)', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(90000);
    const eventTitle = `คอนเสิร์ต โอนเงินคืนจริง ${testInfo.project.name} ${Date.now()}`;
    const guestEmail = `transfer-buyer-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const guestName = `คุณวิภาวี โอนคืน ${testInfo.project.name}`;
    const guestPhone = '0898765432';

    // 1. Organizer logs in and creates event with session 10 days in future
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค ชาเลนเจอร์ ฮอลล์ 2');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

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
            ticketTypes: [{ name: 'Regular Zone', price: 1500, quota: 10 }],
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
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน Regular Zone' });
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

    // 4. Guest visits /my-tickets and submits refund request
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

    const toggleRefundBtn = page.locator('[data-testid="toggle-refund-section-btn"]');
    await toggleRefundBtn.scrollIntoViewIfNeeded();
    await toggleRefundBtn.click();

    const checkboxes = page.locator('input[name="refund-ticket-checkbox"]');
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.first().click();

    await page.locator('#refund-reason-input').fill('ขอคืนเงินเพื่อทดสอบการบันทึกการโอนเงินคืน');
    await page.locator('#bank-name-input').fill('ธนาคารกสิกรไทย');
    await page.locator('#bank-account-no-input').fill('111-2-33333-4');
    await page.locator('#bank-account-name-input').fill(guestName);

    const submitRefundBtn = page.locator('[data-testid="submit-refund-request-btn"]');
    await submitRefundBtn.scrollIntoViewIfNeeded();
    await submitRefundBtn.click();
    await expect(page.getByText('สถานะ: รอเจ้าหน้าที่ตรวจสอบ')).toBeVisible();

    // 5. Owner logs in, approves refund request (TASK-022)
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const refundManager = page.locator('#owner-refund-approval-manager');
    await refundManager.scrollIntoViewIfNeeded();
    await expect(refundManager).toBeVisible();

    const pendingItem = refundManager.locator('.refund-request-card', { hasText: guestName });
    await expect(pendingItem).toBeVisible();

    const approveBtn = pendingItem.getByRole('button', { name: 'อนุมัติการคืนเงิน' });
    await approveBtn.scrollIntoViewIfNeeded();
    await approveBtn.click({ force: true });

    const feedbackBanner = page.locator('#owner-refund-feedback-banner');
    await expect(feedbackBanner).toBeVisible();
    await expect(feedbackBanner).toContainText('อนุมัติการคืนเงิน');

    // 6. Test recording transfer failure (AC-93)
    const approvedTabBtn = refundManager.getByRole('button', { name: 'รอโอนเงินคืน (Approved)' });
    await approvedTabBtn.scrollIntoViewIfNeeded();
    await approvedTabBtn.click({ force: true });

    const approvedItem = refundManager.locator('.refund-request-card', { hasText: guestName });
    await expect(approvedItem).toBeVisible();

    const recordFailureBtn = approvedItem.getByRole('button', { name: 'บันทึกโอนล้มเหลว (AC-93)' });
    await recordFailureBtn.scrollIntoViewIfNeeded();
    await recordFailureBtn.click({ force: true });

    const failureInput = approvedItem.locator('input[placeholder*="เลขที่บัญชี"]');
    await failureInput.scrollIntoViewIfNeeded();
    await failureInput.fill('เลขบัญชีปลายทางไม่ถูกต้อง (AC-93 test)');

    const confirmFailureBtn = approvedItem.getByRole('button', { name: 'ยืนยันบันทึกโอนล้มเหลว' });
    await confirmFailureBtn.scrollIntoViewIfNeeded();
    await confirmFailureBtn.click({ force: true });

    await expect(feedbackBanner).toBeVisible();
    await expect(feedbackBanner).toContainText('บันทึกเหตุผลการโอนเงินล้มเหลว');
    await expect(approvedItem.getByText('การโอนเงินครั้งก่อนล้มเหลว (AC-93):')).toBeVisible();

    // 7. Test recording successful manual transfer (AC-37, AC-92)
    const openTransferBtn = approvedItem.getByRole('button', { name: 'บันทึกการโอนเงิน (AC-37)' });
    await openTransferBtn.scrollIntoViewIfNeeded();
    await openTransferBtn.click({ force: true });

    const noteInput = approvedItem.locator('input[data-testid*="transfer-note-input"]');
    await noteInput.scrollIntoViewIfNeeded();
    await noteInput.fill('โอนผ่าน KBank เลขอ้างอิง 998877 เรียบร้อย');

    const confirmTransferBtn = approvedItem.locator('button[data-testid*="confirm-complete-transfer-btn"]');
    await confirmTransferBtn.scrollIntoViewIfNeeded();
    await confirmTransferBtn.click({ force: true });

    await expect(feedbackBanner).toBeVisible();
    await expect(feedbackBanner).toContainText('บันทึกการโอนเงินคืนสำเร็จ');

    // Verify item moved to Completed tab
    const completedTabBtn = refundManager.getByRole('button', { name: 'โอนสำเร็จแล้ว (Completed)' });
    await completedTabBtn.scrollIntoViewIfNeeded();
    await completedTabBtn.click({ force: true });

    const completedItem = refundManager.locator('.refund-request-card', { hasText: guestName });
    await expect(completedItem).toBeVisible();
    await expect(completedItem.getByText('โอนสำเร็จแล้ว (completed)')).toBeVisible();

    // Extract refund request ID from text
    const textContent = await completedItem.innerText();
    const matchId = textContent.match(/REF-[A-Z0-9]+/);
    const refundRequestId = matchId ? matchId[0] : '';
    expect(refundRequestId).toBeTruthy();

    // 8. Guest views /my-tickets: session token is preserved in sessionStorage, automatically loads orders
    await page.goto('/my-tickets');
    await expect(page.getByText(`ผู้ซื้อ: ${guestName}`)).toBeVisible();
    await expect(page.getByText('คืนเงินสำเร็จแล้ว (completed)')).toBeVisible();
    await expect(page.getByText('โอนเงินคืนสำเร็จแล้ว: ฿1,500.00')).toBeVisible();
    // Verify AC-92: Buyer page has NO link to download proof
    await expect(page.locator('a[href*="/proof"]')).toHaveCount(0);

    // 9. Unauthenticated request to proof URL returns 403 Forbidden (AC-92)
    const unauthorizedProofRes = await request.get(`/api/owner/refunds/${refundRequestId}/proof`);
    expect(unauthorizedProofRes.status()).toBe(403);
  });
});
