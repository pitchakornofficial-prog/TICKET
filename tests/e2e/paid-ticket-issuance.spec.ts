import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 145 : 195;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Paid ticket issuance flow (TASK-015, AC-11, AC-16, AC-17, AC-18, AC-19, AC-06)', () => {
  test('guest reserves tickets, pays via PromptPay, and receives distinct tickets with unique QR codes without attendee registration', async ({
    page,
    request,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ตออกบัตรสำเร็จ ${testInfo.project.name}`;
    const guestEmail = `buyer-issue-${testInfo.project.name}@ticket.invalid`;
    const guestName = `วีรชัย ผู้รับบัตร ${testInfo.project.name}`;
    const guestPhone = '0898765432';

    // 1. Organizer logs in and creates event
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('ศูนย์การประชุมแห่งชาติสิริกิติ์');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Add session with ticket quota = 40
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-11-30T19:00:00.000Z',
            endTime: '2026-11-30T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตร VIP Zone A', price: 2500, quota: 40 }],
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

    // 2. Owner logs in, approves session
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

    // 5. Select 2 tickets and reserve
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน บัตร VIP Zone A' });
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
    const simulateBtn = page.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();

    // 7. Click simulate payment success
    await simulateBtn.click();

    // 8. Assert Paid state & Ticket Issuance (AC-11, AC-17, AC-19)
    await expect(page.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await expect(page.getByText('ออกบัตรสำเร็จแล้ว (2 ใบ)')).toBeVisible();

    // Buyer info summary
    await expect(page.locator('#buyer-summary-name')).toHaveText(guestName);
    await expect(page.locator('#buyer-summary-email')).toHaveText(guestEmail);
    await expect(page.locator('#buyer-summary-phone')).toHaveText(guestPhone);

    // Tickets cards verification
    const ticketCards = page.locator('.ticket-card');
    await expect(ticketCards).toHaveCount(2);

    const ticketCode0 = (await page.locator('#ticket-code-0').innerText()).trim();
    const ticketCode1 = (await page.locator('#ticket-code-1').innerText()).trim();
    expect(ticketCode0).toMatch(/^TK-/);
    expect(ticketCode1).toMatch(/^TK-/);
    expect(ticketCode0).not.toBe(ticketCode1);

    await expect(page.locator('#ticket-qr-0')).toBeVisible();
    await expect(page.locator('#ticket-qr-1')).toBeVisible();

    // 9. Page reload retains paid status and tickets (AC-18, AC-70)
    await page.reload();
    await expect(page.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    expect(await page.locator('#ticket-code-0').innerText()).toBe(ticketCode0);
    expect(await page.locator('#ticket-code-1').innerText()).toBe(ticketCode1);

    // 10. Verification constraints: zero emojis and responsive layout
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
