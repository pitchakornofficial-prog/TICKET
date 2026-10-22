import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 160 : 210;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 40)}` });
});

test.describe('Approved live session edits & quota protection (TASK-024, AC-67, AC-68, AC-109)', () => {
  test('handles amendment workflow, protects existing reservation quote, updates new buyer price, and rejects quota below held rights', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(90000);
    const eventTitle = `คอนเสิร์ตแก้ไขรอบสด ${testInfo.project.name}`;
    const buyer1Email = `buyer1-amd-${testInfo.project.name}@ticket.invalid`;
    const buyer2Email = `buyer2-amd-${testInfo.project.name}@ticket.invalid`;

    // 1. Organizer logs in and creates event with session (price: 1,000 THB, quota: 20)
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('รอยัล พารากอน ฮอลล์');
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
            startTime: '2026-12-10T19:00:00.000Z',
            endTime: '2026-12-10T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตร Regular Standard', price: 1000, quota: 20 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    const sessionId = updatedData.event.sessions[0].id;
    const ticketTypeId = updatedData.event.sessions[0].ticketTypes[0].id;

    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 2. Owner logs in, approves session
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

    // 3. Buyer 1 reserves and buys 2 tickets at 1,000 THB in isolated buyerContext
    const buyerContext = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.99' },
    });
    const buyerPage = await buyerContext.newPage();

    await buyerPage.goto(`/events/${createdEvent.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle })).toBeVisible();
    await expect(buyerPage.getByText('฿1,000.00').first()).toBeVisible();

    await buyerPage.getByLabel('ชื่อ-นามสกุล *').fill('ผู้ซื้อท่านที่หนึ่ง');
    await buyerPage.getByLabel('อีเมล *').fill(buyer1Email);
    await buyerPage.getByLabel('เบอร์โทรศัพท์มือถือ *').fill('0811111111');
    await buyerPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(buyerPage.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otp1Res = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(buyer1Email)}`,
    );
    const { code: code1 } = await otp1Res.json();
    await buyerPage.getByLabel('รหัส OTP 6 หลัก *').fill(code1);
    await buyerPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(buyerPage.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    const addBtn1 = buyerPage.getByRole('button', { name: 'เพิ่มจำนวน บัตร Regular Standard' });
    await addBtn1.click();
    await addBtn1.click();
    await buyerPage.getByRole('button', { name: 'ยืนยันการเลือกบัตร (2 ใบ)' }).click();
    await expect(buyerPage.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    // Pay for Buyer 1
    await buyerPage.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' }).click();
    await expect(buyerPage.locator('#promptpay-qr-image')).toBeVisible();
    await buyerPage.locator('#simulate-payment-button').click();
    await expect(buyerPage.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await expect(buyerPage.getByText('ออกบัตรสำเร็จแล้ว (2 ใบ)')).toBeVisible();

    // 4. Reset buyer session state for Buyer 2 (heldQuota will become 3)
    await buyerContext.clearCookies();
    await buyerPage.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });

    await buyerPage.goto(`/events/${createdEvent.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle })).toBeVisible();
    await buyerPage.getByLabel('ชื่อ-นามสกุล *').fill('ผู้ซื้อท่านที่สอง');
    await buyerPage.getByLabel('อีเมล *').fill(buyer2Email);
    await buyerPage.getByLabel('เบอร์โทรศัพท์มือถือ *').fill('0822222222');
    await buyerPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(buyerPage.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otp2Res = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(buyer2Email)}`,
    );
    const { code: code2 } = await otp2Res.json();
    await buyerPage.getByLabel('รหัส OTP 6 หลัก *').fill(code2);
    await buyerPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(buyerPage.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    const addBtn2 = buyerPage.getByRole('button', { name: 'เพิ่มจำนวน บัตร Regular Standard' });
    await addBtn2.click();
    await buyerPage.getByRole('button', { name: 'ยืนยันการเลือกบัตร (1 ใบ)' }).click();
    await expect(buyerPage.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    // Verify locked quote for Buyer 2: Subtotal 1,000 THB
    const buyer2OrderId = (await buyerPage.locator('#reservation-order-id').innerText()).trim();
    expect(buyer2OrderId).toMatch(/^ORD-/);

    // 5. Organizer submits amendment via UI on admin page
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    // Open amendment form
    await page.locator(`[data-testid="open-amendment-btn-${createdEvent.id}"]`).click({ force: true });
    await expect(page.locator('#amendment-form-section')).toBeVisible();

    // First verify AC-109 rejection on low quota (< heldQuota 3)
    await page.locator(`[data-testid="amendment-quota-${ticketTypeId}"]`).fill('2');
    await page.locator('[data-testid="submit-amendment-btn"]').click();
    await expect(page.getByText(/น้อยกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้ว/)).toBeVisible();

    // Now fill valid amendment: price 1,800, quota 25
    await page.locator(`[data-testid="amendment-price-${ticketTypeId}"]`).fill('1800');
    await page.locator(`[data-testid="amendment-quota-${ticketTypeId}"]`).fill('25');
    await page.locator('[data-testid="submit-amendment-btn"]').click();
    await expect(page.getByText(/ยื่นคำขอแก้ไขรอบการแสดงสำเร็จ/)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 6. While amendment is pending: public page still shows 1,000 THB (AC-67, G-12)
    const publicBeforeRes = await page.request.get(`/api/public/events/${createdEvent.id}`);
    expect(publicBeforeRes.status()).toBe(200);
    const publicBeforeData = await publicBeforeRes.json();
    expect(Number(publicBeforeData.event.sessions[0].ticketTypes[0].price)).toBe(1000);

    // 7. Owner logs in and approves amendment
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    // Check amendment card
    await expect(
      page.getByRole('heading', { name: 'คำขอแก้ไขรอบที่เปิดขายอยู่ (Live Session Amendments — AC-67, AC-68, AC-109)' }),
    ).toBeVisible();
    await expect(page.getByText('฿1,000.00 →')).toBeVisible();
    await expect(page.getByText('฿1,800.00')).toBeVisible();

    // Click approve amendment
    const approveBtn = page.getByRole('button', { name: 'อนุมัติการแก้ไข (AC-67)' });
    await approveBtn.scrollIntoViewIfNeeded();
    await approveBtn.dispatchEvent('click');
    await expect(page.getByText(/อนุมัติการแก้ไขรอบของ/)).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 8. Public session now reflects updated price 1,800 THB (AC-67)
    await buyerContext.clearCookies();
    await buyerPage.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    await buyerPage.goto(`/events/${createdEvent.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle })).toBeVisible();
    await expect(buyerPage.getByText('฿1,800.00').first()).toBeVisible();

    // 9. Buyer 2's pre-existing active reservation retains original 1,000 THB quote throughout 15-minute hold (AC-68)
    const orderCheckRes = await page.request.get(`/api/public/orders/${buyer2OrderId}`);
    if (orderCheckRes.status() === 200) {
      const orderData = await orderCheckRes.json();
      expect(Number(orderData.order.total)).toBe(1000);
    }

    await buyerContext.close();
  });
});
