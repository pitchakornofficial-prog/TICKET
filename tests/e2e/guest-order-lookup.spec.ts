import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 149 : 199;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Guest Order Lookup flow (TASK-018, AC-21, AC-22, AC-62, AC-63, AC-75)', () => {
  test('guest looks up paid tickets via email+phone+OTP, tests direct link gating, and recovers tickets after email failure', async ({
    page,
    request,
    browser,
  }, testInfo) => {
    test.setTimeout(60000);
    const eventTitle = `คอนเสิร์ต ค้นหาตั๋ว ${testInfo.project.name}`;
    const guestEmail = `lookup-buyer-${testInfo.project.name}@ticket.invalid`;
    const guestName = `คุณสมเกียรติ ค้นหาตั๋ว ${testInfo.project.name}`;
    const guestPhone = '0812345678';

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

    // Add session with quota = 10
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-12-25T19:00:00.000Z',
            endTime: '2026-12-25T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตร โซน A', price: 1800, quota: 10 }],
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

    // 2. Owner logs in and approves session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click();
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 3. Guest visits concert detail page and completes purchase
    await page.goto(`/events/${createdEvent.id}`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    // Fill guest details
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
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน บัตร โซน A' });
    await addBtn.click();
    await addBtn.click();

    await page.getByRole('button', { name: 'ยืนยันการเลือกบัตร (2 ใบ)' }).click();
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    // Get order ID
    const orderId = (await page.locator('#reservation-order-id').innerText()).trim();
    expect(orderId).toMatch(/^ORD-/);

    // Create PromptPay QR
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

    // 4. Test AC-62: Lookup purchased tickets at /my-tickets
    await page.goto('/my-tickets');
    await expect(page.getByRole('heading', { name: 'ค้นหาบัตรคอนเสิร์ตของฉัน' })).toBeVisible();

    // Case 4A: Incorrect phone number is rejected (AC-62)
    await page.locator('#lookup-email').fill(guestEmail);
    await page.locator('#lookup-phone').fill('0899999999');
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อเปิดดูบัตร' }).click();
    await expect(page.getByText('ไม่พบรายการคำสั่งซื้อที่ตรงกับอีเมลและเบอร์โทรศัพท์ที่ระบุ')).toBeVisible();

    // Case 4B: Correct email and phone number succeeds
    await page.locator('#lookup-phone').fill(guestPhone);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อเปิดดูบัตร' }).click();

    await expect(page.getByRole('heading', { name: 'ยืนยันรหัส OTP' })).toBeVisible();
    await expect(page.getByText(`ระบบได้ส่งรหัส OTP 6 หลักไปยังอีเมล`)).toBeVisible();

    // Fetch lookup OTP code
    const lookupOtpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    expect(lookupOtpRes.status()).toBe(200);
    const lookupOtpData = await lookupOtpRes.json();
    const lookupOtpCode = lookupOtpData.code;

    // Fill OTP
    await page.locator('#lookup-otp-code').fill(lookupOtpCode);
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();

    // Should transition to orders view (AC-21, AC-62)
    await expect(page.getByText(`รหัสคำสั่งซื้อ`)).toBeVisible();
    await expect(page.getByText(orderId)).toBeVisible();
    await expect(page.getByText('ชำระเงินสำเร็จ')).toBeVisible();
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    // Check issued tickets and distinct QR codes (AC-19, AC-21)
    await expect(page.getByText('รายการบัตรเข้างาน (2 ใบ)')).toBeVisible();
    const qrImages = page.locator('img[alt^="QR Code บัตร"]');
    await expect(qrImages).toHaveCount(2);

    // 5. Test AC-63: Direct link in email without verified session
    // Open a fresh browser context without any session/cookies
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();

    await freshPage.goto(`/my-tickets?orderId=${orderId}`);
    // Must NOT reveal tickets immediately; must require OTP verification
    await expect(freshPage.getByText('กำลังค้นหาคำสั่งซื้อ')).toBeVisible();
    await expect(freshPage.getByText(`กรุณากรอกอีเมลและเบอร์โทรศัพท์ที่ใช้สั่งซื้อเพื่อยืนยันตัวตน`)).toBeVisible();
    await expect(freshPage.getByText('รายการบัตรเข้างาน')).not.toBeVisible();

    // Fill email + phone on direct link
    await freshPage.locator('#lookup-email').fill(guestEmail);
    await freshPage.locator('#lookup-phone').fill(guestPhone);
    await request.get(
      `/api/auth/test-inspect-reset-token?type=clear_guest_cooldown&email=${encodeURIComponent(guestEmail)}`,
    );
    await freshPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อเปิดดูบัตร' }).click();

    await expect(freshPage.getByRole('heading', { name: 'ยืนยันรหัส OTP' })).toBeVisible();

    const linkOtpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    const linkOtpCode = (await linkOtpRes.json()).code;

    await freshPage.locator('#lookup-otp-code').fill(linkOtpCode);
    await freshPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();

    // Now revealed after OTP
    await expect(freshPage.getByText(orderId)).toBeVisible();
    await expect(freshPage.getByText('ชำระเงินสำเร็จ')).toBeVisible();
    await expect(freshPage.getByText('รายการบัตรเข้างาน (2 ใบ)')).toBeVisible();

    // Design constraints: zero emojis (D-14) and responsive layout
    expect(await freshPage.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await freshPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await freshContext.close();
  });
});
