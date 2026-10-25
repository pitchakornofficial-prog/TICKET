import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 140 : 190;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 50)}` });
});

test.describe('Guest checkout email verification and details entry (TASK-011, AC-57, AC-58, AC-59, AC-60)', () => {
  test('guest provides name, email, phone, completes 6-digit OTP verification, and wrong attempts show error', async ({
    page,
    request,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ตยืนยันอีเมล ${testInfo.project.name}`;
    const guestEmail = `buyer-${testInfo.project.name}@ticket.invalid`;
    const guestName = `สมชาย ใจดี ${testInfo.project.name}`;
    const guestPhone = '0812345678';

    // 1. Organizer creates event and session
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

    // Find created event
    const eventsRes = await page.request.get('/api/events');
    expect(eventsRes.status()).toBe(200);
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Add session with ticket types
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        sessions: [
          {
            startTime: '2026-11-20T19:00:00.000Z',
            endTime: '2026-11-20T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตรยืน Early Bird', price: 2500, quota: 100 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    const sessionId = updatedData.event.sessions[0].id;

    // Submit session for approval
    const submitRes = await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });
    expect(submitRes.status()).toBe(200);

    // Organizer logs out
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 2. Owner approves the session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click();
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    // Owner logs out
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 3. Guest opens the public checkout page
    await page.goto(`/events/${createdEvent.id}/checkout`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    // D-45: Verify timer persistence across refresh using stored deadline
    await page.evaluate((id) => {
      sessionStorage.setItem(`ticket_checkout_deadline_${id}`, (Date.now() + 600 * 1000).toString());
    }, createdEvent.id);
    await page.reload();
    await expect(page.locator('.sticky-timer-pill')).toContainText(/9:5\d|10:00/);

    // Verify GuestCheckoutEntry is visible
    await expect(page.getByRole('heading', { name: 'ข้อมูลผู้ซื้อและยืนยันอีเมล (Guest Checkout)' })).toBeVisible();

    // D-45: Verify OTP request button is disabled with guidance when totalTickets === 0
    await expect(page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' })).toBeDisabled();
    await expect(
      page.getByText('กรุณาเลือกจำนวนบัตรอย่างน้อย 1 ใบ ในขั้นตอนที่ 1 ก่อนขอรหัส OTP'),
    ).toBeVisible();

    // Select 1 ticket to unlock buyer details form (D-45 satisfied)
    const addTicketBtn = page.getByRole('button', { name: /เพิ่มจำนวน/ }).first();
    await addTicketBtn.click();
    await expect(page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' })).toBeEnabled();

    // 4. Test missing required fields (AC-60)
    // Missing all fields -> submit
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(page.getByText('กรุณากรอกชื่อ-นามสกุล')).toBeVisible();

    // Fill name only -> submit
    await page.getByLabel('ชื่อ-นามสกุล *').fill(guestName);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(page.getByText('กรุณากรอกอีเมล')).toBeVisible();

    // Fill invalid email -> submit
    await page.getByLabel('อีเมล *').fill('not-an-email');
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(page.getByText('รูปแบบอีเมลไม่ถูกต้อง')).toBeVisible();

    // Fill valid email, missing phone -> submit
    await page.getByLabel('อีเมล *').fill(guestEmail);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(page.getByText('กรุณากรอกเบอร์โทรศัพท์')).toBeVisible();

    // 5. Fill complete valid details (AC-60 satisfied)
    await page.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(guestPhone);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();

    // 6. Arrive at OTP step
    await expect(page.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();
    await expect(page.getByLabel('รหัส OTP 6 หลัก *')).toBeVisible();

    // Inspect generated OTP code from loopback test endpoint
    const otpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    expect(otpRes.status()).toBe(200);
    const { code } = await otpRes.json();
    expect(code).toMatch(/^\d{6}$/);

    // 7. Test wrong OTP submission (AC-57 / AC-59)
    await page.getByLabel('รหัส OTP 6 หลัก *').fill('000000');
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await page.getByRole('button', { name: 'ยืนยันและดำเนินการต่อ' }).click();
    await expect(page.getByText(/รหัส OTP ไม่ถูกต้อง/)).toBeVisible();

    // 8. Submit correct OTP
    await page.getByLabel('รหัส OTP 6 หลัก *').fill(code);
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await page.getByRole('button', { name: 'ยืนยันและดำเนินการต่อ' }).click();

    // 9. Arrive at Verified step (AC-57)
    await expect(page.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();
    await expect(page.locator('#verified-buyer-name')).toHaveText(guestName);
    await expect(page.locator('#verified-buyer-email')).toHaveText(guestEmail);
    await expect(page.locator('#verified-buyer-phone')).toHaveText(guestPhone);
    await expect(page.getByRole('button', { name: 'แก้ไขข้อมูล / เลือกบัตรใหม่' })).toHaveCount(0);

    // 10. Design constraints: Zero emojis (D-14), responsive layout
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
