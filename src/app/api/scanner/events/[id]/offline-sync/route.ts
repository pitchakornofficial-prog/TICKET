import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { syncOfflineAdmissionScans } from '@/server/admission';
import { verifyScannerSessionEventScope } from '@/server/scanner-scope';
import { assertSameOrigin } from '@/server/origin';
import { isPayloadTooLargeError, readBoundedJson } from '@/server/http-body';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return Response.json({ message: 'ไม่อนุญาต: กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const { role, id, name } = session.user;
  if (role !== 'scanner' && role !== 'organizer') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะเครื่องหลักประจำงานเท่านั้นที่สามารถซิงก์ข้อมูลออฟไลน์ได้' },
      { status: 403 },
    );
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const secret =
      process.env.BETTER_AUTH_SECRET || (auth.options as { secret: string }).secret;
    const scopeCheck = await verifyScannerSessionEventScope(
      pool,
      role,
      request.headers.get('cookie'),
      secret,
      { eventId, scannerId: id },
    );
    if (!scopeCheck.allowed) {
      return Response.json({ message: scopeCheck.reason }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await readBoundedJson(request, 512 * 1024);
    } catch (error) {
      const tooLarge = isPayloadTooLargeError(error);
      return Response.json(
        { message: tooLarge ? 'คำขอมีขนาดใหญ่เกินกำหนด' : 'ข้อมูล JSON ไม่ถูกต้อง' },
        { status: tooLarge ? 413 : 400 },
      );
    }
    const scans = body && typeof body === 'object' && 'scans' in body && Array.isArray(body.scans)
      ? body.scans
      : [];

    let syncActor: { id: string; role: string; name?: string } = { id, role, name };
    if (role === 'organizer') {
      const cookieHeader = request.headers.get('cookie') || '';
      const deviceCookie = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('scanner_device_id='))
        ?.slice('scanner_device_id='.length);

      const priCheck = await pool.query<{
        scannerId: string;
        scannerName: string;
        boundDeviceId: string | null;
      }>(
        `SELECT ps."scannerId", ps."scannerName", es."boundDeviceId"
         FROM events e
         JOIN event_primary_scanners ps ON ps."eventId" = e.id
         JOIN event_scanners es ON es."eventId" = e.id AND es."scannerId" = ps."scannerId"
         WHERE e.id = $1 AND e."organizerId" = $2`,
        [eventId, id],
      );

      if ((priCheck.rowCount ?? 0) === 0) {
        return Response.json(
          { message: 'ไม่อนุญาต: ยังไม่ได้กำหนดเครื่องหลักประจำงาน' },
          { status: 403 },
        );
      }

      const pri = priCheck.rows[0];
      if (!deviceCookie || pri.boundDeviceId !== deviceCookie) {
        return Response.json(
          { message: 'ไม่อนุญาต: อุปกรณ์นี้ไม่ใช่เครื่องหลักที่ผูกสิทธิ์ออฟไลน์ไว้' },
          { status: 403 },
        );
      }

      syncActor = {
        id: pri.scannerId,
        role: 'scanner',
        name: pri.scannerName || name,
      };
    }

    const result = await syncOfflineAdmissionScans(
      pool,
      syncActor,
      eventId,
      { scans },
    );

    return Response.json(result, {
      status: result.authorizationLost ? 409 : 200,
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการซิงก์ข้อมูลออฟไลน์', {
      defaultStatus: 500,
      statusResolver: (msg) => (msg.includes('ไม่อนุญาต') ? 403 : msg.includes('500 รายการ') ? 400 : 500),
    });
  }
}
