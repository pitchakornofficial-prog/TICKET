import { validateUploadedFile } from '@/server/file-validator';
import { storage } from '@/server/storage';
import { MAX_FILE_SIZE } from '@/server/upload-quota';

export const runtime = 'nodejs';

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

  // Pre-check Content-Length
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const length = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(length) && length > MAX_FILE_SIZE) {
      return Response.json(
        { message: 'ขนาดไฟล์เกินขีดจำกัดสูงสุด (Payload Too Large: สูงสุด 15MB)' },
        { status: 413 },
      );
    }
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAX_FILE_SIZE) {
    return Response.json(
      { message: 'ขนาดไฟล์เกินขีดจำกัดสูงสุด (Payload Too Large: สูงสุด 15MB)' },
      { status: 413 },
    );
  }

  const claimedContentType =
    tokenInfo.contentType || request.headers.get('content-type') || 'application/octet-stream';
  const visibility = tokenInfo.visibility || 'public';
  const filename = key.split('/').pop() || 'file';

  const validation = validateUploadedFile(buffer, claimedContentType, filename, visibility);
  if (!validation.valid) {
    return Response.json({ message: validation.error }, { status: 400 });
  }

  const finalContentType = validation.detectedContentType || claimedContentType;
  const { url: publicUrl } = await storage.put(key, buffer, finalContentType, visibility);

  storage.consumePresignedToken?.(token);

  return Response.json({ success: true, key, url: publicUrl }, { status: 200 });
}
