import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { getAuth } from '@/server/auth';
import { validateUploadedFile } from '@/server/file-validator';
import { storage } from '@/server/storage';
import {
  MAX_FILE_SIZE,
  MAX_JSON_BODY_SIZE,
  MAX_REQUEST_BODY_SIZE,
  checkAndReserveUploadQuota,
  readBoundedFormData,
  readBoundedJson,
  releaseUploadQuota,
  validateUploadContentLength,
} from '@/server/upload-quota';

export const runtime = 'nodejs';

export async function handlePresignedRequest(
  user: { id: string; role: string },
  body: unknown,
  pool?: Pool,
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

  // Atomic quota reservation in shared store
  const quota = await checkAndReserveUploadQuota(pool, user.id, size);
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

  // Bound the presigned upload URL strictly to the reserved size
  const presigned = await storage.createPresignedUploadUrl(
    key,
    normalizedContentType,
    visibility,
    size,
  );

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

  let pool: Pool | undefined;
  try {
    pool = (auth.options as { database?: Pool }).database;
  } catch {
    //
  }

  // 1. Early request size check via Content-Length header (DoS / OOM Prevention)
  const contentLength = request.headers.get('content-length');
  const lengthCheck = validateUploadContentLength(contentLength);
  if (!lengthCheck.valid) {
    return Response.json({ message: lengthCheck.error }, { status: lengthCheck.status ?? 400 });
  }

  // 2. Check for Presigned URL request mode (JSON payload)
  const contentTypeHeader = request.headers.get('content-type') || '';
  if (contentTypeHeader.includes('application/json')) {
    let body: unknown;
    try {
      body = await readBoundedJson(request, MAX_JSON_BODY_SIZE);
    } catch (err) {
      const errorMsg = (err as Error)?.message;
      if (errorMsg === 'PAYLOAD_TOO_LARGE') {
        return Response.json(
          { message: 'ขนาดคำขอ JSON เกินขีดจำกัดสูงสุด (Payload Too Large: สูงสุด 1MB)' },
          { status: 413 },
        );
      }
      return Response.json(
        { message: 'ข้อมูลคำขอไม่ถูกต้อง (รูปแบบ JSON ไม่ถูกต้อง)' },
        { status: 400 },
      );
    }
    return handlePresignedRequest(session.user, body, pool);
  }

  // 3. Read body stream with a hard byte ceiling (stops infinite/chunked memory exhaustion)
  let formData: FormData;
  try {
    formData = await readBoundedFormData(request, MAX_REQUEST_BODY_SIZE);
  } catch (err) {
    const errorMsg = (err as Error)?.message;
    if (errorMsg === 'PAYLOAD_TOO_LARGE') {
      return Response.json(
        { message: 'ขนาดคำขอเกินขีดจำกัดสูงสุด (Payload Too Large: สูงสุด 16MB)' },
        { status: 413 },
      );
    }
    return Response.json({ message: 'เกิดข้อผิดพลาดในการอ่านข้อมูลคำขอ' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return Response.json({ message: 'ไม่พบไฟล์' }, { status: 400 });
  }

  // Pre-check Blob size against single-file limit
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ message: 'ขนาดไฟล์เกินขีดจำกัด (สูงสุด 15MB)' }, { status: 400 });
  }

  // 4. Atomically check and reserve upload quota in shared store
  const quota = await checkAndReserveUploadQuota(pool, session.user.id, file.size);
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

  const requestedVisibility = (formData.get('visibility') as string) || 'public';
  const visibility: 'public' | 'private' = requestedVisibility === 'private' ? 'private' : 'public';

  // Only owner can upload private proof documents
  if (visibility === 'private' && session.user.role !== 'owner') {
    await releaseUploadQuota(pool, quota.reservationId);
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
    await releaseUploadQuota(pool, quota.reservationId);
    return Response.json({ message: validation.error }, { status: 400 });
  }

  const finalContentType = validation.detectedContentType || 'application/octet-stream';
  const finalExt = validation.normalizedExtension || 'png';
  const prefix = visibility === 'private' ? 'proofs' : 'posters';
  const key = `${prefix}/${randomUUID()}.${finalExt}`;

  const { url } = await storage.put(key, buffer, finalContentType, visibility);

  return Response.json({ url, key }, { status: 201 });
}
