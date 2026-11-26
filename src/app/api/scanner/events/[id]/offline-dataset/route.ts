import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { bindOrganizerPrimaryDevice } from '@/server/events';
import { getOfflineDataset } from '@/server/primary-scanner';
import { verifyScannerSessionEventScope } from '@/server/scanner-scope';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
      .filter(([k]) => Boolean(k)),
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const secret =
      process.env.BETTER_AUTH_SECRET || (auth.options as { secret: string }).secret;
    const scopeCheck = await verifyScannerSessionEventScope(
      pool,
      session.user.role,
      request.headers.get('cookie'),
      secret,
      { eventId, scannerId: session.user.id },
    );
    if (!scopeCheck.allowed) {
      return Response.json({ message: scopeCheck.reason }, { status: 403 });
    }

    let newDeviceIdToSet: string | null = null;
    if (session.user.role === 'organizer') {
      const cookieMap = parseCookies(request.headers.get('cookie') || '');
      let deviceId = cookieMap.scanner_device_id;
      if (!deviceId) {
        deviceId = randomUUID();
        newDeviceIdToSet = deviceId;
      }

      const bindOutcome = await bindOrganizerPrimaryDevice(
        pool,
        session.user.id,
        eventId,
        deviceId,
      );
      if (bindOutcome.status === 'bound_other_device') {
        const conflictRes = NextResponse.json(
          {
            message:
              'เครื่องหลักถูกผูกกับอุปกรณ์อื่นอยู่แล้ว หากต้องการใช้เครื่องนี้แทน กรุณากด "รีเซ็ตการผูกเครื่อง" ในหน้าจัดการทีมสแกนก่อน',
          },
          {
            status: 409,
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
          },
        );
        if (newDeviceIdToSet) {
          const isSecure = new URL(request.url).protocol === 'https:';
          conflictRes.cookies.set({
            name: 'scanner_device_id',
            value: newDeviceIdToSet,
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: isSecure,
            maxAge: 365 * 24 * 60 * 60,
          });
        }
        return conflictRes;
      }
    }

    const dataset = await getOfflineDataset(
      pool,
      { id: session.user.id, role: session.user.role },
      eventId,
    );
    const res = NextResponse.json(dataset, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
    if (newDeviceIdToSet) {
      const isSecure = new URL(request.url).protocol === 'https:';
      res.cookies.set({
        name: 'scanner_device_id',
        value: newDeviceIdToSet,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isSecure,
        maxAge: 365 * 24 * 60 * 60,
      });
    }
    return res;
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงชุดข้อมูลออฟไลน์', {
      defaultStatus: 400,
      statusResolver: (msg) => (msg.includes('ไม่อนุญาต') ? 403 : msg.includes('ไม่พบ') ? 404 : 400),
    });
  }
}
