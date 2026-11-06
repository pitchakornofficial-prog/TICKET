export interface ValidateUploadResult {
  valid: boolean;
  error?: string;
  detectedContentType?: string;
  normalizedExtension?: string;
}

const ALLOWED_PUBLIC_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const ALLOWED_PRIVATE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

/**
 * Detect MIME type and normalized extension from buffer magic bytes.
 */
export function detectMagicBytes(buffer: Buffer): { contentType: string; extension: string } | null {
  if (!buffer || buffer.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { contentType: 'image/png', extension: 'png' };
  }

  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { contentType: 'image/webp', extension: 'webp' };
  }

  // PDF: %PDF-
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  ) {
    return { contentType: 'application/pdf', extension: 'pdf' };
  }

  return null;
}

/**
 * Scan buffer for suspicious script / HTML tags (anti-polyglot defense).
 */
function containsActiveScriptOrHtml(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 4096);
  const sample = buffer.subarray(0, sampleLength).toString('utf-8').toLowerCase();
  return (
    sample.includes('<script') ||
    sample.includes('</script') ||
    sample.includes('<html') ||
    sample.includes('<!doctype') ||
    sample.includes('<svg') ||
    sample.includes('onload=') ||
    sample.includes('onerror=')
  );
}

/**
 * Validates an uploaded file for allowed types, matching magic bytes, and safe content.
 */
export function validateUploadedFile(
  buffer: Buffer,
  _claimedContentType: string,
  originalFilename: string,
  visibility: 'public' | 'private',
): ValidateUploadResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'ไฟล์ว่างเปล่า ไม่สามารถอัปโหลดได้' };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return { valid: false, error: 'ขนาดไฟล์เกินขีดจำกัด (สูงสุด 15MB)' };
  }

  const parts = originalFilename.split('.');
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : '';

  if (!ext) {
    return { valid: false, error: 'ไฟล์ต้องมีนามสกุลที่ถูกต้อง' };
  }

  const allowedExtensions = visibility === 'private' ? ALLOWED_PRIVATE_EXTENSIONS : ALLOWED_PUBLIC_EXTENSIONS;
  if (!allowedExtensions.has(ext)) {
    if (visibility === 'public') {
      return {
        valid: false,
        error: 'ประเภทไฟล์ไม่ถูกต้อง อนุญาตเฉพาะไฟล์ภาพ JPG, PNG, WEBP สำหรับโปสเตอร์คอนเสิร์ตเท่านั้น',
      };
    }
    return {
      valid: false,
      error: 'ประเภทไฟล์ไม่ถูกต้อง อนุญาตเฉพาะไฟล์ภาพ JPG, PNG, WEBP หรือ PDF สำหรับหลักฐานการโอนเงินเท่านั้น',
    };
  }

  const detected = detectMagicBytes(buffer);
  if (!detected) {
    return {
      valid: false,
      error: 'เนื้อหาไฟล์ไม่ตรงกับรูปแบบที่ได้รับอนุญาต หรือไฟล์อาจเสียหาย',
    };
  }

  // Ensure public visibility does not allow PDF
  if (visibility === 'public' && detected.contentType === 'application/pdf') {
    return {
      valid: false,
      error: 'ไม่อนุญาตให้อัปโหลดไฟล์ PDF สำหรับภาพโปสเตอร์สาธารณะ',
    };
  }

  // Cross-check extension against detected format
  if (detected.extension === 'jpg' && !['jpg', 'jpeg'].includes(ext)) {
    return { valid: false, error: 'นามสกุลไฟล์ไม่ตรงกับเนื้อหาจริง (JPEG)' };
  }
  if (detected.extension === 'png' && ext !== 'png') {
    return { valid: false, error: 'นามสกุลไฟล์ไม่ตรงกับเนื้อหาจริง (PNG)' };
  }
  if (detected.extension === 'webp' && ext !== 'webp') {
    return { valid: false, error: 'นามสกุลไฟล์ไม่ตรงกับเนื้อหาจริง (WebP)' };
  }
  if (detected.extension === 'pdf' && ext !== 'pdf') {
    return { valid: false, error: 'นามสกุลไฟล์ไม่ตรงกับเนื้อหาจริง (PDF)' };
  }

  // Anti-polyglot check for images
  if (detected.contentType.startsWith('image/') && containsActiveScriptOrHtml(buffer)) {
    return { valid: false, error: 'พบโค้ดหรือแท็กอันตรายในเนื้อหาไฟล์รูปภาพ' };
  }

  return {
    valid: true,
    detectedContentType: detected.contentType,
    normalizedExtension: detected.extension,
  };
}
