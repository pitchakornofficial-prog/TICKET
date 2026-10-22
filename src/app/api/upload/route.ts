import { getAuth } from '@/server/auth';
import { storage } from '@/server/storage';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || (session.user.role !== 'organizer' && session.user.role !== 'owner')) {
    return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof Blob)) {
    return Response.json({ message: 'ไม่พบไฟล์' }, { status: 400 });
  }

  const requestedVisibility = (formData.get('visibility') as string) || 'public';
  const visibility: 'public' | 'private' = requestedVisibility === 'private' ? 'private' : 'public';

  // Only owner can upload private proof documents
  if (visibility === 'private' && session.user.role !== 'owner') {
    return Response.json({ message: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่สามารถอัปโหลดไฟล์หลักฐานส่วนตัวได้ (AC-92)' }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || 'application/octet-stream';
  const ext = file.name?.split('.').pop() || 'png';
  const prefix = visibility === 'private' ? 'proofs' : 'posters';
  const key = `${prefix}/${randomUUID()}.${ext}`;

  const { url } = await storage.put(key, buffer, contentType, visibility);
  return Response.json({ url, key }, { status: 201 });
}
