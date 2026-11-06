import { randomUUID } from 'node:crypto';
import { getAuth } from '@/server/auth';
import { validateUploadedFile } from '@/server/file-validator';
import { storage } from '@/server/storage';
import {
  MAX_FILE_SIZE,
  checkUploadQuota,
  recordUploadUsage,
  validateUploadContentLength,
} from '@/server/upload-quota';

export const runtime = 'nodejs';

export async function handlePresignedRequest(
  user: { id: string; role: string },
  body: unknown,
): Promise<Response> {
  if (!body || typeof body !== 'object') {
    return Response.json({ message: 'ข้อมูลคำขอไม่ถูกต้อง' }, { status: 400 });
  }

  const { filename, contentType, fileSize, visibility: reqVisibility } = body as {
    filename?: string;
    contentType?: string;
    fileSize?: number;
    visibility?: string;
  };

  if (!filename || typeof filename !== 'string' || !contentType || typeof contentType !== 'string') {
    return Response.json(
      { message: 'กรุณาระบุชื่อไฟล์และประเภทไฟล์ (filename, contentType)' },
      { status: 400 },
    );
  }

  const visibility: 'public' | 'private' = reqVisibility === 'private' ? 'private' : 'public';
  if (visibility === 'private' && user.role !== 'owner') {
    return Response.json(
      { message: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่สามารถอัปโหลดไฟล์หลักฐานส่วนตัวได้ (AC-92)' },
      { status: 403 },
    );
  }

  const parts = filename.split('.');
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  const ALLOWED_PUBLIC_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
  const ALLOWED_PRIVATE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
  const allowedSet = visibility === 'private' ? ALLOWED_PRIVATE_EXTENSIONS : ALLOWED_PUBLIC_EXTENSIONS;

  if (!ext || !allowedSet.has(ext)) {
    return Response.json({ message: 'ประเภทไฟล์ไม่ถูกต้องตามที่ได้รับอนุญาต' }, { status: 400 });
  }

  const normalizedContentType = contentType.trim().toLowerCase();
  const dangerousTypes = [
    'text/html',
    'image/svg+xml',
    'text/javascript',
    'application/javascript',
    'application/x-sh',
  ];
  if (dangerousTypes.includes(normalizedContentType)) {
    return Response.json({ message: 'ประเภทไฟล์ไม่ถูกต้อง ไม่อนุญาตให้ใช้ไฟล์ประเภทนี้' }, { status: 400 });
  }

  const size = typeof fileSize === 'number' && fileSize > 0 ? fileSize : 1024 * 1024;
  if (size > MAX_FILE_SIZE) {
    return Response.json({ message: 'ขนาดไฟล์เกินขีดจำกัด (สูงสุด 15MB)' }, { status: 400 });
  }

  const quota = checkUploadQuota(user.id, size);
  if (!quota.allowed) {
    return Response.json(
      { message: quota.reason },
      {
        status: 429,
        headers: quota.retryAfterSeconds
          ? { 'Retry-After': String(quota.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  const prefix = visibility === 'private' ? 'proofs' : 'posters';
  const key = `${prefix}/${randomUUID()}.${ext}`;

  const presigned = await storage.createPresignedUploadUrl(key, normalizedContentType, visibility);
  recordUploadUsage(user.id, size);

  return Response.json(
    {
      ...presigned,
      url: presigned.publicUrl,
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || (session.user.role !== 'organizer' && session.user.role !== 'owner')) {
    return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
  }

  // 1. Early request size check via Content-Length header (DoS / OOM Prevention)
  const contentLength = request.headers.get('content-length');
  const lengthCheck = validateUploadContentLength(contentLength);
  if (!lengthCheck.valid) {
    return Response.json({ message: lengthCheck.error }, { status: lengthCheck.status ?? 400 });
  }

  // 2. Account rate limit / upload quota check before reading body
  const quotaCheck = checkUploadQuota(session.user.id);
  if (!quotaCheck.allowed) {
    return Response.json(
      { message: quotaCheck.reason },
      {
        status: 429,
        headers: quotaCheck.retryAfterSeconds
          ? { 'Retry-After': String(quotaCheck.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  // 3. Check for Presigned URL request mode (JSON payload)
  const contentTypeHeader = request.headers.get('content-type') || '';
  if (contentTypeHeader.includes('application/json')) {
    const body = await request.json().catch(() => null);
    return handlePresignedRequest(session.user, body);
  }

  // 4. Multipart form data parsing
  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof Blob)) {
    return Response.json({ message: 'ไม่พบไฟล์' }, { status: 400 });
  }

  // Blob size pre-check
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ message: 'ขนาดไฟล์เกินขีดจำกัด (สูงสุด 15MB)' }, { status: 400 });
  }

  // Account quota check with file size
  const sizeQuotaCheck = checkUploadQuota(session.user.id, file.size);
  if (!sizeQuotaCheck.allowed) {
    return Response.json(
      { message: sizeQuotaCheck.reason },
      {
        status: 429,
        headers: sizeQuotaCheck.retryAfterSeconds
          ? { 'Retry-After': String(sizeQuotaCheck.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  const requestedVisibility = (formData.get('visibility') as string) || 'public';
  const visibility: 'public' | 'private' = requestedVisibility === 'private' ? 'private' : 'public';

  // Only owner can upload private proof documents
  if (visibility === 'private' && session.user.role !== 'owner') {
    return Response.json(
      { message: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่สามารถอัปโหลดไฟล์หลักฐานส่วนตัวได้ (AC-92)' },
      { status: 403 },
    );
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

  // Record upload usage against quota
  recordUploadUsage(session.user.id, buffer.length);

  return Response.json({ url, key }, { status: 201 });
}
