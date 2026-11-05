import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';

export function getScannerEventScopeCookie(
  cookieHeader: string | null | undefined,
  secret: string,
): string | null {
  if (!cookieHeader) return null;
  const cookieMap = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  const scopeVal = cookieMap.scanner_event_scope;
  if (!scopeVal) return null;
  const lastDot = scopeVal.lastIndexOf('.');
  if (lastDot === -1) return null;
  const eventId = scopeVal.slice(0, lastDot);
  const sig = scopeVal.slice(lastDot + 1);
  const expectedSig = createHmac('sha256', secret).update(eventId).digest('base64');
  if (sig !== expectedSig) return null;
  return eventId;
}

export function signScannerEventScopeCookie(eventId: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(eventId).digest('base64');
  return `${eventId}.${sig}`;
}

export async function verifyScannerSessionEventScope(
  pool: Pool,
  role: string,
  cookieHeader: string | null | undefined,
  secret: string,
  target: { eventId?: string; sessionId?: string },
): Promise<{ allowed: boolean; reason?: string }> {
  if (role !== 'scanner') {
    return { allowed: true };
  }
  const scopedEventId = getScannerEventScopeCookie(cookieHeader, secret);
  if (!scopedEventId) {
    return { allowed: true };
  }

  if (target.eventId && target.eventId !== scopedEventId) {
    return {
      allowed: false,
      reason: 'ไม่อนุญาต: เซสชันการสแกนนี้ถูกจำกัดสิทธิ์เฉพาะงานคอนเสิร์ตที่ได้รับมอบหมายเท่านั้น',
    };
  }

  if (target.sessionId) {
    const sRes = await pool.query<{ eventId: string }>(
      'SELECT "eventId" FROM event_sessions WHERE id = $1',
      [target.sessionId],
    );
    if (sRes.rowCount === 0 || sRes.rows[0].eventId !== scopedEventId) {
      return {
        allowed: false,
        reason: 'ไม่อนุญาต: เซสชันการสแกนนี้ถูกจำกัดสิทธิ์เฉพาะงานคอนเสิร์ตที่ได้รับมอบหมายเท่านั้น',
      };
    }
  }

  return { allowed: true };
}
