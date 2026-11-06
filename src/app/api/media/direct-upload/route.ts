import { validateUploadedFile } from '@/server/file-validator';
import { storage } from '@/server/storage';
import { MAX_FILE_SIZE } from '@/server/upload-quota';

export const runtime = 'nodejs';

function normalizeMime(mime: string): string {
  const m = mime.trim().toLowerCase();
  if (m === 'image/jpg') return 'image/jpeg';
  return m;
}

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const token = url.searchParams.get('token');

  if (!key || !token) {
    return Response.json({ message: 'พารามิเตอร์ key หรือ token ไม่ถูกต้อง' }, { status: 400 });
  }

  // Verify presigned token in memory store
  const tokenInfo = storage.verifyPresignedToken?.(token, key);
  if (!tokenInfo?.valid) {
    return Response.json({ message: 'ลิงก์อัปโหลดไม่ถูกต้องหรือหมดอายุแล้ว' }, { status: 403 });
  }

  // Security Item 18: Consume token immediately before reading stream or writing to storage
  // This guarantees single-use and prevents concurrent race conditions (TOCTOU)
  storage.consumePresignedToken?.(token);

  // Pre-check Content-Length against token size bound
  const allowedMax = tokenInfo.maxFileSizeBytes || MAX_FILE_SIZE;
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const length = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(length) && length > allowedMax) {
      return Response.json(
        { message: `ขนาดไฟล์เกินขีดจำกัดสูงสุด (Payload Too Large: สูงสุด ${allowedMax} ไบต์)` },
        { status: 413 },
      );
    }
  }

  // Pre-check Content-Type header against presigned token contentType if specified
  const tokenContentType = tokenInfo.contentType ? normalizeMime(tokenInfo.contentType) : undefined;
  const rawReqContentType = request.headers.get('content-type');
  const reqContentType = rawReqContentType
    ? normalizeMime(rawReqContentType.split(';')[0])
    : undefined;

  if (tokenContentType && reqContentType && reqContentType !== tokenContentType) {
    return Response.json(
      {
        message: `ประเภทไฟล์ในส่วนหัวคำขอไม่ตรงกับที่ระบุในคำขออัปโหลด (Expected: ${tokenContentType}, Got: ${reqContentType})`,
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > allowedMax) {
    return Response.json(
      { message: `ขนาดไฟล์เกินขีดจำกัดสูงสุด (Payload Too Large: สูงสุด ${allowedMax} ไบต์)` },
      { status: 413 },
    );
  }

  const claimedContentType =
    tokenContentType || reqContentType || 'application/octet-stream';
  const visibility = tokenInfo.visibility || 'public';
  const filename = key.split('/').pop() || 'file';

  const validation = validateUploadedFile(buffer, claimedContentType, filename, visibility);
  if (!validation.valid) {
    return Response.json({ message: validation.error }, { status: 400 });
  }

  // Ensure detected MIME from magic bytes strictly matches presigned token contentType
  if (
    tokenContentType &&
    validation.detectedContentType &&
    normalizeMime(validation.detectedContentType) !== tokenContentType
  ) {
    return Response.json(
      {
        message: `เนื้อหาไฟล์จริงไม่ตรงกับประเภทที่ได้รับอนุญาตในลิงก์อัปโหลด (Expected: ${tokenContentType}, Detected: ${validation.detectedContentType})`,
      },
      { status: 400 },
    );
  }

  const finalContentType = validation.detectedContentType || claimedContentType;
  const { url: publicUrl } = await storage.put(key, buffer, finalContentType, visibility);

  return Response.json({ success: true, key, url: publicUrl }, { status: 200 });
}
