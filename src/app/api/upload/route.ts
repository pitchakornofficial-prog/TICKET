import { getAuth } from '@/server/auth';
import { storage } from '@/server/storage';
import { validateUploadedFile } from '@/server/file-validator';
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
  const originalFilename = file.name || 'upload.png';
  const claimedContentType = file.type || 'application/octet-stream';

  const validation = validateUploadedFile(buffer, claimedContentType, originalFilename, visibility);
  if (!validation.valid) {
    return Response.json({ message: validation.error }, { status: 400 });
  }

  const finalContentType = validation.detectedContentType || 'application/octet-stream';
  const finalExt = validation.normalizedExtension || 'png';
  const prefix = visibility === 'private' ? 'proofs' : 'posters';
  const key = `${prefix}/${randomUUID()}.${finalExt}`;

  const { url } = await storage.put(key, buffer, finalContentType, visibility);
  return Response.json({ url, key }, { status: 201 });
}
