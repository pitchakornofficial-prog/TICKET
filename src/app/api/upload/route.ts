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

  // 1. File Size Validation (Max 10MB)
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ message: 'ขนาดไฟล์เกินกำหนด (สูงสุด 10MB)' }, { status: 400 });
  }

  // 2. Extension & MIME Whitelist Validation
  const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
  const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/octet-stream',
  ]);

  const rawExt = file.name ? file.name.split('.').pop()?.toLowerCase() || '' : '';
  if (!ALLOWED_EXTENSIONS.has(rawExt)) {
    return Response.json({ message: 'ประเภทไฟล์ไม่ได้รับอนุญาต (รองรับเฉพาะ JPG, PNG, WEBP, PDF)' }, { status: 400 });
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return Response.json({ message: 'รูปแบบ MIME type ของไฟล์ไม่ถูกต้อง' }, { status: 400 });
  }

  const requestedVisibility = (formData.get('visibility') as string) || 'public';
  const visibility: 'public' | 'private' = requestedVisibility === 'private' ? 'private' : 'public';

  // Only owner can upload private proof documents
  if (visibility === 'private' && session.user.role !== 'owner') {
    return Response.json({ message: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่สามารถอัปโหลดไฟล์หลักฐานส่วนตัวได้ (AC-92)' }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || (rawExt === 'pdf' ? 'application/pdf' : 'image/png');
  const ext = rawExt.replace(/[^a-z0-9]/g, '') || 'png';
  const prefix = visibility === 'private' ? 'proofs' : 'posters';
  const key = `${prefix}/${randomUUID()}.${ext}`;

  const { url } = await storage.put(key, buffer, contentType, visibility);
  return Response.json({ url, key }, { status: 201 });
}
