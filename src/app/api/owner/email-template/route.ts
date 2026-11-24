import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import {
  parseEmailMasterPayload,
  parseEmailMasterTemplate,
  readEmailMasterPayload,
  writeEmailMasterTemplate,
} from '@/server/email-master-template';
import { readBoundedJson } from '@/server/upload-quota';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || !['owner', 'organizer'].includes(session.user.role)) {
    return Response.json({ message: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }
  try {
    const payload = await readEmailMasterPayload(getDatabasePool());
    return Response.json(
      payload,
      { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    return createSafeErrorResponse(error, 'โหลดแบบอีเมลหลักไม่สำเร็จ', { defaultStatus: 500 });
  }
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'เฉพาะเจ้าของระบบ' }, { status: 403 });
  }
  let input: unknown;
  try {
    input = await readBoundedJson(request, 1024 * 1024);
  } catch (error) {
    const status = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return Response.json({ message: 'ข้อมูลเทมเพลตอีเมลไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' }, { status });
  }

  const payload = parseEmailMasterPayload(input);
  if (payload) {
    try {
      await writeEmailMasterTemplate(getDatabasePool(), payload);
      return Response.json(
        { success: true, ...payload },
        { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
      );
    } catch (error) {
      return createSafeErrorResponse(error, 'บันทึกเทมเพลตอีเมลไม่สำเร็จ', { defaultStatus: 500 });
    }
  }

  // Fallback to single template
  const rawPayload = input as { template?: unknown } | null;
  const template = parseEmailMasterTemplate(rawPayload?.template ?? input);
  if (!template) {
    return Response.json({ message: 'ข้อมูลเทมเพลตอีเมลไม่ถูกต้อง' }, { status: 400 });
  }
  try {
    await writeEmailMasterTemplate(getDatabasePool(), template);
    return Response.json(
      { success: true, template },
      { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    return createSafeErrorResponse(error, 'บันทึกเทมเพลตอีเมลไม่สำเร็จ', { defaultStatus: 500 });
  }
}
