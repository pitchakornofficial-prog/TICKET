import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { recordAdmissionScan } from '@/server/admission';

export async function POST(req: Request) {
  let requestHeaders: Headers;
  try {
    requestHeaders = await headers();
  } catch {
    requestHeaders = new Headers(req.headers);
  }
  const actor = await readActor(getAuth(), requestHeaders);
  if (!actor) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  if (!['scanner', 'organizer', 'owner'].includes(actor.role)) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ใช้งานเครื่องสแกนบัตร' },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { sessionId, qrPayloadOrCode, action } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_INPUT', message: 'ระบุรอบการแสดงไม่ถูกต้อง' },
        { status: 400 },
      );
    }

    if (!qrPayloadOrCode || typeof qrPayloadOrCode !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_INPUT', message: 'กรุณาระบุรหัสบัตรหรือ QR Code' },
        { status: 400 },
      );
    }

    if (action !== 'entry' && action !== 'exit') {
      return NextResponse.json(
        { error: 'INVALID_INPUT', message: 'การดำเนินการต้องเป็น entry หรือ exit' },
        { status: 400 },
      );
    }

    const pool = getDatabasePool();
    const auth = getAuth();
    const secret =
      process.env.BETTER_AUTH_SECRET || (auth.options as { secret: string }).secret;
    const { verifyScannerSessionEventScope } = await import('@/server/scanner-scope');
    const scopeCheck = await verifyScannerSessionEventScope(
      pool,
      actor.role,
      req.headers.get('cookie'),
      secret,
      { sessionId, scannerId: actor.id },
    );
    if (!scopeCheck.allowed) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: scopeCheck.reason },
        { status: 403 },
      );
    }

    const result = await recordAdmissionScan(pool, {
      scannerId: actor.id,
      scannerName: actor.name,
      scannerRole: actor.role,
      sessionId,
      qrPayloadOrCode,
      action,
    });

    if (result.reason === 'UNAUTHORIZED_EVENT') {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: result.message, result },
        { status: 403 },
      );
    }

    return NextResponse.json({ result });
  } catch (err: unknown) {
    console.error('Error during ticket scan:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดในการสแกนบัตร' }, { status: 500 });
  }
}
