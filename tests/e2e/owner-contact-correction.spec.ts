import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 151 : 201;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Owner Contact Correction Flow (TASK-019, AC-76, G-24)', () => {
  test('buyer pays order, owner corrects contact with audit log, old session cannot access, new contact looks up original tickets', async ({
    page,
    request,
    browser,
  }, testInfo) => {
    test.setTimeout(120000);
    const eventTitle = `คอนเสิร์ต แก้ข้อมูลติดต่อ ${testInfo.project.name}`;
    const initialEmail = `buyer-old-${testInfo.project.name}@ticket.invalid`;
    const initialPhone = '0812345678';
    const buyerName = `คุณสมศรี ก่อนเปลี่ยนอีเมล ${testInfo.project.name}`;

    const correctedEmail = `buyer-new-${testInfo.project.name}@ticket.invalid`;
    const correctedPhone = '0898765432';
    const correctionReason = 'ตรวจสอบสำเนาบัตรประชาชนตรงกับชื่อผู้ซื้อและสลิปการโอนเงิน';

    // 1. Organizer creates event
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('พารากอน ฮอลล์');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Add session with quota = 10
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-12-30T19:00:00.000Z',
            endTime: '2026-12-30T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตร Regular', price: 1500, quota: 10 }],
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

    // 3. Guest visits event detail page and completes purchase
    await page.goto(`/events/${createdEvent.id}`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    await page.getByLabel('ชื่อ-นามสกุล *').fill(buyerName);
    await page.getByLabel('อีเมล *').fill(initialEmail);
    await page.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(initialPhone);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();

    await expect(page.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(initialEmail)}`,
    );
    expect(otpRes.status()).toBe(200);
    const { code } = await otpRes.json();

    await page.getByLabel('รหัส OTP 6 หลัก *').fill(code);
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(page.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    // Select 2 tickets and confirm reservation
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน บัตร Regular' });
    await addBtn.click();
    await addBtn.click();

    await page.getByRole('button', { name: 'ยืนยันการเลือกบัตร (2 ใบ)' }).click();
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    const orderId = (await page.locator('#reservation-order-id').innerText()).trim();
    expect(orderId).toMatch(/^ORD-/);

    // Generate PromptPay QR
    const generateQrBtn = page.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' });
    await expect(generateQrBtn).toBeVisible();
    await generateQrBtn.click();
    await expect(page.locator('#promptpay-qr-image')).toBeVisible();

    // Simulate timely payment confirmation
    const simulateBtn = page.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.click();
    await expect(page.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await expect(page.getByText('ออกบัตรสำเร็จแล้ว (2 ใบ)')).toBeVisible();

    // 4. Owner logs into back-office and corrects contact (AC-76, G-24)
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    await expect(
      page.getByRole('heading', { name: 'แก้ไขข้อมูลติดต่อคำสั่งซื้อที่ชำระแล้ว (AC-76, G-24)' }),
    ).toBeVisible();

    // Search for order
    await page.getByPlaceholder('ค้นหาด้วยรหัสคำสั่งซื้อ, อีเมล, เบอร์โทร, หรือชื่องาน...').fill(orderId);
    await page.getByRole('button', { name: 'ค้นหา' }).click({ force: true });

    const editBtn = page.locator(`#edit-contact-btn-${orderId}`);
    await expect(editBtn).toBeVisible();
    await editBtn.scrollIntoViewIfNeeded();
    await editBtn.click({ force: true });

    // Fill new contact details
    await expect(page.locator('#contact-edit-form-container')).toBeVisible();
    await page.locator('#new-buyer-email').fill(correctedEmail);
    await page.locator('#new-buyer-phone').fill(correctedPhone);
    await page.locator('#correction-reason').fill(correctionReason);
    await page.getByRole('button', { name: 'บันทึกการแก้ไขข้อมูล' }).click({ force: true });

    // Assert success and updated values
    await expect(page.getByText(/แก้ไขข้อมูลติดต่อคำสั่งซื้อ .* สำเร็จเรียบร้อย/)).toBeVisible();
    await expect(page.locator(`#buyer-email-${orderId}`)).toHaveText(correctedEmail);
    await expect(page.locator(`#buyer-phone-${orderId}`)).toHaveText(correctedPhone);

    // View audit log
    const auditBtn = page.locator(`#view-audit-btn-${orderId}`);
    await auditBtn.scrollIntoViewIfNeeded();
    await auditBtn.click({ force: true });
    await expect(page.locator('#audit-log-viewer')).toBeVisible();
    await expect(page.getByText(correctionReason)).toBeVisible();
    await expect(page.getByText(`อีเมลเดิม: ${initialEmail}`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });

    // 5. Verify Lookup behavior in a fresh browser context
    const freshContext = await browser.newContext(testInfo.project.use);
    const freshPage = await freshContext.newPage();

    await freshPage.goto('/my-tickets');
    await expect(freshPage.getByRole('heading', { name: 'ค้นหาบัตรคอนเสิร์ตของฉัน' })).toBeVisible();

    // Case 5A: Lookup with old email + old phone fails (AC-62, AC-76)
    await freshPage.locator('#lookup-email').fill(initialEmail);
    await freshPage.locator('#lookup-phone').fill(initialPhone);
    await freshPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อเปิดดูบัตร' }).click({ force: true });
    await expect(freshPage.getByText('ไม่พบรายการคำสั่งซื้อที่ตรงกับอีเมลและเบอร์โทรศัพท์ที่ระบุ')).toBeVisible();

    // Case 5B: Lookup with NEW email + NEW phone succeeds
    await freshPage.locator('#lookup-email').fill(correctedEmail);
    await freshPage.locator('#lookup-phone').fill(correctedPhone);
    await freshPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อเปิดดูบัตร' }).click({ force: true });

    await expect(freshPage.getByRole('heading', { name: 'ยืนยันรหัส OTP' })).toBeVisible();

    const lookupOtpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(correctedEmail)}`,
    );
    expect(lookupOtpRes.status()).toBe(200);
    const lookupOtpCode = (await lookupOtpRes.json()).code;

    await freshPage.locator('#lookup-otp-code').fill(lookupOtpCode);
    await freshPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click({ force: true });

    // Order is revealed with original tickets and QR codes intact
    await expect(freshPage.getByText(orderId)).toBeVisible();
    await expect(freshPage.getByText('ชำระเงินสำเร็จ')).toBeVisible();
    await expect(freshPage.getByText('รายการบัตรเข้างาน (2 ใบ)')).toBeVisible();
    const qrImages = freshPage.locator('img[alt^="QR Code บัตร"]');
    await expect(qrImages).toHaveCount(2);

    // Design constraints: zero emojis (D-14) and responsive layout
    expect(await freshPage.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await freshPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await freshContext.close();
  });
});
