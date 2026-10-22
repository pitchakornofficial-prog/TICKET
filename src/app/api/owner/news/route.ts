import { getAuth } from '@/server/auth';
import { listOwnerNews, createNews } from '@/server/news';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  try {
    const news = await listOwnerNews(pool);
    return Response.json({ news }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงข้อมูลข่าวสาร';
    return Response.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  let body: { title?: string; content?: string; status?: 'draft' | 'published'; coverUrl?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return Response.json({ message: 'กรุณากรอกหัวข้อข่าว' }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return Response.json({ message: 'กรุณากรอกเนื้อหาข่าว' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const newsItem = await createNews(pool, {
      title: body.title,
      content: body.content,
      status: body.status,
      coverUrl: body.coverUrl,
      authorId: session.user.id,
    });
    return Response.json({ message: 'บันทึกข่าวสารสำเร็จ', newsItem }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกข่าว';
    return Response.json({ message }, { status: 500 });
  }
}
