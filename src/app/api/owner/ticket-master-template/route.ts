import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import {
  parseTicketMasterTemplate,
  readTicketMasterTemplate,
  writeTicketMasterTemplate,
} from '@/server/ticket-master-template';
import { readBoundedJson } from '@/server/upload-quota';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || !['owner', 'organizer'].includes(session.user.role)) {
    return Response.json({ message: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }
  try {
    const template = await readTicketMasterTemplate(getDatabasePool());
    return Response.json(
      { template },
      { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    return createSafeErrorResponse(error, 'โหลดแบบบัตรหลักไม่สำเร็จ', { defaultStatus: 500 });
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
    input = await readBoundedJson(request, 128 * 1024);
  } catch (error) {
    const status = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return Response.json({ message: 'ข้อมูลแบบบัตรหลักไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' }, { status });
  }
  const payload = input as { template?: unknown } | null;
  const template = parseTicketMasterTemplate(payload?.template ?? input);
  if (!template) {
    return Response.json({ message: 'ข้อมูลแบบบัตรหลักไม่ถูกต้อง' }, { status: 400 });
  }
  try {
    await writeTicketMasterTemplate(getDatabasePool(), template);
    return Response.json(
      { success: true, template },
      { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    return createSafeErrorResponse(error, 'บันทึกแบบบัตรหลักไม่สำเร็จ', { defaultStatus: 500 });
  }
}
