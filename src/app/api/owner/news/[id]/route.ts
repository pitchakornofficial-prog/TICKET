import { getAuth } from '@/server/auth';
import { deleteNews } from '@/server/news';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ message: 'Missing news id' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const deleted = await deleteNews(pool, id);
    if (!deleted) {
      return Response.json({ message: 'ไม่พบข่าวที่ต้องการลบ' }, { status: 404 });
    }
    return Response.json({ message: 'ลบข่าวสารสำเร็จ' }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการลบข่าว';
    return Response.json({ message }, { status: 500 });
  }
}
