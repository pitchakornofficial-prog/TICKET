import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import {
  parseHeroBannersList,
  readHomeBanners,
  writeHomeBanners,
} from '@/server/home-banners';
import { readBoundedJson } from '@/server/upload-quota';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || !['owner', 'organizer'].includes(session.user.role)) {
    return Response.json({ message: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  try {
    const banners = await readHomeBanners(getDatabasePool());
    return Response.json(
      { banners },
      { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    return createSafeErrorResponse(error, 'โหลดรายการแบนเนอร์ไม่สำเร็จ', { defaultStatus: 500 });
  }
}

export async function PUT(request: Request) {
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
    return Response.json({ message: 'ข้อมูลแบนเนอร์ไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' }, { status });
  }

  const payload = input as { banners?: unknown } | null;
  const rawList = payload?.banners ?? input;
  const parsed = parseHeroBannersList(rawList);

  if (parsed === null) {
    return Response.json({ message: 'รูปแบบข้อมูลแบนเนอร์ไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    await writeHomeBanners(getDatabasePool(), parsed);
    return Response.json(
      { success: true, banners: parsed },
      { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    return createSafeErrorResponse(error, 'บันทึกแบนเนอร์ไม่สำเร็จ', { defaultStatus: 500 });
  }
}
