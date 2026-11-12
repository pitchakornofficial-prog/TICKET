import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { extractClientIp, requestGuestOtp } from '@/server/guest-otp';
import { isRealPgPool } from '@/server/pg-pool-utils';
import { verifyQueueAccess } from '@/server/queue';
import {
  ensureReservationSchema,
  getEventLimitAndBuyerTicketCount,
  verifyQueueAndGetEventBuyerQuota,
} from '@/server/reservation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: {
    buyer?: { name?: string; email?: string; phone?: string };
    purpose?: string;
    eventId?: string;
    requestedQuantity?: number;
    queueToken?: string | null;
  } = {};

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
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

  const rawQueueToken =
    typeof body.queueToken === 'string'
      ? body.queueToken
      : request.headers.get('x-queue-token') || '';
  const queueToken = rawQueueToken.trim() || null;

  const pool = getDatabasePool();
  try {
    let quotaCheck: { found: boolean; limitPerOrder: number; alreadyPurchased: number } | null = null;
    if (body.eventId && body.buyer.email && isRealPgPool(pool)) {
      const combined = await verifyQueueAndGetEventBuyerQuota(
        pool,
        body.eventId,
        queueToken,
        body.buyer.email,
      );
      if (!combined.queueAllowed) {
        return Response.json(
          {
            message: 'ขณะนี้มีผู้ใช้งานเต็มจำนวน 200 คิวแล้ว กรุณารอตามลำดับคิวในห้องรอคิว',
            code: 'QUEUE_LOCKED',
          },
          { status: 429 },
        );
      }
      quotaCheck = combined;
    } else {
      if (body.eventId) {
        const queueAllowed = await verifyQueueAccess(pool, body.eventId, queueToken);
        if (!queueAllowed) {
          return Response.json(
            {
              message: 'ขณะนี้มีผู้ใช้งานเต็มจำนวน 200 คิวแล้ว กรุณารอตามลำดับคิวในห้องรอคิว',
              code: 'QUEUE_LOCKED',
            },
            { status: 429 },
          );
        }
      }

      // D-59, D-60: Anti-Scalping Cumulative Buyer Limit check before issuing OTP (Email-anchored)
      if (body.eventId && body.buyer.email) {
        await ensureReservationSchema(pool);
        quotaCheck = await getEventLimitAndBuyerTicketCount(
          pool,
          body.eventId,
          body.buyer.email,
        );
      }
    }

    if (quotaCheck?.found && body.buyer.email) {
      const { limitPerOrder, alreadyPurchased } = quotaCheck;
        if (alreadyPurchased >= limitPerOrder) {
          return Response.json(
            {
              message: `ท่านได้สั่งซื้อบัตรคอนเสิร์ตนี้ครบตามจำนวนจำกัดแล้ว (${alreadyPurchased} / ${limitPerOrder} ใบ สำหรับอีเมลนี้) เพื่อกระจายสิทธิ์ให้แก่ผู้ชมท่านอื่น`,
              code: 'CUMULATIVE_LIMIT_EXCEEDED',
              alreadyPurchased,
              limitPerOrder,
              remainingQuota: 0,
              email: body.buyer.email,
            },
            { status: 400 },
          );
        }

        if (
          body.requestedQuantity &&
          alreadyPurchased + Number(body.requestedQuantity) > limitPerOrder
        ) {
          const remainingQuota = Math.max(0, limitPerOrder - alreadyPurchased);
          return Response.json(
            {
              message: `ท่านได้สั่งซื้อหรือมีรายการจองบัตรคอนเสิร์ตนี้ไปแล้ว ${alreadyPurchased} ใบ ไม่สามารถซื้อเพิ่มอีก ${body.requestedQuantity} ใบได้ (สามารถซื้อได้อีกไม่เกิน ${remainingQuota} ใบ เพื่อไม่ให้เกินเพดานจำกัด ${limitPerOrder} ใบ ต่อหนึ่งท่านในคอนเสิร์ตนี้)`,
              code: 'CUMULATIVE_LIMIT_EXCEEDED',
              alreadyPurchased,
              limitPerOrder,
              remainingQuota,
              email: body.buyer.email,
            },
            { status: 400 },
          );
        }
      }

    const clientIp = extractClientIp(request);
    const result = await requestGuestOtp(pool, {
      buyer: body.buyer,
      purpose: 'checkout',
      clientIp,
    });

    if (!result.success) {
      const status =
        result.code === 'MISSING_FIELDS'
          ? 400
          : result.code === 'COOLDOWN' || result.code === 'RATE_LIMITED' || result.code === 'BLOCKED'
            ? 429
            : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json(
      {
        message: 'ส่งรหัส OTP ไปยังอีเมลของคุณเรียบร้อยแล้ว',
        requestId: result.requestId,
        cooldownSeconds: result.cooldownSeconds,
        expiresInSeconds: result.expiresInSeconds,
        ...(result.devOtpCode ? { devOtpCode: result.devOtpCode } : {}),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งรหัส OTP', { defaultStatus: 500 });
  }
}
