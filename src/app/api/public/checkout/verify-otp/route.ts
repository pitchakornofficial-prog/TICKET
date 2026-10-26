import { getDatabasePool } from '@/server/database';
import { verifyGuestOtp } from '@/server/guest-otp';
import { getBuyerTicketCountForEvent } from '@/server/reservation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: {
    email?: string;
    code?: string;
    requestId?: string;
    purpose?: string;
    eventId?: string;
    buyer?: { name?: string; email?: string; phone?: string };
  } = {};

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.email || !body.code || !body.requestId || !body.buyer) {
    return Response.json({ message: 'กรุณาระบุข้อมูลให้ครบถ้วน' }, { status: 400 });
  }

  const pool = getDatabasePool();
  try {
    const result = await verifyGuestOtp(pool, {
      email: body.email,
      code: body.code,
      requestId: body.requestId,
      purpose: body.purpose || 'checkout',
      buyer: body.buyer,
    });

    if (!result.success) {
      const status = result.code === 'BLOCKED' ? 429 : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    // D-59, D-60: Calculate buyer cumulative quota for this event (Email-anchored)
    let buyerQuota: { alreadyPurchased: number; limitPerOrder: number; remainingQuota: number } | undefined;
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

        buyerQuota = {
          alreadyPurchased,
          limitPerOrder,
          remainingQuota: Math.max(0, limitPerOrder - alreadyPurchased),
        };
      }
    }

    return Response.json(
      {
        message: 'ยืนยันรหัส OTP สำเร็จ',
        verifiedToken: result.verifiedToken,
        buyer: result.buyer,
        buyerQuota,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการยืนยัน OTP';
    return Response.json({ message }, { status: 500 });
  }
}
