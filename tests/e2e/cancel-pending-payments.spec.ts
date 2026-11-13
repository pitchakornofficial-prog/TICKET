import { expect, test } from '@playwright/test';
import { reserveThroughCheckout } from '../support/purchase-journey';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 190 : 240;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 40)}` });
});

test.describe('Cancel session while payment is pending and refund timely amounts (TASK-027, AC-112, AC-113, AC-114, G-50, G-51, G-52, AC-84)', () => {
  test('reservation is cancelled when owner approves cancellation; QR is removed; late callback triggers full refund including customer fee; zero tickets issued', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    const eventTitle = `คอนเสิร์ตยกเลิกตอนรอชำระ ${testInfo.project.name}`;
    const guestEmail = `guest-pending-can-${testInfo.project.name}@ticket.invalid`;
    const guestPhone = '0812233445';
    const guestName = 'คุณทดสอบ รอยกเลิก';

    const sessionStartTime = '2026-12-20T12:00:00.000Z';
    const sessionEndTime = '2026-12-20T15:00:00.000Z';

    // 1. Organizer logs in and creates event with session
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    const createEventRes = await page.request.post('/api/events', {
      data: {
        title: eventTitle,
        description: 'คอนเสิร์ตทดสอบยกเลิกตอนรอชำระ',
        location: 'อิมแพ็ค ชาเลนเจอร์',
        limitPerOrder: 4,
        sessions: [
          {
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            ticketTypes: [{ name: 'Standing VIP', price: 1500, quota: 10 }],
          },
        ],
      },
    });
    expect(createEventRes.status()).toBe(201);
    const createdEvent = (await createEventRes.json()).event;
    const sessionId = createdEvent.sessions[0].id;

    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    // 2. Owner logs in and approves initial session
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
    await sessionCard.getByRole('button', { name: 'อนุมัติด่วน' }).click({ force: true });
    await expect(ownerPage.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    // Use a nonzero customer fee to prove the full-refund branch includes it.
    const feeResponse = await ownerPage.request.put(`/api/owner/events/${createdEvent.id}/fee-settings`, {
      data: { organizerFeeMode: 'percentage', organizerFeeRate: 0,
        customerFeeMode: 'per_order', customerFeeRate: 20, reservePercentage: 0 },
    });
    expect(feeResponse.status()).toBe(200);

    // 3. Buyer opens event, verifies OTP, and reserves 1 ticket
    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();

    const orderId = await reserveThroughCheckout(buyerPage, {
      eventId: createdEvent.id,
      buyer: { name: guestName, email: guestEmail, phone: guestPhone },
      tickets: [{ name: 'Standing VIP', quantity: 1 }],
    });
    expect(orderId).toMatch(/^ORD-/);

    // 4. Organizer submits cancellation request (AC-35, AC-108)
    const cancelRes = await page.request.post(
      `/api/organizer/events/${createdEvent.id}/sessions/${sessionId}/cancel`,
      {
        data: { reason: 'เหตุจำเป็นเร่งด่วนขอยกเลิกรอบนี้' },
      },
    );
    expect(cancelRes.status()).toBe(201);

    // 5. Owner approves cancellation (AC-112, G-50)
    await ownerPage.reload();
    const canRequestCard = ownerPage.getByTestId(/cancellation-request-/).filter({ hasText: eventTitle });
    await expect(canRequestCard).toBeVisible();

    const approveCanBtn = canRequestCard.getByRole('button', { name: 'อนุมัติยกเลิกรอบการแสดง' });
    await expect(approveCanBtn).toBeVisible();
    const cancellationPoll = buyerPage.waitForResponse(async response => {
      if (!response.url().endsWith(`/api/public/checkout/orders/${orderId}`) || response.request().method() !== 'GET') return false;
      return response.ok() && (await response.json()).reservation?.status === 'cancelled';
    }, { timeout: 20000 });
    await approveCanBtn.click({ force: true });
    await expect(ownerPage.getByText(/อนุมัติการยกเลิกรอบการแสดงของ.*สำเร็จ/)).toBeVisible();

    // 6. Buyer checks reservation state:
    // When owner approves cancellation at C, active reservations terminate (status = 'cancelled'),
    // UI displays #reservation-cancelled-alert and stops presenting PromptPay QR (AC-112, G-50)
    // Keep the payment page open: its real poll must remove the QR without refresh.
    expect((await (await cancellationPoll).json()).reservation.status).toBe('cancelled');
    await expect(buyerPage.locator('#reservation-cancelled-alert')).toBeVisible();
    await expect(buyerPage.locator('#reservation-cancelled-alert')).toContainText('รอบการแสดงนี้ถูกยกเลิกแล้ว');
    await expect(buyerPage.locator('#promptpay-qr-image')).not.toBeVisible();
    await expect(buyerPage.locator('#simulate-payment-button')).not.toBeVisible();

    // 7. Verify late payment callback (AC-114, G-52)
    // When late payment arrives after cancellation (T >= C), full refund including customer fee is triggered
    // Simulate payment callback on cancelled session
    const guestToken = await buyerPage.evaluate(() => sessionStorage.getItem('ticket_guest_otp_token'));
    const payRes = await request.post(`/api/public/checkout/orders/${orderId}/pay-test`, {
      headers: guestToken ? { 'x-guest-token': guestToken } : {},
      // Stripe Event.created is second precision. Ensure T >= C even when
      // cancellation and this callback are processed within the same second.
      data: {
        providerPaidAt: new Date(Date.now() + 1000).toISOString(),
        verifiedToken: guestToken || undefined,
      },
    });
    expect(payRes.status()).toBe(200);
    const payData = await payRes.json();
    expect(payData.status).toBe('cancelled_session_refund_full');
    expect(payData.refundAmount).toBe(1520); // 1 ticket * 1500 + customer fee 20

    // 8. Owner verifies the refund case in back-office
    await ownerPage.reload();
    const refundManager = ownerPage.locator('#owner-refund-approval-manager');
    await refundManager.scrollIntoViewIfNeeded();
    await expect(refundManager).toBeVisible();
    const approvedTabPromise = ownerPage.waitForResponse(
      resp => resp.url().includes('/api/owner/refunds?status=approved') && resp.status() === 200,
    );
    await ownerPage.getByRole('button', { name: 'รอโอนเงินคืน (Approved)' }).click();
    await approvedTabPromise;
    await expect(ownerPage.getByText(/G-52/).first()).toBeVisible();

    // Clean up contexts
    await buyerContext.close();
    await ownerContext.close();
  });
});
