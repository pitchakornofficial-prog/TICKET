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
  return new Response(new Uint8Array(item.data), {
    status: 200,
    headers: {
      'Content-Type': item.contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
