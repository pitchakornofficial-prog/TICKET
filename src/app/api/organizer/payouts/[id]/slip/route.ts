import { getAuth, type TicketAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { storage } from '@/server/storage';
import { generateBankSlipSvg, generateBankSlipSvgDataUrl } from '@/lib/bank-slip';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth: TicketAuth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return new Response('Unauthorized: กรุณาเข้าสู่ระบบก่อนเข้าถึงสลิปการโอนเงิน', {
      status: 401,
    });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return new Response('Forbidden: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้นที่สามารถดูสลิปการโอนเงินได้ (AC-92)', {
      status: 403,
    });
  }

  const { id: payoutId } = await params;
  const pool: Pool = getDatabasePool();

  try {
    const res = await pool.query<{
      id: string;
      eventId: string;
      amount: string;
      paidAt: Date | null;
      createdAt: Date;
      transferProofKey: string | null;
      transferProofUrl: string | null;
      transferNote: string | null;
      organizerId: string;
      eventTitle: string;
      organizerName: string | null;
    }>(
      `SELECT ep.id, ep."eventId", ep.amount::text, ep."paidAt", ep."createdAt",
              ep."transferProofKey", ep."transferProofUrl", ep."transferNote",
              e."organizerId", e.title AS "eventTitle",
              u.name AS "organizerName"
       FROM event_payouts ep
       JOIN events e ON e.id = ep."eventId"
       LEFT JOIN auth_user u ON u.id = e."organizerId"
       WHERE ep.id = $1`,
      [payoutId],
    );

    if (res.rowCount === 0) {
      return new Response('ไม่พบข้อมูลรอบการโอนเงิน', { status: 404 });
    }

    const payout = res.rows[0];

    // Multi-tenant check: organizer can only view payouts for their own event
    if (session.user.role === 'organizer' && payout.organizerId !== session.user.id) {
      return new Response('Forbidden: คุณไม่มีสิทธิ์ดูสลิปของคอนเสิร์ตอื่น (AC-92)', {
        status: 403,
      });
    }

    // 1. If admin uploaded an actual proof file into storage
    if (payout.transferProofKey) {
      const item = await storage.get(payout.transferProofKey);
      if (item) {
        if (request.headers.get('accept')?.includes('application/json')) {
          return Response.json({
            success: true,
            hasUploadedProof: true,
            slipUrl: `/api/organizer/payouts/${payoutId}/slip`,
          });
        }
        const isPdf = item.contentType === 'application/pdf';
        const contentDisposition = isPdf
          ? `attachment; filename="payout-slip-${payoutId}.pdf"`
          : `inline; filename="payout-slip-${payoutId}.png"`;

        return new Response(new Uint8Array(item.data), {
          status: 200,
          headers: {
            'Content-Type': item.contentType || 'image/png',
            'Content-Disposition': contentDisposition,
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          },
        });
      }
    }

    // 2. If payout has a custom valid URL that is not the old Unsplash desk photo
    const isUnsplashDeskPlaceholder =
      payout.transferProofUrl?.includes('photo-1554224155-6726b3ff858f');

    if (payout.transferProofUrl && !isUnsplashDeskPlaceholder) {
      if (request.headers.get('accept')?.includes('application/json')) {
        return Response.json({
          success: true,
          hasUploadedProof: true,
          slipUrl: payout.transferProofUrl,
        });
      }
      return Response.redirect(payout.transferProofUrl, 302);
    }

    // 3. Fallback to generating high-fidelity bank transfer e-slip SVG
    const slipSvg = generateBankSlipSvg({
      amount: Number(payout.amount) || 0,
      paidAt: payout.paidAt || payout.createdAt,
      transferRef: `TXN-${payout.id.slice(0, 8).toUpperCase()}`,
      eventTitle: payout.eventTitle,
      receiverName: payout.organizerName || 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี',
      note: payout.transferNote || 'รอบโอนเงินค่าบัตรคอนเสิร์ต',
    });

    if (request.headers.get('accept')?.includes('application/json')) {
      const dataUrl = generateBankSlipSvgDataUrl({
        amount: Number(payout.amount) || 0,
        paidAt: payout.paidAt || payout.createdAt,
        transferRef: `TXN-${payout.id.slice(0, 8).toUpperCase()}`,
        eventTitle: payout.eventTitle,
        receiverName: payout.organizerName || 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี',
        note: payout.transferNote || 'รอบโอนเงินค่าบัตรคอนเสิร์ต',
      });
      return Response.json({
        success: true,
        hasUploadedProof: false,
        slipUrl: dataUrl,
      });
    }

    return new Response(slipSvg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return new Response(msg, { status: 500 });
  }
}
