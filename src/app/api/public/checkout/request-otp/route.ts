import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { extractClientIp, requestGuestOtp } from '@/server/guest-otp';
import { verifyQueueAccess } from '@/server/queue';
import { readQueueCookie } from '@/server/queue-cookie';
import { randomUUID } from 'node:crypto';
import { isPayloadTooLargeError, readBoundedJson } from '@/server/http-body';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: {
    buyer?: { name?: string; email?: string; phone?: string };
    purpose?: string;
    eventId?: string;
    requestedQuantity?: number;
  } = {};

  try {
    body = await readBoundedJson<typeof body>(request, 32 * 1024);
  } catch (error) {
    return Response.json(
      { message: isPayloadTooLargeError(error) ? 'Payload too large' : 'Invalid JSON body' },
      { status: isPayloadTooLargeError(error) ? 413 : 400 },
    );
  }

  if (!body.buyer) {
    return Response.json({ message: 'กรุณาระบุข้อมูลผู้ซื้อ' }, { status: 400 });
  }

  // Security: reject client-tampered purpose (Issue #6)
  if (body.purpose && body.purpose !== 'checkout') {
    return Response.json(
      { message: 'วัตถุประสงค์ (purpose) ไม่ถูกต้องสำหรับขั้นตอนนี้', code: 'INVALID_INPUT' },
      { status: 400 },
    );
  }

  const pool = getDatabasePool();
  try {
    if (body.eventId) {
      const queueToken = readQueueCookie(request, body.eventId)?.entryToken ?? null;
      const queueAllowed = await verifyQueueAccess(pool, body.eventId, queueToken);
      if (!queueAllowed) {
        return Response.json(
          {
            message: 'ขณะนี้มีผู้ใช้งานเต็มจำนวน 200 คิวแล้ว กรุณารอตามลำดับคิวในห้องรอคิว',
            code: 'QUEUE_LOCKED',
          },
          { status: 429, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
        );
      }
    }

    const clientIp = extractClientIp(request);
    const result = await requestGuestOtp(pool, {
      buyer: body.buyer,
      purpose: 'checkout',
      clientIp,
    });

    if (!result.success && result.code === 'MISSING_FIELDS') {
      return Response.json(
        { message: result.error, code: result.code },
        { status: 400, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
      );
    }

    return Response.json(
      {
        message: 'หากคำขอนี้ผ่านเงื่อนไข รหัส OTP จะถูกส่งไปยังอีเมล กรุณาตรวจกล่องจดหมายและลองใหม่ภายหลังหากยังไม่ได้รับ',
        requestId: result.success ? result.requestId : randomUUID(),
        cooldownSeconds: 60,
        expiresInSeconds: 300,
        ...(result.devOtpCode ? { devOtpCode: result.devOtpCode } : {}),
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งรหัส OTP', { defaultStatus: 500 });
  }
}
