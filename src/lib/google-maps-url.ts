const ALLOWED_EXACT_MAPS_HOSTS = new Set([
  'maps.google.com',
  'maps.google.co.th',
  'maps.app.goo.gl',
]);

const ALLOWED_MAPS_PATH_HOSTS = new Set([
  'www.google.com',
  'google.com',
  'www.google.co.th',
  'google.co.th',
  'goo.gl',
]);

/**
 * Validates and normalizes a Google Maps URL for server-side persistence.
 * Accepts empty/nullish values (returning null) or https:// URLs on allowed Google Maps hosts.
 */
export function parseSafeGoogleMapsUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('ลิงก์ Google Maps ไม่ถูกต้อง กรุณาระบุ URL ที่ขึ้นต้นด้วย https://');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('ลิงก์ Google Maps ต้องใช้โปรโตคอล https:// เท่านั้น');
  }

  const host = parsed.hostname.toLowerCase();
  const isAllowedHost =
    ALLOWED_EXACT_MAPS_HOSTS.has(host) ||
    (ALLOWED_MAPS_PATH_HOSTS.has(host) && parsed.pathname.startsWith('/maps'));

  if (!isAllowedHost) {
    throw new Error(
      'ลิงก์ Google Maps ต้องเป็นโดเมนของ Google Maps เท่านั้น (เช่น maps.google.com, maps.app.goo.gl)',
    );
  }

  return parsed.toString();
}

/**
 * Client-side sanitizer before rendering googleMapsUrl in <a href>.
 * Returns a safe https:// Google Maps URL or null if invalid/unsafe.
 */
export function sanitizeGoogleMapsUrl(raw: string | null | undefined): string | null {
  try {
    return parseSafeGoogleMapsUrl(raw);
  } catch {
    return null;
  }
}
