import { getDatabasePool } from '@/server/database';
import { requestGuestOtp } from '@/server/guest-otp';
import { getBuyerTicketCountForEvent } from '@/server/reservation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: {
    buyer?: { name?: string; email?: string; phone?: string };
    purpose?: string;
    eventId?: string;
    requestedQuantity?: number;
  } = {};

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.buyer) {
    return Response.json({ message: 'กรุณาระบุข้อมูลผู้ซื้อ' }, { status: 400 });
  }

  const pool = getDatabasePool();
  try {
    // D-59, D-60: Anti-Scalping Cumulative Buyer Limit check before issuing OTP (Email-anchored)
    if (body.eventId && body.buyer.email) {
      const eventRes = await pool.query(
        'SELECT "limitPerOrder" FROM events WHERE id = $1',
        [body.eventId],
      );
      if (eventRes.rowCount && eventRes.rowCount > 0) {
        const limitPerOrder = Number(eventRes.rows[0].limitPerOrder) || 4;
        const alreadyPurchased = await getBuyerTicketCountForEvent(
          pool,
          body.eventId,
          body.buyer.email,
        );

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
    }

    const result = await requestGuestOtp(pool, {
      buyer: body.buyer,
      purpose: body.purpose || 'checkout',
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
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการส่งรหัส OTP';
    return Response.json({ message }, { status: 500 });
  }
}
