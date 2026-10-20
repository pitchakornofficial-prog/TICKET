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

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || 'application/octet-stream';
  const ext = file.name?.split('.').pop() || 'png';
  const key = `posters/${randomUUID()}.${ext}`;

  const { url } = await storage.put(key, buffer, contentType, 'public');
  return Response.json({ url, key }, { status: 201 });
}
