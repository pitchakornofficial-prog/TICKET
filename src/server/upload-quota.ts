export const MAX_REQUEST_BODY_SIZE = 16 * 1024 * 1024; // 16MB limit for HTTP request body
export const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB limit for single file payload
export const MAX_UPLOADS_PER_WINDOW = 20; // 20 uploads per window
export const MAX_BYTES_PER_WINDOW = 50 * 1024 * 1024; // 50MB cumulative quota per window
export const UPLOAD_WINDOW_MS = 10 * 60 * 1000; // 10-minute sliding window

interface UploadRecord {
  timestamp: number;
  bytes: number;
}

const userUploadHistory = new Map<string, UploadRecord[]>();

/**
 * Validates Content-Length header before parsing multipart/form-data.
 * Rejects requests with 413 Payload Too Large if Content-Length exceeds MAX_REQUEST_BODY_SIZE.
 */
export function validateUploadContentLength(contentLengthHeader: string | null): {
  valid: boolean;
  error?: string;
  status?: number;
} {
  if (!contentLengthHeader) {
    return { valid: true };
  }

  const length = Number.parseInt(contentLengthHeader.trim(), 10);
  if (Number.isNaN(length) || length < 0) {
    return {
      valid: false,
      error: 'ส่วนหัว Content-Length ไม่ถูกต้อง',
      status: 400,
    };
  }

  if (length > MAX_REQUEST_BODY_SIZE) {
    return {
      valid: false,
      error: 'ขนาดคำขอเกินขีดจำกัดสูงสุด (Payload Too Large: สูงสุด 16MB)',
      status: 413,
    };
  }

  return { valid: true };
}

/**
 * Checks sliding window quota and rate limits for an account.
 */
export function checkUploadQuota(
  userId: string,
  requestedBytes?: number,
  now = Date.now(),
): {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  currentCount: number;
  currentBytes: number;
} {
  const windowStart = now - UPLOAD_WINDOW_MS;
  const history = userUploadHistory.get(userId) || [];

  // Prune expired entries
  const activeHistory = history.filter((entry) => entry.timestamp > windowStart);
  if (activeHistory.length !== history.length) {
    userUploadHistory.set(userId, activeHistory);
  }

  const currentCount = activeHistory.length;
  const currentBytes = activeHistory.reduce((acc, entry) => acc + entry.bytes, 0);

  // Oldest timestamp in window for Retry-After calculation
  const oldestTimestamp = activeHistory[0]?.timestamp || now;
  const retryAfterSeconds = Math.max(1, Math.ceil((oldestTimestamp + UPLOAD_WINDOW_MS - now) / 1000));

  if (currentCount >= MAX_UPLOADS_PER_WINDOW) {
    return {
      allowed: false,
      reason: 'จำนวนการอัปโหลดเกินโควตาที่กำหนด (สูงสุด 20 ไฟล์ต่อ 10 นาที) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
      retryAfterSeconds,
      currentCount,
      currentBytes,
    };
  }

  if (requestedBytes && requestedBytes > 0) {
    if (requestedBytes > MAX_FILE_SIZE) {
      return {
        allowed: false,
        reason: 'ขนาดไฟล์เกินขีดจำกัด (สูงสุด 15MB)',
        currentCount,
        currentBytes,
      };
    }

    if (currentBytes + requestedBytes > MAX_BYTES_PER_WINDOW) {
      return {
        allowed: false,
        reason: 'ปริมาณข้อมูลรวมที่อัปโหลดเกินโควตาที่กำหนด (สูงสุด 50MB ต่อ 10 นาที) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
        retryAfterSeconds,
        currentCount,
        currentBytes,
      };
    }
  }

  return {
    allowed: true,
    currentCount,
    currentBytes,
  };
}

/**
 * Records upload usage for an account.
 */
export function recordUploadUsage(
  userId: string,
  bytes: number,
  now = Date.now(),
): void {
  const windowStart = now - UPLOAD_WINDOW_MS;
  const history = userUploadHistory.get(userId) || [];
  const activeHistory = history.filter((entry) => entry.timestamp > windowStart);
  activeHistory.push({ timestamp: now, bytes: Math.max(0, bytes) });
  userUploadHistory.set(userId, activeHistory);
}

/**
 * Clears upload history (useful for tests).
 */
export function resetUploadUsage(userId?: string): void {
  if (userId) {
    userUploadHistory.delete(userId);
  } else {
    userUploadHistory.clear();
  }
}
