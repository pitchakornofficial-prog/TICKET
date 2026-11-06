import type { Pool } from 'pg';
import { getAuth } from '@/server/auth';
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

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ message: 'ข้อมูลคำขอไม่ถูกต้อง' }, { status: 400 });
  }

  return handlePresignedRequest(session.user, body, pool);
}
