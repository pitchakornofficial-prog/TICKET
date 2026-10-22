import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { storage } from '@/server/storage';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const fullKey = key.map(decodeURIComponent).join('/');
  const item = await storage.get(fullKey);
  if (!item) {
    return new Response('Not found', { status: 404 });
  }

  // AC-92: Private storage boundary - only owner can access private items (proofs, slips)
  if (item.visibility === 'private') {
    const actor = await readActor(getAuth(), await headers());
    if (actor?.role !== 'owner') {
      return new Response('Forbidden: Access restricted to owner only (AC-92)', { status: 403 });
    }
  }

  return new Response(new Uint8Array(item.data), {
    status: 200,
    headers: {
      'Content-Type': item.contentType,
      'Cache-Control': item.visibility === 'private' ? 'private, no-cache' : 'public, max-age=3600',
    },
  });
}
