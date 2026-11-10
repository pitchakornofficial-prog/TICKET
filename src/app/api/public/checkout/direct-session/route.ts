import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDatabasePool } from '@/server/database';
import { ensureGuestOtpSchema } from '@/server/guest-otp';
import { getBuyerTicketCountForEvent } from '@/server/reservation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const phone = (body.phone || '').trim();
    const eventId = body.eventId;
    const totalTickets = Number(body.totalTickets) || 1;

    if (!name || name.length < 2) {
      return NextResponse.json({ message: 'กรุณากรอกชื่อ-นามสกุลให้ถูกต้อง' }, { status: 400 });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 });
    }

    if (!phone || phone.length < 9) {
      return NextResponse.json({ message: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง' }, { status: 400 });
    }

    let pool = null;
    try {
      pool = getDatabasePool();
    } catch {
      // fallback if db is offline
    }

    const verifiedToken = `gver_${randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15-minute checkout window

    let buyerQuota = {
      alreadyPurchased: 0,
      limitPerOrder: 4,
      remainingQuota: 4,
    };

    if (pool) {
      await ensureGuestOtpSchema(pool);

      // Check cumulative buyer quota if eventId provided
      if (eventId) {
        const eventRes = await pool.query(
          'SELECT "limitPerOrder" FROM events WHERE id = $1',
          [eventId],
        );
        if (eventRes.rowCount && eventRes.rowCount > 0) {
          const limitPerOrder = Number(eventRes.rows[0].limitPerOrder) || 4;
          const alreadyPurchased = await getBuyerTicketCountForEvent(pool, eventId, email, phone, now);
          const remainingQuota = Math.max(0, limitPerOrder - alreadyPurchased);

          buyerQuota = { alreadyPurchased, limitPerOrder, remainingQuota };

          if (alreadyPurchased >= limitPerOrder) {
            return NextResponse.json(
              {
                message: `ท่านได้สั่งซื้อบัตรคอนเสิร์ตนี้ครบตามจำนวนจำกัดแล้ว (${alreadyPurchased} / ${limitPerOrder} ใบ สำหรับอีเมลนี้) เพื่อกระจายสิทธิ์ให้แก่ผู้ชมท่านอื่น`,
                code: 'QUOTA_EXCEEDED',
                buyerQuota,
              },
              { status: 400 },
            );
          }

          if (alreadyPurchased + totalTickets > limitPerOrder) {
            return NextResponse.json(
              {
                message: `ท่านเลือกซื้อบัตร ${totalTickets} ใบ เกินสิทธิ์คงเหลือที่สามารถซื้อได้อีก ${remainingQuota} ใบ สำหรับคอนเสิร์ตนี้`,
                code: 'QUOTA_EXCEEDED',
                buyerQuota,
              },
              { status: 400 },
            );
          }
        }
      }

      // Record direct verified session in database
      await pool.query(
        `INSERT INTO guest_verified_sessions (token, email, name, phone, purpose, "verifiedAt", "expiresAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [verifiedToken, email, name, phone, 'checkout', now, expiresAt],
      );
    }

    return NextResponse.json({
      success: true,
      verifiedToken,
      buyer: {
        token: verifiedToken,
        name,
        email,
        phone,
      },
      buyerQuota,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ซื้อ';
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
