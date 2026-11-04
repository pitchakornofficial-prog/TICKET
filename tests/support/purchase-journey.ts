import { expect, type Page } from '@playwright/test';

export async function reserveThroughCheckout(page: Page, input: {
  eventId: string;
  buyer: { name: string; email: string; phone: string };
  tickets: { name: string; quantity: number }[];
}) {
  await page.goto(`/events/${input.eventId}/checkout`);
  for (const ticket of input.tickets) {
    for (let index = 0; index < ticket.quantity; index++) {
      await page.getByRole('button', { name: `เพิ่มจำนวน ${ticket.name}`, exact: true }).click();
    }
  }
  await page.getByLabel('ชื่อ-นามสกุล *').fill(input.buyer.name);
  await page.getByLabel('อีเมล *').fill(input.buyer.email);
  await page.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(input.buyer.phone);
  await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
  await expect(page.getByLabel('รหัส OTP 6 หลัก *')).toBeVisible();
  const otp = await page.request.get(`/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(input.buyer.email)}`);
  expect(otp.status()).toBe(200);
  const { code } = await otp.json();
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel('รหัส OTP 6 หลัก *').fill(code);
  await page.getByRole('button', { name: 'ยืนยันรหัส OTP', exact: true }).click();
  await page.getByRole('button', { name: 'ยืนยันและดำเนินการต่อ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();
  await page.locator('#confirm-reservation-btn').click();
  await expect(page).toHaveURL(/\/orders\/ORD-[A-Z0-9-]+\/payment$/);
  await expect(page.locator('#promptpay-qr-image')).toBeVisible();
  return (await page.locator('#reservation-order-id').innerText()).trim();
}
