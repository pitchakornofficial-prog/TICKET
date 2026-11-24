import { randomUUID } from 'node:crypto';
import { getAuth } from '@/server/auth';
import { assertSameOrigin } from '@/server/origin';
import { storage } from '@/server/storage';
import { readBoundedFormData } from '@/server/upload-quota';

export const runtime = 'nodejs';

const MAX_FONT_FILE_BYTES = 2 * 1024 * 1024; // 2MB font limit
const MAX_FONT_REQUEST_BYTES = 2.5 * 1024 * 1024; // Multipart overhead cap

const FONT_MIME_MAP: Record<'ttf' | 'otf' | 'woff' | 'woff2', string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

function hasValidFontMagicBytes(buffer: Buffer, ext: 'ttf' | 'otf' | 'woff' | 'woff2'): boolean {
  if (buffer.byteLength < 4) return false;
  const b0 = buffer[0];
  const b1 = buffer[1];
  const b2 = buffer[2];
  const b3 = buffer[3];

  switch (ext) {
    case 'woff2':
      // wOF2 -> 0x77 0x4F 0x46 0x32
      return b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x32;
    case 'woff':
      // wOFF -> 0x77 0x4F 0x46 0x46
      return b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x46;
    case 'otf':
      // OTTO -> 0x4F 0x54 0x54 0x4F
      return b0 === 0x4f && b1 === 0x54 && b2 === 0x54 && b3 === 0x4f;
    case 'ttf':
      // 0x00 0x01 0x00 0x00 (TrueType sfnt) or 0x74 0x72 0x75 0x65 ('true')
      return (
        (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) ||
        (b0 === 0x74 && b1 === 0x72 && b2 === 0x75 && b3 === 0x65)
      );
    default:
      return false;
  }
}

function sanitizeFontDisplayName(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const cleaned = withoutExt
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
  return cleaned || 'CustomTicketFont';
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json(
      { message: 'เฉพาะเจ้าของระบบ (Owner) เท่านั้นที่สามารถอัปโหลดฟอนต์ได้' },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await readBoundedFormData(request, MAX_FONT_REQUEST_BYTES);
  } catch (err) {
    const msg = (err as Error)?.message;
    if (msg === 'PAYLOAD_TOO_LARGE') {
      return Response.json(
        { message: 'ขนาดไฟล์ฟอนต์เกินกำหนด (สูงสุด 2MB)' },
        { status: 413 },
      );
    }
    return Response.json({ message: 'ไม่สามารถอ่านข้อมูลไฟล์ฟอนต์ได้' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return Response.json({ message: 'ไม่พบไฟล์ฟอนต์ในคำขอ' }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_FONT_FILE_BYTES) {
    return Response.json(
      { message: 'ขนาดไฟล์ฟอนต์ต้องไม่เกิน 2MB' },
      { status: 400 },
    );
  }

  const originalName = typeof (file as File).name === 'string' && (file as File).name
    ? (file as File).name
    : 'custom-font.woff2';
  const parts = originalName.split('.');
  const rawExt = parts.length > 1 ? (parts.pop()?.toLowerCase() ?? '') : '';

  if (rawExt !== 'ttf' && rawExt !== 'otf' && rawExt !== 'woff' && rawExt !== 'woff2') {
    return Response.json(
      { message: 'รองรับเฉพาะไฟล์ฟอนต์ .ttf, .otf, .woff และ .woff2 เท่านั้น' },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasValidFontMagicBytes(buffer, rawExt)) {
    return Response.json(
      { message: 'เนื้อหาไฟล์ไม่ตรงตามมาตรฐานฟอนต์ที่รองรับ' },
      { status: 400 },
    );
  }

  const contentType = FONT_MIME_MAP[rawExt];
  const key = `ticket-fonts/${randomUUID()}.${rawExt}`;
  const saved = await storage.put(key, buffer, contentType, 'public');
  const fontName = sanitizeFontDisplayName(originalName);

  return Response.json({ url: saved.url, fontName }, { status: 200 });
}
