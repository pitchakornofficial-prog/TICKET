import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { parseContactInfo, readOwnerContactInfo, writeOwnerContactInfo } from '@/server/owner-contact-info';
import { readBoundedJson } from '@/server/upload-quota';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || !['owner', 'organizer'].includes(session.user.role)) return Response.json({ message: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  try {
    return Response.json({ contact: await readOwnerContactInfo(getDatabasePool()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return createSafeErrorResponse(error, 'โหลดข้อมูลติดต่อไม่สำเร็จ', { defaultStatus: 500 });
  }
}

export async function PUT(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') return Response.json({ message: 'เฉพาะเจ้าของระบบ' }, { status: 403 });
  let input: unknown;
  try {
    input = await readBoundedJson(request, 32 * 1024);
  } catch (error) {
    const status = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return Response.json({ message: 'ข้อมูลติดต่อไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' }, { status });
  }
  const contact = parseContactInfo(input);
  if (!contact) return Response.json({ message: 'ข้อมูลติดต่อไม่ถูกต้อง' }, { status: 400 });
  try {
    await writeOwnerContactInfo(getDatabasePool(), contact);
    return Response.json({ contact }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return createSafeErrorResponse(error, 'บันทึกข้อมูลติดต่อไม่สำเร็จ', { defaultStatus: 500 });
  }
}
