import type { Pool } from 'pg';
import { getAuth } from '@/server/auth';
import { MAX_JSON_BODY_SIZE, readBoundedJson } from '@/server/upload-quota';
import { handlePresignedRequest } from '../route';

export const runtime = 'nodejs';

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
